import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { confirmDocument, DocumentDomainError } from "../../lib/documents";
import { postInventoryMovement } from "../../lib/inventory";
import { prisma } from "../../lib/prisma";
import {
  confirmPurchaseOrder,
  createPurchaseInvoiceFromReceipt,
  createPurchaseOrder,
  createReceiptFromPurchaseOrder,
  getPurchaseDocument,
  postGoodsReceipt,
  postPurchaseInvoice,
} from "../../lib/purchasing";
import {
  confirmSalesOrder,
  createDeliveryFromOrder,
  createInvoiceFromDelivery,
  createOrderFromQuote,
  createQuote,
  getSalesDocument,
  postDelivery,
  postInvoice,
} from "../../lib/sales";
import { registerCustomerReceipt, registerSupplierPayment, TreasuryDomainError } from "../../lib/treasury";

if (!(process.env.DATABASE_URL ?? "").includes("_test")) throw new Error("I test Sales/Purchasing richiedono DATABASE_URL con suffisso _test.");

let companyId = "", otherCompanyId = "", userId = "", locationA = "", locationB = "";
let warehouseA = "", warehouseB = "", customerId = "", supplierId = "", itemId = "", unitId = "", vatId = "", termId = "", accountA = "", accountB = "";
let quoteId = "", salesOrderId = "", deliveryId = "", salesInvoiceId = "", purchaseOrderId = "", receiptId = "", purchaseInvoiceId = "";
const documentIds: string[] = [], seriesIds: string[] = [], movementIds: string[] = [], locationIds: string[] = [], accountIds: string[] = [];
const series = new Map<string, string>();

const documentInput = (partnerId: string, locationId: string, warehouseId: string, seriesId: string) => ({
  seriesId,
  partnerId,
  documentDate: new Date(),
  currency: "EUR",
  locationId,
  warehouseId,
  paymentTermId: termId,
  lines: [{ itemId, quantity: 2, unitOfMeasureId: unitId, unitPrice: 10, vatRateId: vatId, warehouseId }],
});

before(async () => {
  companyId = (await prisma.company.findUniqueOrThrow({ where: { vatNumber: "IT00000000000" } })).id;
  userId = (await prisma.user.findFirstOrThrow({ where: { memberships: { some: { companyId, active: true } } }, select: { id: true } })).id;
  const suffix = randomUUID().slice(0, 8);
  const [a, b, customer, supplier, unit, vat, term] = await Promise.all([
    prisma.location.create({ data: { companyId, code: `SP-A-${suffix}`, name: "Sales Purchasing A" } }),
    prisma.location.create({ data: { companyId, code: `SP-B-${suffix}`, name: "Sales Purchasing B" } }),
    prisma.partner.create({ data: { companyId, code: `SP-C-${suffix}`, name: "Sales Customer", isCustomer: true } }),
    prisma.partner.create({ data: { companyId, code: `SP-S-${suffix}`, name: "Purchasing Supplier", isSupplier: true } }),
    prisma.unitOfMeasure.create({ data: { companyId, code: `SP-U-${suffix}`, name: "Unità Sales Purchasing", symbol: "pz" } }),
    prisma.vatRate.create({ data: { companyId, code: `SP-V-${suffix}`, name: "IVA Sales Purchasing", percentage: 22 } }),
    prisma.paymentTerm.create({ data: { companyId, code: `SP-T-${suffix}`, name: "Termine Sales Purchasing", dueDays: 30 } }),
  ]);
  locationA = a.id; locationB = b.id; locationIds.push(a.id, b.id); customerId = customer.id; supplierId = supplier.id; unitId = unit.id; vatId = vat.id; termId = term.id;
  itemId = (await prisma.item.create({ data: { companyId, code: `SP-I-${suffix}`, name: "Item Sales Purchasing", type: "PRODUCT", unitOfMeasureId: unitId, vatRateId: vatId, salePrice: 10, purchasePrice: 8, stockManaged: true, sellable: true, purchasable: true } })).id;
  const [wa, wb] = await Promise.all([
    prisma.warehouse.create({ data: { companyId, locationId: locationA, code: `SP-WA-${suffix}`, name: "Warehouse A", allowNegativeStock: true, createdById: userId } }),
    prisma.warehouse.create({ data: { companyId, locationId: locationB, code: `SP-WB-${suffix}`, name: "Warehouse B", allowNegativeStock: true, createdById: userId } }),
  ]); warehouseA = wa.id; warehouseB = wb.id;
  for (const [index, type] of (["QUOTE", "SALES_ORDER", "DELIVERY_NOTE", "SALES_INVOICE", "PURCHASE_ORDER", "GOODS_RECEIPT", "PURCHASE_INVOICE"] as const).entries()) {
    const row = await prisma.documentSeries.create({ data: { companyId, locationId: locationA, code: `SP-${index}-${suffix}`, name: `Serie ${type}`, documentType: type } });
    series.set(type, row.id); seriesIds.push(row.id);
  }
  const legacy = await prisma.documentSeries.findFirst({ where: { companyId, locationId: null, documentType: "QUOTE", active: true }, select: { id: true } }); if (legacy) series.set("LEGACY_QUOTE", legacy.id);
  const [fa, fb] = await Promise.all([
    prisma.financialAccount.create({ data: { companyId, locationId: locationA, code: `SP-FA-${suffix}`, name: "Account A", type: "CASH", allowOverdraft: true, createdById: userId, updatedById: userId } }),
    prisma.financialAccount.create({ data: { companyId, locationId: locationB, code: `SP-FB-${suffix}`, name: "Account B", type: "CASH", allowOverdraft: true, createdById: userId, updatedById: userId } }),
  ]); accountA = fa.id; accountB = fb.id; accountIds.push(fa.id, fb.id);
  otherCompanyId = (await prisma.company.create({ data: { name: `Sales Purchasing tenant ${suffix}` } })).id;
  const opening = await postInventoryMovement(companyId, userId, { locationId: locationA, warehouseId: warehouseA, itemId, movementType: "ADJUSTMENT_IN", quantity: 100, unitOfMeasureId: unitId, referenceType: "SalesPurchasingLocationTest", referenceId: suffix }); movementIds.push(opening.id);
});

after(async () => {
  const schedules = await prisma.paymentSchedule.findMany({ where: { documentId: { in: documentIds } }, select: { id: true } });
  const scheduleIds = schedules.map(({ id }) => id);
  const financial = await prisma.financialMovement.findMany({ where: { OR: [{ documentId: { in: documentIds } }, { paymentScheduleId: { in: scheduleIds } }] }, select: { id: true } });
  const financialIds = financial.map(({ id }) => id);
  if (financialIds.length) await prisma.financialAllocation.deleteMany({ where: { movementId: { in: financialIds } } });
  if (financialIds.length) await prisma.financialMovement.deleteMany({ where: { id: { in: financialIds } } });
  if (scheduleIds.length) await prisma.paymentSchedule.deleteMany({ where: { id: { in: scheduleIds } } });
  if (documentIds.length) {
    await prisma.documentLink.deleteMany({ where: { OR: [{ sourceDocumentId: { in: documentIds } }, { targetDocumentId: { in: documentIds } }] } });
    await prisma.documentEvent.deleteMany({ where: { documentId: { in: documentIds } } });
    await prisma.domainEvent.deleteMany({ where: { aggregateType: "BusinessDocument", aggregateId: { in: documentIds } } });
    await prisma.inventoryMovement.deleteMany({ where: { referenceType: "BusinessDocumentLine", referenceId: { in: (await prisma.businessDocumentLine.findMany({ where: { documentId: { in: documentIds } }, select: { id: true } })).map(({ id }) => id) } } });
    await prisma.businessDocument.deleteMany({ where: { id: { in: documentIds } } });
  }
  if (movementIds.length) await prisma.inventoryMovement.deleteMany({ where: { id: { in: movementIds } } });
  await prisma.stockBalance.deleteMany({ where: { warehouseId: { in: [warehouseA, warehouseB] } } });
  if (accountIds.length) await prisma.financialAccount.deleteMany({ where: { id: { in: accountIds } } });
  if (seriesIds.length) await prisma.documentSeries.deleteMany({ where: { id: { in: seriesIds } } });
  await prisma.warehouse.deleteMany({ where: { id: { in: [warehouseA, warehouseB] } } });
  if (itemId) await prisma.item.delete({ where: { id: itemId } });
  await prisma.partner.deleteMany({ where: { id: { in: [customerId, supplierId] } } });
  if (termId) await prisma.paymentTerm.delete({ where: { id: termId } });
  if (vatId) await prisma.vatRate.delete({ where: { id: vatId } });
  if (unitId) await prisma.unitOfMeasure.delete({ where: { id: unitId } });
  if (locationIds.length) await prisma.location.deleteMany({ where: { id: { in: locationIds } } });
  if (otherCompanyId) await prisma.company.delete({ where: { id: otherCompanyId } });
  await prisma.$disconnect();
});

test("Sales 1: crea Quote nella Location A", async () => { const row = await createQuote(companyId, userId, documentInput(customerId, locationA, warehouseA, series.get("QUOTE")!)); quoteId = row.id; documentIds.push(row.id); assert.equal((await getSalesDocument(companyId, locationA, row.id))?.locationId, locationA); });
test("Sales 2: lettura dalla Location B rifiutata", async () => { assert.equal(await getSalesDocument(companyId, locationB, quoteId), null); });
test("Sales 3: modifica e conferma cross-location rifiutate", async () => { await assert.rejects(confirmDocument(companyId, userId, locationB, quoteId), DocumentDomainError); await confirmDocument(companyId, userId, locationA, quoteId); salesOrderId = (await createOrderFromQuote(companyId, userId, locationA, quoteId)).id; documentIds.push(salesOrderId); await assert.rejects(confirmSalesOrder(companyId, userId, locationB, salesOrderId)); await confirmSalesOrder(companyId, userId, locationA, salesOrderId); });
test("Sales 4: Warehouse di altra sede rifiutato", async () => { await assert.rejects(createQuote(companyId, userId, documentInput(customerId, locationA, warehouseB, series.get("QUOTE")!)), DocumentDomainError); });
test("Sales 5: fulfillment Inventory resta nella Location A", async () => { deliveryId = (await createDeliveryFromOrder(companyId, userId, locationA, salesOrderId)).id; documentIds.push(deliveryId); await confirmDocument(companyId, userId, locationA, deliveryId); await assert.rejects(postDelivery(companyId, userId, locationB, deliveryId)); await postDelivery(companyId, userId, locationA, deliveryId); const movement = await prisma.inventoryMovement.findFirstOrThrow({ where: { referenceType: "BusinessDocumentLine", referenceId: { in: (await prisma.businessDocumentLine.findMany({ where: { documentId: deliveryId }, select: { id: true } })).map(({ id }) => id) }, movementType: "ISSUE" } }); assert.equal(movement.locationId, locationA); });
test("Sales 6: BusinessDocument generato resta nella Location A", async () => { salesInvoiceId = (await createInvoiceFromDelivery(companyId, userId, locationA, deliveryId)).id; documentIds.push(salesInvoiceId); assert.equal((await getSalesDocument(companyId, locationA, salesInvoiceId))?.locationId, locationA); });
test("Sales 7: Treasury eredita Location e rifiuta incasso cross-location", async () => { await confirmDocument(companyId, userId, locationA, salesInvoiceId); await postInvoice(companyId, userId, locationA, salesInvoiceId); const schedule = await prisma.paymentSchedule.findFirstOrThrow({ where: { documentId: salesInvoiceId } }); assert.equal(schedule.locationId, locationA); await assert.rejects(registerCustomerReceipt(companyId, userId, { locationId: locationB, financialAccountId: accountB, scheduleId: schedule.id, amount: 1 }), TreasuryDomainError); const movement = await registerCustomerReceipt(companyId, userId, { locationId: locationA, financialAccountId: accountA, scheduleId: schedule.id, amount: 1 }); assert.equal((await prisma.financialMovement.findUniqueOrThrow({ where: { id: movement.id } })).locationId, locationA); });
test("Sales 8: tenant isolation", async () => { assert.equal(await getSalesDocument(otherCompanyId, locationA, salesOrderId), null); await assert.rejects(confirmSalesOrder(otherCompanyId, userId, locationA, salesOrderId)); });

test("Purchasing 9: crea PurchaseOrder nella Location A", async () => { const row = await createPurchaseOrder(companyId, userId, documentInput(supplierId, locationA, warehouseA, series.get("PURCHASE_ORDER")!)); purchaseOrderId = row.id; documentIds.push(row.id); assert.equal((await getPurchaseDocument(companyId, locationA, row.id))?.locationId, locationA); });
test("Purchasing 10: lettura dalla Location B rifiutata", async () => { assert.equal(await getPurchaseDocument(companyId, locationB, purchaseOrderId), null); });
test("Purchasing 11: ricevimento cross-location rifiutato", async () => { await confirmPurchaseOrder(companyId, userId, locationA, purchaseOrderId); await assert.rejects(createReceiptFromPurchaseOrder(companyId, userId, locationB, purchaseOrderId)); });
test("Purchasing 12: Warehouse destinazione di altra sede rifiutato", async () => { await assert.rejects(createPurchaseOrder(companyId, userId, documentInput(supplierId, locationA, warehouseB, series.get("PURCHASE_ORDER")!)), DocumentDomainError); });
test("Purchasing 13: Inventory receipt resta nella Location A", async () => { receiptId = (await createReceiptFromPurchaseOrder(companyId, userId, locationA, purchaseOrderId)).id; documentIds.push(receiptId); await confirmDocument(companyId, userId, locationA, receiptId); await assert.rejects(postGoodsReceipt(companyId, userId, locationB, receiptId)); await postGoodsReceipt(companyId, userId, locationA, receiptId); const movement = await prisma.inventoryMovement.findFirstOrThrow({ where: { referenceType: "BusinessDocumentLine", referenceId: { in: (await prisma.businessDocumentLine.findMany({ where: { documentId: receiptId }, select: { id: true } })).map(({ id }) => id) }, movementType: "RECEIPT" } }); assert.equal(movement.locationId, locationA); });
test("Purchasing 14: BusinessDocument fornitore resta nella Location A", async () => { purchaseInvoiceId = (await createPurchaseInvoiceFromReceipt(companyId, userId, locationA, receiptId)).id; documentIds.push(purchaseInvoiceId); assert.equal((await getPurchaseDocument(companyId, locationA, purchaseInvoiceId))?.locationId, locationA); });
test("Purchasing 15: Treasury eredita Location e rifiuta pagamento cross-location", async () => { await confirmDocument(companyId, userId, locationA, purchaseInvoiceId); await postPurchaseInvoice(companyId, userId, locationA, purchaseInvoiceId); const schedule = await prisma.paymentSchedule.findFirstOrThrow({ where: { documentId: purchaseInvoiceId } }); assert.equal(schedule.locationId, locationA); await assert.rejects(registerSupplierPayment(companyId, userId, { locationId: locationB, financialAccountId: accountB, scheduleId: schedule.id, amount: 1 }), TreasuryDomainError); const movement = await registerSupplierPayment(companyId, userId, { locationId: locationA, financialAccountId: accountA, scheduleId: schedule.id, amount: 1 }); assert.equal((await prisma.financialMovement.findUniqueOrThrow({ where: { id: movement.id } })).locationId, locationA); });
test("Purchasing 16: tenant isolation", async () => { assert.equal(await getPurchaseDocument(otherCompanyId, locationA, purchaseOrderId), null); await assert.rejects(confirmPurchaseOrder(otherCompanyId, userId, locationA, purchaseOrderId)); });
test("Compatibilità 17: serie Documents globale legacy resta limitata all’adapter previsto", async (t) => { const legacySeriesId = series.get("LEGACY_QUOTE"); if (!legacySeriesId) return t.skip("Nessuna serie globale storica presente nel fixture pre-migration."); const row = await createQuote(companyId, userId, documentInput(customerId, locationA, warehouseA, legacySeriesId)); documentIds.push(row.id); assert.equal((await getSalesDocument(companyId, locationA, row.id))?.locationId, locationA); });
