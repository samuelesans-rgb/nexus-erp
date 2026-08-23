import "server-only";

import { type DocumentLinkType, type DocumentStatus, type DocumentType, Prisma } from "@/generated/prisma/client";
import { confirmDocument, createDraft, duplicateDraft, getDocuments, postDocument, type DraftInput } from "@/lib/documents";
import { postInventoryMovement } from "@/lib/inventory";
import { MODULE_CODES } from "@/lib/module-catalog";
import { requireModule } from "@/lib/modules";
import { prisma } from "@/lib/prisma";

export class SalesDomainError extends Error { constructor(message: string) { super(message); this.name = "SalesDomainError"; } }

const SALES_TYPES = ["QUOTE", "SALES_ORDER", "DELIVERY_NOTE", "SALES_INVOICE"] satisfies DocumentType[];
const transitions: Partial<Record<DocumentType, Partial<Record<DocumentType, DocumentLinkType>>>> = {
  QUOTE: { SALES_ORDER: "QUOTE_TO_ORDER" },
  SALES_ORDER: { DELIVERY_NOTE: "ORDER_TO_DDT", SALES_INVOICE: "ORDER_TO_INVOICE" },
  DELIVERY_NOTE: { SALES_INVOICE: "DDT_TO_INVOICE" },
  RETURN: { CREDIT_NOTE: "RETURN_TO_CREDIT_NOTE" },
};
const createdEvents: Partial<Record<DocumentType, string>> = { QUOTE: "QuoteCreated", SALES_ORDER: "OrderCreated", DELIVERY_NOTE: "DeliveryCreated", SALES_INVOICE: "InvoiceCreated" };

async function emit(companyId: string, eventType: string, documentId: string, payload: Prisma.InputJsonValue = {}) {
  await prisma.domainEvent.create({ data: { companyId, eventType, aggregateType: "BusinessDocument", aggregateId: documentId, payload: { documentId, ...payload as object }, occurredAt: new Date() } });
}

async function seriesFor(companyId: string, locationId: string, documentType: DocumentType) {
  const series = await prisma.documentSeries.findFirst({ where: { companyId, documentType, active: true, locationId }, select: { id: true }, orderBy: { code: "asc" } });
  if (!series) throw new SalesDomainError(`Nessuna serie attiva configurata per ${documentType}.`);
  return series.id;
}

export async function createQuote(companyId: string, userId: string, input: Omit<DraftInput, "seriesId"> & { seriesId?: string }) {
  const seriesId = input.seriesId ?? await seriesFor(companyId, input.locationId, "QUOTE");
  const validSeries = await prisma.documentSeries.count({ where: { id: seriesId, companyId, documentType: "QUOTE", active: true, locationId: input.locationId } });
  if (!validSeries) throw new SalesDomainError("Serie Preventivi non valida per la Company.");
  const quote = await createDraft(companyId, userId, { ...input, seriesId });
  await emit(companyId, "QuoteCreated", quote.id);
  return quote;
}

export async function convertDocument(companyId: string, userId: string, locationId: string, sourceDocumentId: string, targetType: DocumentType) {
  const source = await prisma.businessDocument.findFirst({ where: { id: sourceDocumentId, companyId, locationId, deletedAt: null }, include: { lines: { orderBy: { lineNumber: "asc" } } } });
  if (!source) throw new SalesDomainError("Documento sorgente non trovato.");
  const linkType = transitions[source.documentType]?.[targetType];
  if (!linkType) throw new SalesDomainError(`Conversione ${source.documentType} → ${targetType} non consentita.`);
  if (source.status !== "CONFIRMED" && !(source.documentType === "DELIVERY_NOTE" && source.status === "POSTED")) throw new SalesDomainError("Il documento sorgente deve essere confermato o, per il DDT, posted.");
  const existing = await prisma.documentLink.findFirst({ where: { companyId, sourceDocumentId, linkType, targetDocument: { locationId } }, select: { targetDocumentId: true } });
  if (existing) return { id: existing.targetDocumentId };
  const target = await createDraft(companyId, userId, {
    seriesId: await seriesFor(companyId, locationId, targetType), partnerId: source.partnerId, documentDate: new Date(), currency: source.currency,
    exchangeRate: Number(source.exchangeRate), warehouseId: source.warehouseId, locationId,
    paymentMethodId: source.paymentMethodId, paymentTermId: source.paymentTermId, priceListId: source.priceListId,
    notes: source.notes, internalNotes: source.internalNotes,
    lines: source.lines.map((line) => ({ itemId: line.itemId, description: line.description, quantity: Number(line.quantity), unitOfMeasureId: line.unitOfMeasureId, unitPrice: Number(line.unitPrice), discount: Number(line.discount), vatRateId: line.vatRateId, warehouseId: line.warehouseId, lotId: line.lotId, serialId: line.serialId, notes: line.notes })),
  });
  await prisma.$transaction([
    prisma.documentLink.create({ data: { companyId, sourceDocumentId, targetDocumentId: target.id, linkType, createdById: userId } }),
    prisma.domainEvent.create({ data: { companyId, eventType: createdEvents[targetType] ?? "SalesDocumentCreated", aggregateType: "BusinessDocument", aggregateId: target.id, payload: { documentId: target.id, sourceDocumentId, linkType }, occurredAt: new Date() } }),
  ]);
  return target;
}

export const createOrderFromQuote = (companyId: string, userId: string, locationId: string, id: string) => convertDocument(companyId, userId, locationId, id, "SALES_ORDER");
export const createDeliveryFromOrder = (companyId: string, userId: string, locationId: string, id: string) => convertDocument(companyId, userId, locationId, id, "DELIVERY_NOTE");
export const createInvoiceFromDelivery = (companyId: string, userId: string, locationId: string, id: string) => convertDocument(companyId, userId, locationId, id, "SALES_INVOICE");
export const createInvoiceFromOrder = (companyId: string, userId: string, locationId: string, id: string) => convertDocument(companyId, userId, locationId, id, "SALES_INVOICE");
export async function duplicateQuote(companyId: string, userId: string, locationId: string, id: string) {
  const source = await prisma.businessDocument.findFirst({ where: { id, companyId, locationId, documentType: "QUOTE", deletedAt: null }, select: { id: true } });
  if (!source) throw new SalesDomainError("Preventivo da duplicare non trovato.");
  const copy = await duplicateDraft(companyId, userId, locationId, id); await emit(companyId, "QuoteCreated", copy.id, { duplicatedFromId: id }); return copy;
}

export async function confirmSalesOrder(companyId: string, userId: string, locationId: string, id: string) {
  const order = await prisma.businessDocument.findFirst({ where: { id, companyId, locationId, documentType: "SALES_ORDER", status: "DRAFT", deletedAt: null }, select: { id: true } });
  if (!order) throw new SalesDomainError("Solo un ordine Draft può essere confermato.");
  await confirmDocument(companyId, userId, locationId, id);
  await emit(companyId, "SalesOrderConfirmed", id);
  return { id };
}

export async function postDelivery(companyId: string, userId: string, locationId: string, id: string) {
  await requireModule(companyId, MODULE_CODES.CORE_INVENTORY);
  const delivery = await prisma.businessDocument.findFirst({ where: { id, companyId, locationId, documentType: "DELIVERY_NOTE", status: "CONFIRMED", deletedAt: null }, include: { lines: { include: { item: { select: { stockManaged: true } } } } } });
  if (!delivery) throw new SalesDomainError("Solo un DDT confermato può essere posted.");
  for (const line of delivery.lines.filter((row) => row.item.stockManaged)) {
    const alreadyPosted = await prisma.inventoryMovement.count({ where: { companyId, locationId, referenceType: "BusinessDocumentLine", referenceId: line.id, movementType: "ISSUE" } });
    if (!alreadyPosted) await postInventoryMovement(companyId, userId, { locationId, warehouseId: line.warehouseId ?? delivery.warehouseId ?? "", itemId: line.itemId, movementType: "ISSUE", quantity: Number(line.quantity), unitOfMeasureId: line.unitOfMeasureId, lotId: line.lotId, serialId: line.serialId, referenceType: "BusinessDocumentLine", referenceId: line.id, reason: `DDT ${delivery.documentNumber}` });
  }
  await postDocument(companyId, userId, locationId, id);
  await emit(companyId, "DeliveryPosted", id);
  return { id };
}

export async function postInvoice(companyId: string, userId: string, locationId: string, id: string) {
  const invoice = await prisma.businessDocument.findFirst({ where: { id, companyId, locationId, documentType: "SALES_INVOICE", status: "CONFIRMED", deletedAt: null }, select: { id: true } });
  if (!invoice) throw new SalesDomainError("Solo una fattura confermata può essere posted.");
  await postDocument(companyId, userId, locationId, id);
  await emit(companyId, "InvoicePosted", id);
  return { id };
}

export async function getSalesDocuments(companyId: string, locationId: string, filters: { query?: string; documentType?: DocumentType; status?: DocumentStatus; page?: number } = {}) {
  if (filters.documentType && (SALES_TYPES as readonly DocumentType[]).includes(filters.documentType)) return getDocuments(companyId, locationId, filters);
  const page = Math.max(filters.page ?? 1, 1); const where: Prisma.BusinessDocumentWhereInput = { companyId, locationId, deletedAt: null, documentType: { in: SALES_TYPES }, status: filters.status, ...(filters.query ? { OR: [{ documentNumber: { contains: filters.query, mode: "insensitive" } }, { partner: { name: { contains: filters.query, mode: "insensitive" } } }] } : {}) };
  const [rows, total] = await Promise.all([prisma.businessDocument.findMany({ where, select: { id: true, documentNumber: true, documentType: true, status: true, documentDate: true, currency: true, total: true, series: { select: { code: true } }, partner: { select: { name: true, displayName: true } } }, orderBy: [{ documentDate: "desc" }, { createdAt: "desc" }], skip: (page - 1) * 25, take: 25 }), prisma.businessDocument.count({ where })]); return { rows, total, page };
}

export async function getSalesDocument(companyId: string, locationId: string, id: string) {
  return prisma.businessDocument.findFirst({ where: { id, companyId, locationId, documentType: { in: SALES_TYPES }, deletedAt: null }, include: { series: true, partner: { select: { name: true, displayName: true } }, lines: { include: { item: { select: { code: true, name: true } }, unitOfMeasure: { select: { symbol: true } } }, orderBy: { lineNumber: "asc" } }, sourceLinks: { where: { targetDocument: { locationId } }, include: { targetDocument: { select: { id: true, documentNumber: true, documentType: true } } } }, targetLinks: { where: { sourceDocument: { locationId } }, include: { sourceDocument: { select: { id: true, documentNumber: true, documentType: true } } } } } });
}

export async function getSalesDashboard(companyId: string, locationId: string) {
  const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
  const [quotesOpen, ordersOpen, deliveriesToInvoice, invoicesMonth, orderValue, quotes, converted] = await Promise.all([
    prisma.businessDocument.count({ where: { companyId, locationId, documentType: "QUOTE", status: { in: ["DRAFT", "CONFIRMED"] }, deletedAt: null } }),
    prisma.businessDocument.count({ where: { companyId, locationId, documentType: "SALES_ORDER", status: { in: ["DRAFT", "CONFIRMED"] }, deletedAt: null } }),
    prisma.businessDocument.count({ where: { companyId, locationId, documentType: "DELIVERY_NOTE", status: "POSTED", sourceLinks: { none: { linkType: "DDT_TO_INVOICE", targetDocument: { locationId } } }, deletedAt: null } }),
    prisma.businessDocument.aggregate({ where: { companyId, locationId, documentType: "SALES_INVOICE", documentDate: { gte: start }, deletedAt: null }, _sum: { total: true }, _count: true }),
    prisma.businessDocument.aggregate({ where: { companyId, locationId, documentType: "SALES_ORDER", status: { in: ["DRAFT", "CONFIRMED"] }, deletedAt: null }, _sum: { total: true } }),
    prisma.businessDocument.count({ where: { companyId, locationId, documentType: "QUOTE", deletedAt: null } }),
    prisma.documentLink.count({ where: { companyId, linkType: "QUOTE_TO_ORDER", sourceDocument: { locationId }, targetDocument: { locationId } } }),
  ]);
  return { quotesOpen, ordersOpen, deliveriesToInvoice, invoicesMonth: Number(invoicesMonth._sum.total ?? 0), invoiceCount: invoicesMonth._count, orderValue: Number(orderValue._sum.total ?? 0), conversionRate: quotes ? Math.round(converted / quotes * 100) : 0 };
}
