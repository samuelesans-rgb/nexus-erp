import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type ManagementPeriodKey = "today" | "last7" | "currentMonth" | "previousMonth" | "last90" | "custom";
export type ManagementPeriod = { key: ManagementPeriodKey; from: Date; to: Date; previousFrom: Date; previousTo: Date; label: string };

const day = 86_400_000;
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * day);

function validDate(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

export function parseManagementPeriod(query: { period?: string; from?: string; to?: string }, now = new Date()): ManagementPeriod {
  const today = startOfDay(now);
  const key: ManagementPeriodKey = ["today", "last7", "currentMonth", "previousMonth", "last90", "custom"].includes(query.period ?? "")
    ? query.period as ManagementPeriodKey : "currentMonth";
  let from: Date;
  let to: Date;
  if (key === "today") { from = today; to = addDays(today, 1); }
  else if (key === "last7") { from = addDays(today, -6); to = addDays(today, 1); }
  else if (key === "last90") { from = addDays(today, -89); to = addDays(today, 1); }
  else if (key === "previousMonth") { from = new Date(today.getFullYear(), today.getMonth() - 1, 1); to = new Date(today.getFullYear(), today.getMonth(), 1); }
  else if (key === "custom") {
    const customFrom = validDate(query.from);
    const customTo = validDate(query.to);
    if (!customFrom || !customTo || customFrom > customTo || customTo.getTime() - customFrom.getTime() > 366 * day) {
      throw new Error("Periodo personalizzato non valido (massimo 366 giorni). ");
    }
    from = customFrom; to = addDays(customTo, 1);
  } else { from = new Date(today.getFullYear(), today.getMonth(), 1); to = new Date(today.getFullYear(), today.getMonth() + 1, 1); }
  const duration = to.getTime() - from.getTime();
  return {
    key, from, to, previousFrom: new Date(from.getTime() - duration), previousTo: from,
    label: `${from.toLocaleDateString("it-IT")} – ${addDays(to, -1).toLocaleDateString("it-IT")}`,
  };
}

const sum = (values: Array<number | { toNumber(): number } | null>) => values.reduce<number>((total, value) => total + (value === null ? 0 : typeof value === "number" ? value : value.toNumber()), 0);
const percentChange = (current: number, previous: number) => previous === 0 ? (current === 0 ? 0 : null) : ((current - previous) / Math.abs(previous)) * 100;
const dateKey = (date: Date) => date.toISOString().slice(0, 10);

export async function getManagementDashboard(companyId: string, locationId: string, period: ManagementPeriod) {
  const scoped = { companyId, locationId } as const;
  const activeDocument = { status: { in: ["CONFIRMED", "POSTED", "CLOSED"] }, deletedAt: null } satisfies Prisma.BusinessDocumentWhereInput;
  const selected = { gte: period.from, lt: period.to };
  const previous = { gte: period.previousFrom, lt: period.previousTo };
  const openStatuses = ["OPEN", "PARTIALLY_PAID", "OVERDUE"] as const;
  const now = new Date();
  const inThirtyDays = addDays(now, 30);

  const [documents, previousDocuments, orders, previousOrders, reservations, movements, schedules, stock, inventoryMovements, topLines] = await Promise.all([
    prisma.businessDocument.findMany({ where: { ...scoped, ...activeDocument, documentDate: selected, documentType: { in: ["SALES_INVOICE", "SALES_RECEIPT", "PURCHASE_INVOICE", "SALES_ORDER", "PURCHASE_ORDER"] } }, select: { documentType: true, status: true, total: true, documentDate: true, partner: { select: { name: true, displayName: true } }, restaurantOrder: { select: { id: true } } } }),
    prisma.businessDocument.findMany({ where: { ...scoped, ...activeDocument, documentDate: previous, documentType: { in: ["SALES_INVOICE", "SALES_RECEIPT", "PURCHASE_INVOICE"] } }, select: { documentType: true, status: true, total: true, restaurantOrder: { select: { id: true } } } }),
    prisma.restaurantOrder.findMany({ where: { ...scoped, status: "CLOSED", closedAt: selected }, select: { closedAt: true, guestCount: true, document: { select: { total: true } } } }),
    prisma.restaurantOrder.findMany({ where: { ...scoped, status: "CLOSED", closedAt: previous }, select: { document: { select: { total: true } } } }),
    prisma.restaurantReservation.findMany({ where: { ...scoped, deletedAt: null, startTime: selected }, select: { status: true, partySize: true } }),
    prisma.financialMovement.findMany({ where: { ...scoped, occurredAt: selected, movementType: { in: ["CUSTOMER_RECEIPT", "SUPPLIER_PAYMENT"] }, reversalOfId: null, reversals: { none: {} } }, select: { direction: true, amount: true, occurredAt: true } }),
    prisma.paymentSchedule.findMany({ where: { ...scoped, deletedAt: null, status: { in: [...openStatuses] }, residualAmount: { gt: 0 }, dueDate: { lt: inThirtyDays } }, select: { direction: true, dueDate: true, residualAmount: true } }),
    prisma.stockBalance.findMany({ where: scoped, select: { quantity: true, stockValue: true, item: { select: { name: true, productProfile: { select: { minimumStock: true, reorderPoint: true } } } } } }),
    prisma.inventoryMovement.findMany({ where: { ...scoped, occurredAt: selected, reversalOfId: null }, select: { direction: true, movementType: true, totalCost: true, occurredAt: true } }),
    prisma.restaurantOrderLine.findMany({ where: { ...scoped, status: { not: "CANCELLED" }, order: { status: "CLOSED", closedAt: selected } }, select: { itemId: true, quantity: true, unitPrice: true, item: { select: { name: true } } } }),
  ]);

  const docRevenue = sum(documents.filter((row) => ["SALES_INVOICE", "SALES_RECEIPT"].includes(row.documentType) && ["POSTED", "CLOSED"].includes(row.status) && !row.restaurantOrder).map((row) => row.total));
  const restaurantRevenue = sum(orders.map((row) => row.document?.total ?? null));
  const revenue = docRevenue + restaurantRevenue;
  const previousRevenue = sum(previousDocuments.filter((row) => ["SALES_INVOICE", "SALES_RECEIPT"].includes(row.documentType) && ["POSTED", "CLOSED"].includes(row.status) && !row.restaurantOrder).map((row) => row.total)) + sum(previousOrders.map((row) => row.document?.total ?? null));
  const purchases = sum(documents.filter((row) => row.documentType === "PURCHASE_INVOICE" && ["POSTED", "CLOSED"].includes(row.status)).map((row) => row.total));
  const costOfGoods = sum(inventoryMovements.filter((row) => row.direction < 0 && ["ISSUE", "CONSUMPTION", "TRANSFER_OUT", "ADJUSTMENT_OUT", "INVENTORY_LOSS", "RETURN_OUT"].includes(row.movementType)).map((row) => row.totalCost));
  const receipts = sum(movements.filter((row) => row.direction === "IN").map((row) => row.amount));
  const payments = sum(movements.filter((row) => row.direction === "OUT").map((row) => row.amount));
  const trend = new Map<string, { revenue: number; receipts: number; payments: number }>();
  const point = (date: Date) => { const key = dateKey(date); const value = trend.get(key) ?? { revenue: 0, receipts: 0, payments: 0 }; trend.set(key, value); return value; };
  documents.filter((row) => ["SALES_INVOICE", "SALES_RECEIPT"].includes(row.documentType) && ["POSTED", "CLOSED"].includes(row.status) && !row.restaurantOrder).forEach((row) => { point(row.documentDate).revenue += row.total.toNumber(); });
  orders.forEach((row) => { if (row.closedAt) point(row.closedAt).revenue += row.document?.total.toNumber() ?? 0; });
  movements.forEach((row) => { point(row.occurredAt)[row.direction === "IN" ? "receipts" : "payments"] += row.amount.toNumber(); });
  const topProducts = new Map<string, { name: string; quantity: number; value: number }>();
  topLines.forEach((row) => { const value = topProducts.get(row.itemId) ?? { name: row.item.name, quantity: 0, value: 0 }; value.quantity += row.quantity.toNumber(); value.value += row.quantity.toNumber() * row.unitPrice.toNumber(); topProducts.set(row.itemId, value); });
  const supplierRows = documents.filter((row) => row.documentType === "PURCHASE_INVOICE" && ["POSTED", "CLOSED"].includes(row.status));
  const suppliers = new Map<string, number>(); supplierRows.forEach((row) => { const name = row.partner.displayName ?? row.partner.name; suppliers.set(name, (suppliers.get(name) ?? 0) + row.total.toNumber()); });
  const lowStock = stock.filter((row) => { const threshold = row.item.productProfile?.minimumStock ?? row.item.productProfile?.reorderPoint; return threshold !== null && threshold !== undefined && row.quantity.lessThanOrEqualTo(threshold); });

  return {
    period,
    revenue: { total: revenue, documents: docRevenue, restaurant: restaurantRevenue, previous: previousRevenue, change: percentChange(revenue, previousRevenue) },
    costs: { purchases, costOfGoods, grossMargin: revenue - costOfGoods, marginPercent: revenue ? ((revenue - costOfGoods) / revenue) * 100 : 0 },
    treasury: { receipts, payments, net: receipts - payments, overdue: sum(schedules.filter((row) => row.dueDate < now).map((row) => row.residualAmount)), upcoming30: sum(schedules.filter((row) => row.dueDate >= now).map((row) => row.residualAmount)) },
    restaurant: { orders: orders.length, covers: sum(orders.map((row) => row.guestCount)), averageCheck: orders.length ? restaurantRevenue / orders.length : 0, reservations: reservations.length, noShows: reservations.filter((row) => row.status === "NO_SHOW").length, cancellations: reservations.filter((row) => row.status === "CANCELLED").length, topProducts: [...topProducts.values()].sort((a, b) => b.value - a.value).slice(0, 5) },
    sales: { orders: documents.filter((row) => row.documentType === "SALES_ORDER").length, orderValue: sum(documents.filter((row) => row.documentType === "SALES_ORDER").map((row) => row.total)), invoices: documents.filter((row) => ["SALES_INVOICE", "SALES_RECEIPT"].includes(row.documentType) && ["POSTED", "CLOSED"].includes(row.status)).length },
    purchasing: { orders: documents.filter((row) => row.documentType === "PURCHASE_ORDER").length, orderValue: sum(documents.filter((row) => row.documentType === "PURCHASE_ORDER").map((row) => row.total)), topSuppliers: [...suppliers.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5) },
    inventory: { stockValue: sum(stock.map((row) => row.stockValue)), lowStock: lowStock.length, lowStockItems: lowStock.slice(0, 5).map((row) => ({ name: row.item.name, quantity: row.quantity.toNumber() })), movements: inventoryMovements.length },
    trend: [...trend.entries()].map(([date, values]) => ({ date, ...values })).sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export type ManagementDashboard = Awaited<ReturnType<typeof getManagementDashboard>>;
