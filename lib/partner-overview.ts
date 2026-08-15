import "server-only";

import type {
  DocumentStatus,
  DocumentType,
  Prisma,
} from "@/generated/prisma/client";
import type { PartnerFinancialScope } from "@/lib/partner-access";
import { prisma } from "@/lib/prisma";

const openScheduleStatuses = ["OPEN", "PARTIALLY_PAID", "OVERDUE"] as const;
const completedDocumentStatuses: DocumentStatus[] = ["POSTED", "CLOSED"];
const activeOrderStatuses: DocumentStatus[] = ["DRAFT", "CONFIRMED", "POSTED", "CLOSED"];

export type PartnerOverviewScope = { locationId: string | null };

export class PartnerOverviewScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PartnerOverviewScopeError";
  }
}

export async function validatePartnerOverviewScope(
  companyId: string,
  requestedLocationId: string | undefined,
  currentLocationId: string,
  allowCompanyWide: boolean,
): Promise<PartnerOverviewScope> {
  if (requestedLocationId === "company") {
    if (!allowCompanyWide) return { locationId: currentLocationId };
    return { locationId: null };
  }

  const locationId = requestedLocationId || currentLocationId;
  const location = await prisma.location.findFirst({
    where: { id: locationId, companyId, active: true, deletedAt: null },
    select: { id: true },
  });
  if (!location) throw new PartnerOverviewScopeError("Sede non valida per la Company corrente.");
  return { locationId: location.id };
}

function locationWhere(locationId: string | null) {
  return locationId ? { locationId } : {};
}

function sumDecimal(value: { _sum: { total?: Prisma.Decimal | null; amount?: Prisma.Decimal | null } }) {
  return Number(value._sum.total ?? value._sum.amount ?? 0);
}

function documentSection(type: DocumentType) {
  if (["QUOTE", "SALES_ORDER", "DELIVERY_NOTE", "SALES_INVOICE", "SALES_RECEIPT"].includes(type)) return "SALES" as const;
  if (["PURCHASE_ORDER", "GOODS_RECEIPT", "PURCHASE_INVOICE"].includes(type)) return "PURCHASING" as const;
  return "OTHER" as const;
}

export async function getPartnerOverview(input: {
  companyId: string;
  partnerId: string;
  locationId: string | null;
  financialScope: PartnerFinancialScope;
}) {
  const { companyId, partnerId, locationId, financialScope } = input;
  const scoped = { companyId, partnerId, ...locationWhere(locationId) };
  const now = new Date();

  const partnerPromise = prisma.partner.findFirst({
    where: { id: partnerId, companyId },
    select: {
      id: true,
      isCustomer: true,
      isSupplier: true,
    },
  });

  const salesRevenueWhere: Prisma.BusinessDocumentWhereInput = {
    ...scoped,
    documentType: { in: ["SALES_INVOICE", "SALES_RECEIPT"] },
    status: { in: completedDocumentStatuses },
    deletedAt: null,
  };
  const purchaseWhere: Prisma.BusinessDocumentWhereInput = {
    ...scoped,
    documentType: "PURCHASE_INVOICE",
    status: { in: completedDocumentStatuses },
    deletedAt: null,
  };

  const baseQueries = [
    partnerPromise,
    prisma.businessDocument.aggregate({ where: salesRevenueWhere, _sum: { total: true }, _count: true }),
    prisma.businessDocument.aggregate({ where: { ...scoped, documentType: "SALES_ORDER", status: { in: activeOrderStatuses }, deletedAt: null }, _sum: { total: true } }),
    prisma.businessDocument.findFirst({ where: salesRevenueWhere, orderBy: { documentDate: "desc" }, select: { documentDate: true } }),
    prisma.businessDocument.aggregate({ where: purchaseWhere, _sum: { total: true }, _count: true }),
    prisma.businessDocument.aggregate({ where: { ...scoped, documentType: "PURCHASE_ORDER", status: { in: activeOrderStatuses }, deletedAt: null }, _sum: { total: true } }),
    prisma.businessDocument.findFirst({ where: purchaseWhere, orderBy: { documentDate: "desc" }, select: { documentDate: true } }),
    prisma.businessDocument.findMany({
      where: { ...scoped, deletedAt: null },
      select: { id: true, documentNumber: true, documentType: true, status: true, documentDate: true, total: true, currency: true, location: { select: { id: true, code: true, name: true } } },
      orderBy: [{ documentDate: "desc" }, { createdAt: "desc" }],
      take: 50,
    }),
    prisma.restaurantReservation.findMany({
      where: { ...scoped, deletedAt: null },
      select: { id: true, code: true, startTime: true, partySize: true, status: true, location: { select: { id: true, code: true, name: true } } },
      orderBy: { startTime: "desc" },
      take: 20,
    }),
    prisma.restaurantOrder.findMany({
      where: scoped,
      select: { id: true, code: true, openedAt: true, closedAt: true, status: true, paymentStatus: true, document: { select: { total: true, currency: true } }, location: { select: { id: true, code: true, name: true } } },
      orderBy: { openedAt: "desc" },
      take: 20,
    }),
    prisma.restaurantReservation.count({ where: { ...scoped, deletedAt: null } }),
    prisma.restaurantOrder.count({ where: scoped }),
    prisma.businessDocument.aggregate({ where: { ...scoped, restaurantOrder: { isNot: null }, status: { in: completedDocumentStatuses }, deletedAt: null }, _sum: { total: true } }),
  ] as const;

  const [
    partner,
    salesRevenue,
    salesOrders,
    lastSale,
    purchases,
    purchaseOrders,
    lastPurchase,
    documents,
    reservations,
    restaurantOrders,
    reservationCount,
    restaurantOrderCount,
    restaurantValue,
  ] = await Promise.all(baseQueries);

  if (!partner) return null;

  let treasury: null | {
    schedules: Awaited<ReturnType<typeof getSchedules>>;
    movements: Awaited<ReturnType<typeof getMovements>>;
    customer: FinancialKpis | null;
    supplier: FinancialKpis | null;
  } = null;

  if (financialScope !== "NONE") {
    const allowSupplier = financialScope === "FULL";
    const directions = allowSupplier ? (["RECEIVABLE", "PAYABLE"] as const) : (["RECEIVABLE"] as const);
    const [schedules, movements] = await Promise.all([
      getSchedules(companyId, partnerId, locationId, directions),
      getMovements(companyId, partnerId, locationId, allowSupplier),
    ]);
    treasury = {
      schedules,
      movements,
      customer: partner.isCustomer ? financialKpis(schedules, movements, "RECEIVABLE", now) : null,
      supplier: partner.isSupplier && allowSupplier ? financialKpis(schedules, movements, "PAYABLE", now) : null,
    };
  }

  return {
    scope: { locationId },
    customer: partner.isCustomer
      ? { revenue: sumDecimal(salesRevenue), documentCount: salesRevenue._count, orderValue: sumDecimal(salesOrders), lastSale: lastSale?.documentDate ?? null, reservationCount, restaurantOrderCount, restaurantValue: sumDecimal(restaurantValue), financial: treasury?.customer ?? null }
      : null,
    supplier: partner.isSupplier
      ? { purchases: sumDecimal(purchases), documentCount: purchases._count, orderValue: sumDecimal(purchaseOrders), lastPurchase: lastPurchase?.documentDate ?? null, financial: treasury?.supplier ?? null }
      : null,
    documents: documents.map((document) => ({ ...document, section: documentSection(document.documentType) })),
    treasury,
    restaurant: { reservations, orders: restaurantOrders },
  };
}

async function getSchedules(companyId: string, partnerId: string, locationId: string | null, directions: readonly ("RECEIVABLE" | "PAYABLE")[]) {
  return prisma.paymentSchedule.findMany({
    where: { companyId, partnerId, ...locationWhere(locationId), direction: { in: [...directions] }, status: { in: [...openScheduleStatuses] }, residualAmount: { gt: 0 }, deletedAt: null },
    select: { id: true, direction: true, dueDate: true, amount: true, residualAmount: true, currency: true, status: true, document: { select: { id: true, documentNumber: true, documentType: true } }, location: { select: { id: true, code: true, name: true } } },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    take: 50,
  });
}

async function getMovements(companyId: string, partnerId: string, locationId: string | null, allowSupplier: boolean) {
  return prisma.financialMovement.findMany({
    where: { companyId, partnerId, ...locationWhere(locationId), movementType: { in: allowSupplier ? ["CUSTOMER_RECEIPT", "SUPPLIER_PAYMENT"] : ["CUSTOMER_RECEIPT"] }, reversalOfId: null, reversals: { none: {} } },
    select: { id: true, movementType: true, direction: true, amount: true, currency: true, occurredAt: true, reference: true, document: { select: { id: true, documentNumber: true, documentType: true } }, location: { select: { id: true, code: true, name: true } } },
    orderBy: { occurredAt: "desc" },
    take: 50,
  });
}

type FinancialKpis = {
  paid: number;
  residual: number;
  overdue: number;
  nextDueDate: Date | null;
};

function financialKpis(
  schedules: Awaited<ReturnType<typeof getSchedules>>,
  movements: Awaited<ReturnType<typeof getMovements>>,
  direction: "RECEIVABLE" | "PAYABLE",
  now: Date,
): FinancialKpis {
  const matchingSchedules = schedules.filter((row) => row.direction === direction);
  const movementType = direction === "RECEIVABLE" ? "CUSTOMER_RECEIPT" : "SUPPLIER_PAYMENT";
  return {
    paid: movements.filter((row) => row.movementType === movementType).reduce((sum, row) => sum + Number(row.amount), 0),
    residual: matchingSchedules.reduce((sum, row) => sum + Number(row.residualAmount), 0),
    overdue: matchingSchedules.filter((row) => row.dueDate < now).reduce((sum, row) => sum + Number(row.residualAmount), 0),
    nextDueDate: matchingSchedules.find((row) => row.dueDate >= now)?.dueDate ?? null,
  };
}
