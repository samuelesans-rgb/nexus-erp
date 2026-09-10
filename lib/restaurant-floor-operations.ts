import "server-only";

import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { writeAuditLogTx } from "@/lib/audit";
import { retryConnectorJob } from "@/lib/kitchen-connector";
import { prisma } from "@/lib/prisma";
import { sendOrderToKitchen } from "@/lib/restaurant-kitchen";
import { restaurantMenuEligibleItemWhere } from "@/lib/restaurant-menu-eligibility";
import { menuExclusionReason } from "@/lib/restaurant-menu-manager";
import { RestaurantDomainError } from "@/lib/restaurant";
import { lockRestaurantResources } from "@/lib/restaurant-locking";
import { addOrderLine, assignOrderPartner, openOrder } from "@/lib/restaurant-orders";

type Actor = { companyId: string; locationId: string; userId: string };

// Use the same operational eligibility for display and add-item requests.
// Unresolved catalog imports remain available to Menu Manager, not Sala.
function floorMenuItemWhere(companyId: string): Prisma.RestaurantMenuItemWhereInput {
  return {
    companyId,
    visible: true,
    available: true,
    item: {
      companyId,
      ...restaurantMenuEligibleItemWhere,
      category: { companyId, active: true, deletedAt: null },
      vatRate: { companyId, active: true, deletedAt: null },
    },
  };
}

export async function getOperationalRestaurantFloor(
  companyId: string,
  locationId: string,
) {
  const [areas, orders, menu, mappings] = await Promise.all([
    prisma.restaurantArea.findMany({
      where: { companyId, locationId, active: true, deletedAt: null },
      include: {
        tables: {
          where: { active: true, visibleInFloor: true, deletedAt: null },
          orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
        },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.restaurantOrder.findMany({
      where: {
        companyId,
        locationId,
        serviceType: "DINE_IN",
        status: { notIn: ["CLOSED", "CANCELLED"] },
      },
      include: {
        tables: true,
        partner: { select: { id: true, name: true, displayName: true } },
        lines: {
          where: { status: { not: "CANCELLED" } },
          orderBy: { createdAt: "asc" },
          include: {
            modifiers: true,
            ticketLines: {
              include: {
                ticket: {
                  include: { printJobs: { orderBy: { createdAt: "desc" } } },
                },
              },
            },
          },
        },
      },
      orderBy: { openedAt: "asc" },
    }),
    prisma.restaurantMenu.findFirst({
      where: {
        companyId,
        locationId,
        code: "FRISA_BISTRO",
        active: true,
        deletedAt: null,
      },
      include: {
        sections: {
          where: { active: true },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          include: {
            items: {
              where: floorMenuItemWhere(companyId),
              orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
              include: {
                item: {
                  select: {
                    id: true,
                    name: true,
                    salePrice: true,
                    restaurantModifierGroups: {
                      where: { active: true, deletedAt: null },
                      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
                      include: {
                        modifiers: {
                          where: { locationId, active: true, deletedAt: null },
                          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.fusionCatalogMapping.findMany({
      where: { companyId, locationId, missingFromFusion: false },
      select: { itemId: true, plu: true },
    }),
  ]);
  const mappingByItem = new Map(
    mappings.map((mapping) => [mapping.itemId, mapping.plu]),
  );
  const sections = (menu?.sections ?? []).map((section) => ({
    id: section.id,
    name: section.name,
    products: section.items.flatMap((row) => {
      const plu = mappingByItem.get(row.itemId),
        price = row.item.salePrice?.toNumber() ?? null;
      if (
        plu === undefined ||
        menuExclusionReason({ plu, name: row.item.name, price })
      )
        return [];
      return [
        {
          id: row.item.id,
          name: row.item.name,
          plu,
          price,
          modifierGroups: row.item.restaurantModifierGroups.map((group) => ({
            id: group.id,
            name: group.name,
            required: group.required,
            minSelections: group.minSelections,
            maxSelections: group.maxSelections,
            modifiers: group.modifiers.map((modifier) => ({
              id: modifier.id,
              name: modifier.name,
              kitchenLabel: modifier.kitchenLabel,
              priceDelta: Number(modifier.priceDelta),
            })),
          })),
        },
      ];
    }),
  }));
  const shapedOrders = orders.map((order) => ({
    id: order.id,
    code: order.code,
    guestCount: order.guestCount,
    partnerId: order.partnerId,
    partnerName: order.partner
      ? (order.partner.displayName ?? order.partner.name)
      : null,
    billed: Boolean(order.documentId),
    tableIds: [
      ...new Set([
        ...order.tables.map(({ tableId }) => tableId),
        ...(order.tableId ? [order.tableId] : []),
      ]),
    ],
    total: order.lines.reduce((sum, line) => sum + Number(line.lineTotal), 0),
    unsentCount: order.lines.filter(
      (line) => Number(line.quantity) > Number(line.sentQuantity),
    ).length,
    lines: order.lines.map((line) => {
      const jobs = line.ticketLines
        .flatMap(({ ticket }) => ticket.printJobs)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const job = jobs[0],
        error = job?.lastError ?? null;
      const uncertain = Boolean(
        error &&
        /FUSION_UNCERTAIN_DELIVERY|UNCERTAIN_PRINT_OUTCOME/i.test(error),
      );
      const state: "PENDING" | "SENDING" | "SENT" | "ERROR" | "UNCERTAIN" =
        Number(line.quantity) > Number(line.sentQuantity)
          ? "PENDING"
          : uncertain
            ? "UNCERTAIN"
            : job?.status === "FAILED"
              ? "ERROR"
              : job?.status === "PENDING" || job?.status === "PROCESSING"
                ? "SENDING"
                : "SENT";
      return {
        id: line.id,
        itemId: line.itemId,
        name: line.productName,
        quantity: Number(line.quantity),
        sentQuantity: Number(line.sentQuantity),
        unitPrice: Number(line.unitPrice),
        lineTotal: Number(line.lineTotal),
        kitchenNotes: line.kitchenNotes,
        modifiers: line.modifiers.map((modifier) => ({
          id: modifier.id,
          name: modifier.name,
          kitchenLabel: modifier.kitchenLabel,
          priceDelta: Number(modifier.priceDelta),
        })),
        state,
        retryJobId: state === "ERROR" ? (job?.id ?? null) : null,
      };
    }),
  }));
  return {
    areas: areas.map((area) => ({
      id: area.id,
      name: area.name,
      layoutWidth: area.layoutWidth,
      layoutHeight: area.layoutHeight,
      backgroundImage: area.backgroundImage,
      backgroundOpacity: Number(area.backgroundOpacity),
      tables: area.tables.map((table) => ({
        id: table.id,
        code: table.code,
        name: table.name,
        seats: table.seats,
        status: table.status,
        shape: table.shape,
        positionX: Number(table.positionX),
        positionY: Number(table.positionY),
        width: Number(table.width),
        height: Number(table.height),
        rotation: Number(table.rotation),
      })),
    })),
    orders: shapedOrders,
    menu: { id: menu?.id ?? null, sections },
  };
}

export async function openFloorTable(
  actor: Actor,
  tableId: string,
  guestCount: number,
) {
  if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > 999)
    throw new RestaurantDomainError("Numero coperti non valido.");
  const table = await prisma.restaurantTable.findFirst({
    where: {
      id: tableId,
      companyId: actor.companyId,
      locationId: actor.locationId,
      active: true,
      visibleInFloor: true,
      deletedAt: null,
      area: { active: true, deletedAt: null },
    },
    select: { id: true },
  });
  if (!table)
    throw new RestaurantDomainError("Tavolo non disponibile in Sala.");
  return openOrder(actor.companyId, actor.locationId, actor.userId, {
    tableId,
    guestCount,
    serviceType: "DINE_IN",
  });
}

export async function searchFloorPartners(actor: Actor, rawQuery: string) {
  const query = rawQuery.trim();
  if (query.length < 2) return [];
  return prisma.partner.findMany({
    where: {
      companyId: actor.companyId,
      isCustomer: true,
      active: true,
      deletedAt: null,
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { displayName: { contains: query, mode: "insensitive" } },
        { vatNumber: { contains: query, mode: "insensitive" } },
        { taxCode: { contains: query, mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, displayName: true, vatNumber: true },
    orderBy: { name: "asc" },
    take: 20,
  });
}

export async function assignFloorOrderPartner(
  actor: Actor,
  orderId: string,
  partnerId: string,
) {
  return assignOrderPartner(
    actor.companyId,
    actor.locationId,
    actor.userId,
    orderId,
    partnerId,
  );
}

// Closing a bill leaves the table DIRTY. Without this transition the table can
// never be reopened from Sala, because both openOrder and the floor UI require
// AVAILABLE for a walk-in.
export async function releaseFloorTable(actor: Actor, tableId: string) {
  return prisma.$transaction(async (tx) => {
    await lockRestaurantResources(tx, actor.companyId, ["table:" + tableId]);
    const table = await tx.restaurantTable.findFirst({
      where: {
        id: tableId,
        companyId: actor.companyId,
        locationId: actor.locationId,
        active: true,
        visibleInFloor: true,
        deletedAt: null,
        area: { active: true, deletedAt: null },
      },
      select: { id: true, status: true },
    });
    if (!table) throw new RestaurantDomainError("Tavolo non disponibile in Sala.");
    const busy = await tx.restaurantOrderTable.findFirst({
      where: {
        companyId: actor.companyId,
        locationId: actor.locationId,
        tableId: table.id,
        order: { status: { notIn: ["CLOSED", "CANCELLED"] } },
      },
      select: { orderId: true },
    });
    if (busy)
      throw new RestaurantDomainError(
        "Il tavolo ha una comanda aperta e non può essere liberato.",
      );
    const released = await tx.restaurantTable.updateMany({
      where: {
        id: table.id,
        companyId: actor.companyId,
        locationId: actor.locationId,
        status: "DIRTY",
      },
      data: { status: "AVAILABLE" },
    });
    if (!released.count)
      throw new RestaurantDomainError(
        "Solo un tavolo da riassettare può essere liberato.",
      );
    await writeAuditLogTx(tx, {
      ...actor,
      action: "RESTAURANT_TABLE_RELEASED",
      entityType: "RestaurantTable",
      entityId: table.id,
      metadata: { previousStatus: table.status },
    });
    return { id: table.id };
  });
}

async function editableLine(
  tx: Prisma.TransactionClient,
  actor: Actor,
  orderId: string,
  lineId: string,
) {
  const line = await tx.restaurantOrderLine.findFirst({
    where: {
      id: lineId,
      companyId: actor.companyId,
      locationId: actor.locationId,
      orderId,
      status: "NEW",
      sentQuantity: 0,
    },
    include: { order: true },
  });
  if (!line || !["OPEN", "SENT", "IN_PROGRESS"].includes(line.order.status))
    throw new RestaurantDomainError(
      "Una riga già inviata non può essere modificata.",
    );
  return line;
}

// The +1 must be computed by the database. Two rapid taps on the same product
// used to read the same quantity and both write back the same absolute value,
// silently losing one unit.
async function incrementUnsentFloorLine(
  actor: Actor,
  orderId: string,
  lineId: string,
  expectedModifierIds: readonly string[],
) {
  return prisma.$transaction(async (tx) => {
    const line = await tx.restaurantOrderLine.findFirst({
      where: {
        id: lineId,
        companyId: actor.companyId,
        locationId: actor.locationId,
        orderId,
        status: "NEW",
        sentQuantity: 0,
      },
      include: { order: { select: { status: true } }, modifiers: true },
    });
    if (!line || !["OPEN", "SENT", "IN_PROGRESS"].includes(line.order.status))
      throw new RestaurantDomainError(
        "Una riga già inviata non può essere modificata.",
      );
    const actual = line.modifiers.map(({ modifierId }) => modifierId);
    if (
      actual.length !== expectedModifierIds.length ||
      actual.some(
        (modifierId) => !modifierId || !expectedModifierIds.includes(modifierId),
      )
    )
      throw new RestaurantDomainError(
        "I modificatori della riga sono cambiati. Ricarica la Sala.",
      );
    const bumped = await tx.restaurantOrderLine.updateMany({
      where: {
        id: line.id,
        companyId: actor.companyId,
        locationId: actor.locationId,
        orderId,
        status: "NEW",
        sentQuantity: 0,
      },
      data: { quantity: { increment: 1 } },
    });
    if (!bumped.count)
      throw new RestaurantDomainError(
        "Una riga già inviata non può essere modificata.",
      );
    const fresh = await tx.restaurantOrderLine.findUniqueOrThrow({
      where: { id: line.id },
      select: { quantity: true, unitPrice: true },
    });
    const quantity = Number(fresh.quantity);
    if (quantity > 999) throw new RestaurantDomainError("Quantità non valida.");
    await tx.restaurantOrderLine.update({
      where: { id: line.id },
      data: {
        lineTotal:
          Math.round(
            (quantity * Number(fresh.unitPrice) + Number.EPSILON) * 100,
          ) / 100,
      },
    });
    await writeAuditLogTx(tx, {
      ...actor,
      action: "RESTAURANT_ORDER_LINE_UPDATED",
      entityType: "RestaurantOrderLine",
      entityId: line.id,
      metadata: {
        orderId,
        previous: { quantity: Number(line.quantity) },
        next: { quantity },
      },
    });
    return { id: line.id };
  });
}

export async function addFloorOrderItem(
  actor: Actor,
  orderId: string,
  itemId: string,
  modifierIds: string[] = [],
) {
  // Revalidate stale clients too, including the existing-unsent-line path.
  const menuItem = await prisma.restaurantMenuItem.findFirst({
    where: {
      ...floorMenuItemWhere(actor.companyId),
      itemId,
      section: {
        companyId: actor.companyId,
        active: true,
        menu: {
          companyId: actor.companyId,
          locationId: actor.locationId,
          code: "FRISA_BISTRO",
          active: true,
          deletedAt: null,
        },
      },
    },
    select: { item: { select: { name: true, salePrice: true } } },
  });
  const mapping = await prisma.fusionCatalogMapping.findFirst({
    where: { companyId: actor.companyId, locationId: actor.locationId, itemId, missingFromFusion: false },
    select: { plu: true },
  });
  if (!menuItem || !mapping || menuExclusionReason({
    plu: mapping.plu,
    name: menuItem.item.name,
    price: menuItem.item.salePrice?.toNumber() ?? null,
  })) throw new RestaurantDomainError("Prodotto non disponibile in Sala.");
  const normalizedModifiers = [...new Set(modifierIds)];
  const existing = await prisma.restaurantOrderLine.findFirst({
    where: {
      companyId: actor.companyId,
      locationId: actor.locationId,
      orderId,
      itemId,
      status: "NEW",
      sentQuantity: 0,
    },
    include: { modifiers: true },
    orderBy: { createdAt: "desc" },
  });
  if (
    existing &&
    (existing.modifiers.length !== normalizedModifiers.length ||
      existing.modifiers.some(
        (modifier) =>
          !modifier.modifierId ||
          !normalizedModifiers.includes(modifier.modifierId),
      ))
  )
    return addOrderLine(actor.companyId, actor.locationId, orderId, {
      itemId,
      modifierIds: normalizedModifiers,
      quantity: 1,
    });
  if (existing)
    return incrementUnsentFloorLine(
      actor,
      orderId,
      existing.id,
      normalizedModifiers,
    );
  const line = await addOrderLine(actor.companyId, actor.locationId, orderId, {
    itemId,
    modifierIds: normalizedModifiers,
    quantity: 1,
  });
  await writeAuditLogTx(prisma, {
    ...actor,
    action: "RESTAURANT_ORDER_LINE_ADDED",
    entityType: "RestaurantOrderLine",
    entityId: line.id,
    metadata: {
      orderId,
      itemId,
      modifierIds: normalizedModifiers,
      quantity: 1,
    },
  });
  return line;
}

export async function updateUnsentFloorLine(
  actor: Actor,
  orderId: string,
  lineId: string,
  change: { quantity?: number; kitchenNotes?: string },
) {
  return prisma.$transaction(async (tx) => {
    const line = await editableLine(tx, actor, orderId, lineId);
    if (
      change.quantity !== undefined &&
      (!Number.isFinite(change.quantity) ||
        change.quantity < 1 ||
        change.quantity > 999)
    )
      throw new RestaurantDomainError("Quantità non valida.");
    const data = {
      quantity: change.quantity ?? line.quantity,
      lineTotal:
        change.quantity === undefined
          ? line.lineTotal
          : Math.round(
              (change.quantity * Number(line.unitPrice) + Number.EPSILON) * 100,
            ) / 100,
      kitchenNotes:
        change.kitchenNotes === undefined
          ? line.kitchenNotes
          : change.kitchenNotes.trim().slice(0, 500) || null,
    };
    await tx.restaurantOrderLine.update({ where: { id: line.id }, data });
    await writeAuditLogTx(tx, {
      ...actor,
      action: "RESTAURANT_ORDER_LINE_UPDATED",
      entityType: "RestaurantOrderLine",
      entityId: line.id,
      metadata: {
        orderId,
        previous: {
          quantity: Number(line.quantity),
          kitchenNotes: line.kitchenNotes,
        },
        next: {
          quantity: Number(data.quantity),
          kitchenNotes: data.kitchenNotes,
        },
      },
    });
    return { id: line.id };
  });
}

export async function deleteUnsentFloorLine(
  actor: Actor,
  orderId: string,
  lineId: string,
) {
  return prisma.$transaction(async (tx) => {
    const line = await editableLine(tx, actor, orderId, lineId);
    await tx.restaurantOrderLine.update({
      where: { id: line.id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    await writeAuditLogTx(tx, {
      ...actor,
      action: "RESTAURANT_ORDER_LINE_REMOVED",
      entityType: "RestaurantOrderLine",
      entityId: line.id,
      metadata: { orderId, quantity: Number(line.quantity) },
    });
    return { id: line.id };
  });
}

export async function updateFloorGuestCount(
  actor: Actor,
  orderId: string,
  guestCount: number,
) {
  if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > 999)
    throw new RestaurantDomainError("Numero coperti non valido.");
  return prisma.$transaction(async (tx) => {
    const order = await tx.restaurantOrder.findFirst({
      where: {
        id: orderId,
        companyId: actor.companyId,
        locationId: actor.locationId,
        status: { notIn: ["CLOSED", "CANCELLED"] },
      },
    });
    if (!order) throw new RestaurantDomainError("Comanda non valida.");
    await tx.restaurantOrder.update({
      where: { id: order.id },
      data: { guestCount, updatedById: actor.userId },
    });
    await writeAuditLogTx(tx, {
      ...actor,
      action: "RESTAURANT_ORDER_GUEST_COUNT_CHANGED",
      entityType: "RestaurantOrder",
      entityId: order.id,
      metadata: { previous: order.guestCount, next: guestCount },
    });
    return { id: order.id };
  });
}

export async function dispatchFloorOrder(
  actor: Actor,
  orderId: string,
  idempotencyKey: string,
) {
  if (!idempotencyKey || idempotencyKey.length > 200)
    throw new RestaurantDomainError("Chiave invio non valida.");
  return sendOrderToKitchen(
    actor.companyId,
    actor.locationId,
    orderId,
    actor.userId,
    `floor:${idempotencyKey}`,
  );
}

export async function retrySafeFloorJob(actor: Actor, jobId: string) {
  return retryConnectorJob(
    actor.companyId,
    actor.locationId,
    jobId,
    actor.userId,
  );
}

export const newFloorDispatchKey = () => randomUUID();
