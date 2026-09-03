import "server-only";

import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { writeAuditLogTx } from "@/lib/audit";
import { retryConnectorJob } from "@/lib/kitchen-connector";
import { prisma } from "@/lib/prisma";
import { sendOrderToKitchen } from "@/lib/restaurant-kitchen";
import { menuExclusionReason } from "@/lib/restaurant-menu-manager";
import { RestaurantDomainError } from "@/lib/restaurant";
import { addOrderLine, openOrder } from "@/lib/restaurant-orders";

type Actor = { companyId: string; locationId: string; userId: string };

export async function getOperationalRestaurantFloor(companyId: string, locationId: string) {
  const [areas, orders, menu, mappings] = await Promise.all([
    prisma.restaurantArea.findMany({ where: { companyId, locationId, active: true, deletedAt: null }, include: { tables: { where: { active: true, deletedAt: null }, orderBy: { code: "asc" } } }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.restaurantOrder.findMany({
      where: { companyId, locationId, serviceType: "DINE_IN", status: { notIn: ["CLOSED", "CANCELLED"] } },
      include: {
        tables: true,
        lines: { where: { status: { not: "CANCELLED" } }, orderBy: { createdAt: "asc" }, include: { ticketLines: { include: { ticket: { include: { printJobs: { orderBy: { createdAt: "desc" } } } } } } } },
      },
      orderBy: { openedAt: "asc" },
    }),
    prisma.restaurantMenu.findFirst({
      where: { companyId, locationId, code: "FRISA_BISTRO", active: true, deletedAt: null },
      include: { sections: { where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { items: { where: { visible: true, available: true, item: { active: true, sellable: true, deletedAt: null } }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], include: { item: { select: { id: true, name: true, salePrice: true } } } } } } },
    }),
    prisma.fusionCatalogMapping.findMany({ where: { companyId, locationId, missingFromFusion: false }, select: { itemId: true, plu: true } }),
  ]);
  const mappingByItem = new Map(mappings.map((mapping) => [mapping.itemId, mapping.plu]));
  const sections = (menu?.sections ?? []).map((section) => ({
    id: section.id,
    name: section.name,
    products: section.items.flatMap((row) => {
      const plu = mappingByItem.get(row.itemId), price = row.item.salePrice?.toNumber() ?? null;
      if (plu === undefined || menuExclusionReason({ plu, name: row.item.name, price })) return [];
      return [{ id: row.item.id, name: row.item.name, plu, price }];
    }),
  }));
  const shapedOrders = orders.map((order) => ({
    id: order.id,
    code: order.code,
    guestCount: order.guestCount,
    tableIds: [...new Set([...order.tables.map(({ tableId }) => tableId), ...(order.tableId ? [order.tableId] : [])])],
    total: order.lines.reduce((sum, line) => sum + Number(line.lineTotal), 0),
    unsentCount: order.lines.filter((line) => Number(line.quantity) > Number(line.sentQuantity)).length,
    lines: order.lines.map((line) => {
      const jobs = line.ticketLines.flatMap(({ ticket }) => ticket.printJobs).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const job = jobs[0], error = job?.lastError ?? null;
      const uncertain = Boolean(error && /FUSION_UNCERTAIN_DELIVERY|UNCERTAIN_PRINT_OUTCOME/i.test(error));
      const state: "PENDING" | "SENDING" | "SENT" | "ERROR" | "UNCERTAIN" = Number(line.quantity) > Number(line.sentQuantity) ? "PENDING" : uncertain ? "UNCERTAIN" : job?.status === "FAILED" ? "ERROR" : job?.status === "PENDING" || job?.status === "PROCESSING" ? "SENDING" : "SENT";
      return { id: line.id, itemId: line.itemId, name: line.productName, quantity: Number(line.quantity), sentQuantity: Number(line.sentQuantity), unitPrice: Number(line.unitPrice), lineTotal: Number(line.lineTotal), kitchenNotes: line.kitchenNotes, state, retryJobId: state === "ERROR" ? job?.id ?? null : null };
    }),
  }));
  return {
    areas: areas.map((area) => ({ id: area.id, name: area.name, tables: area.tables.map((table) => ({ id: table.id, code: table.code, name: table.name, seats: table.seats, status: table.status })) })),
    orders: shapedOrders,
    menu: { id: menu?.id ?? null, sections },
  };
}

export async function openFloorTable(actor: Actor, tableId: string, guestCount: number) {
  if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > 999) throw new RestaurantDomainError("Numero coperti non valido.");
  return openOrder(actor.companyId, actor.locationId, actor.userId, { tableId, guestCount, serviceType: "DINE_IN" });
}

async function editableLine(tx: Prisma.TransactionClient, actor: Actor, orderId: string, lineId: string) {
  const line = await tx.restaurantOrderLine.findFirst({ where: { id: lineId, companyId: actor.companyId, locationId: actor.locationId, orderId, status: "NEW", sentQuantity: 0 }, include: { order: true } });
  if (!line || !["OPEN", "SENT", "IN_PROGRESS"].includes(line.order.status)) throw new RestaurantDomainError("Una riga già inviata non può essere modificata.");
  return line;
}

export async function addFloorOrderItem(actor: Actor, orderId: string, itemId: string) {
  const existing = await prisma.restaurantOrderLine.findFirst({ where: { companyId: actor.companyId, locationId: actor.locationId, orderId, itemId, status: "NEW", sentQuantity: 0 }, orderBy: { createdAt: "desc" } });
  if (existing) return updateUnsentFloorLine(actor, orderId, existing.id, { quantity: Number(existing.quantity) + 1 });
  const line = await addOrderLine(actor.companyId, actor.locationId, orderId, { itemId, quantity: 1 });
  await writeAuditLogTx(prisma, { ...actor, action: "RESTAURANT_ORDER_LINE_ADDED", entityType: "RestaurantOrderLine", entityId: line.id, metadata: { orderId, itemId, quantity: 1 } });
  return line;
}

export async function updateUnsentFloorLine(actor: Actor, orderId: string, lineId: string, change: { quantity?: number; kitchenNotes?: string }) {
  return prisma.$transaction(async (tx) => {
    const line = await editableLine(tx, actor, orderId, lineId);
    if (change.quantity !== undefined && (!Number.isFinite(change.quantity) || change.quantity < 1 || change.quantity > 999)) throw new RestaurantDomainError("Quantità non valida.");
    const data = { quantity: change.quantity ?? line.quantity, lineTotal: change.quantity === undefined ? line.lineTotal : Math.round((change.quantity * Number(line.unitPrice) + Number.EPSILON) * 100) / 100, kitchenNotes: change.kitchenNotes === undefined ? line.kitchenNotes : change.kitchenNotes.trim().slice(0, 500) || null };
    await tx.restaurantOrderLine.update({ where: { id: line.id }, data });
    await writeAuditLogTx(tx, { ...actor, action: "RESTAURANT_ORDER_LINE_UPDATED", entityType: "RestaurantOrderLine", entityId: line.id, metadata: { orderId, previous: { quantity: Number(line.quantity), kitchenNotes: line.kitchenNotes }, next: { quantity: Number(data.quantity), kitchenNotes: data.kitchenNotes } } });
    return { id: line.id };
  });
}

export async function deleteUnsentFloorLine(actor: Actor, orderId: string, lineId: string) {
  return prisma.$transaction(async (tx) => {
    const line = await editableLine(tx, actor, orderId, lineId);
    await tx.restaurantOrderLine.update({ where: { id: line.id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    await writeAuditLogTx(tx, { ...actor, action: "RESTAURANT_ORDER_LINE_REMOVED", entityType: "RestaurantOrderLine", entityId: line.id, metadata: { orderId, quantity: Number(line.quantity) } });
    return { id: line.id };
  });
}

export async function updateFloorGuestCount(actor: Actor, orderId: string, guestCount: number) {
  if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > 999) throw new RestaurantDomainError("Numero coperti non valido.");
  return prisma.$transaction(async (tx) => {
    const order = await tx.restaurantOrder.findFirst({ where: { id: orderId, companyId: actor.companyId, locationId: actor.locationId, status: { notIn: ["CLOSED", "CANCELLED"] } } });
    if (!order) throw new RestaurantDomainError("Comanda non valida.");
    await tx.restaurantOrder.update({ where: { id: order.id }, data: { guestCount, updatedById: actor.userId } });
    await writeAuditLogTx(tx, { ...actor, action: "RESTAURANT_ORDER_GUEST_COUNT_CHANGED", entityType: "RestaurantOrder", entityId: order.id, metadata: { previous: order.guestCount, next: guestCount } });
    return { id: order.id };
  });
}

export async function dispatchFloorOrder(actor: Actor, orderId: string, idempotencyKey: string) {
  if (!idempotencyKey || idempotencyKey.length > 200) throw new RestaurantDomainError("Chiave invio non valida.");
  return sendOrderToKitchen(actor.companyId, actor.locationId, orderId, actor.userId, `floor:${idempotencyKey}`);
}

export async function retrySafeFloorJob(actor: Actor, jobId: string) {
  return retryConnectorJob(actor.companyId, actor.locationId, jobId, actor.userId);
}

export const newFloorDispatchKey = () => randomUUID();
