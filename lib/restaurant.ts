import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma, RestaurantTableStatus } from "@/generated/prisma/client";

export class RestaurantDomainError extends Error {}
export async function emitRestaurantEventTx(tx: Prisma.TransactionClient, companyId: string, eventType: string, aggregateType: string, aggregateId: string, payload: Prisma.InputJsonValue = {}) {
  return tx.domainEvent.create({ data: { companyId, eventType, aggregateType, aggregateId, payload, occurredAt: new Date() } });
}
export async function emitRestaurantEvent(companyId: string, eventType: string, aggregateType: string, aggregateId: string, payload: Prisma.InputJsonValue = {}) {
  return prisma.$transaction((tx) => emitRestaurantEventTx(tx, companyId, eventType, aggregateType, aggregateId, payload));
}
export async function getRestaurantOptions(companyId: string, locationId: string) {
  const [locations, partners, items, areas, tables, stations, warehouses, accounts, series] = await Promise.all([
    prisma.location.findMany({ where: { companyId, id: locationId, active: true, deletedAt: null }, select: { id: true, code: true, name: true } }),
    prisma.partner.findMany({ where: { companyId, active: true, deletedAt: null }, select: { id: true, name: true, displayName: true } }),
    prisma.item.findMany({ where: { companyId, active: true, deletedAt: null, sellable: true }, select: { id: true, code: true, name: true, type: true, salePrice: true, vatRateId: true, unitOfMeasureId: true } }),
    prisma.restaurantArea.findMany({ where: { companyId, locationId, active: true, deletedAt: null }, orderBy: { sortOrder: "asc" } }),
    prisma.restaurantTable.findMany({ where: { companyId, locationId, active: true, deletedAt: null }, orderBy: { code: "asc" } }),
    prisma.kitchenStation.findMany({ where: { companyId, locationId, active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.warehouse.findMany({ where: { companyId, locationId, active: true, deletedAt: null }, include: { bins: { where: { active: true, deletedAt: null }, take: 1 } } }),
    prisma.financialAccount.findMany({ where: { companyId, locationId, active: true, deletedAt: null }, select: { id: true, code: true, name: true } }),
    prisma.documentSeries.findMany({ where: { companyId, locationId, active: true, documentType: { in: ["SALES_INVOICE", "SALES_RECEIPT"] } }, select: { id: true, code: true, documentType: true } }),
  ]);
  return { locations, partners, items, areas, tables, stations, warehouses, accounts, series };
}
export async function saveArea(companyId: string, locationId: string, userId: string, input: { id?: string; code: string; name: string; description?: string; active?: boolean }) {
  const location = await prisma.location.findFirst({ where: { id: locationId, companyId, deletedAt: null }, select: { id: true } });
  if (!location || !input.code.trim() || !input.name.trim()) throw new RestaurantDomainError("Sede, codice e nome sono obbligatori.");
  const data = { locationId, code: input.code.trim().toUpperCase(), name: input.name.trim(), description: input.description?.trim() || null, active: input.active ?? true, updatedById: userId };
  if (input.id) { const result = await prisma.restaurantArea.updateMany({ where: { id: input.id, companyId, locationId, deletedAt: null }, data }); if (!result.count) throw new RestaurantDomainError("Area non trovata."); return { id: input.id }; }
  return prisma.restaurantArea.create({ data: { companyId, ...data, createdById: userId }, select: { id: true } });
}
export async function saveTable(companyId: string, locationId: string, input: { id?: string; areaId: string; code: string; name: string; seats: number; status?: RestaurantTableStatus }) {
  const area = await prisma.restaurantArea.findFirst({ where: { id: input.areaId, companyId, locationId, deletedAt: null }, select: { id: true } });
  if (!area || input.seats < 1) throw new RestaurantDomainError("Area non valida o coperti non validi.");
  const data = { locationId, areaId: area.id, code: input.code.trim().toUpperCase(), name: input.name.trim(), seats: input.seats, status: input.status ?? "AVAILABLE" as RestaurantTableStatus };
  if (input.id) { const result = await prisma.restaurantTable.updateMany({ where: { id: input.id, companyId, locationId, deletedAt: null }, data }); if (!result.count) throw new RestaurantDomainError("Tavolo non trovato."); return { id: input.id }; }
  return prisma.restaurantTable.create({ data: { companyId, ...data }, select: { id: true } });
}
export async function getRestaurantDashboard(companyId: string, locationId: string) {
  const start = new Date(); start.setHours(0,0,0,0); const end = new Date(start); end.setDate(end.getDate()+1);
  const [reservations, occupied, openOrders, noShows, orders] = await Promise.all([
    prisma.restaurantReservation.count({ where: { companyId, locationId, reservationDate: { gte: start, lt: end }, deletedAt: null } }),
    prisma.restaurantTable.count({ where: { companyId, locationId, status: "OCCUPIED", deletedAt: null } }),
    prisma.restaurantOrder.count({ where: { companyId, locationId, status: { notIn: ["CLOSED", "CANCELLED"] }, openedAt: { gte: start } } }),
    prisma.restaurantReservation.count({ where: { companyId, locationId, status: "NO_SHOW", reservationDate: { gte: start, lt: end } } }),
    prisma.restaurantOrder.findMany({ where: { companyId, locationId, openedAt: { gte: start }, status: "CLOSED" }, include: { lines: true } }),
  ]);
  const sales = orders.reduce((sum, order) => sum + order.lines.reduce((s,l) => s + Number(l.quantity)*Number(l.unitPrice),0),0);
  return { reservations, occupied, openOrders, noShows, sales, averageCheck: orders.length ? sales/orders.length : 0, covers: orders.reduce((s,o)=>s+o.guestCount,0) };
}
