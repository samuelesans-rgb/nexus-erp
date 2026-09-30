import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { prisma } from "../../lib/prisma";
import { confirmDocument, postDocument } from "../../lib/documents";
import { postInventoryMovement } from "../../lib/inventory";
import { confirmPurchaseOrder, createCreditNoteFromReturn, createPurchaseOrder, createPurchaseReturn, createReceiptFromPurchaseOrder, postGoodsReceipt, postPurchaseReturn } from "../../lib/purchasing";

if (!(process.env.DATABASE_URL ?? "").includes("_test")) throw new Error("I test Treasury richiedono un DATABASE_URL dedicato contenente _test.");

let companyId = "", userId = "", locationId = "", warehouseId = "", supplierId = "", itemId = "", unitId = "", vatId = "", termId = "";
let purchaseOrderId = "", receiptId = "", returnId = "", creditNoteId = "";
const seriesIds: string[] = [], documentIds: string[] = [], movementIds: string[] = [];

before(async () => {
  companyId = (await prisma.company.findUniqueOrThrow({ where: { vatNumber: "IT00000000000" } })).id;
  userId = (await prisma.user.findFirstOrThrow({ where: { memberships: { some: { companyId, active: true } } }, select: { id: true } })).id;
  const s = randomUUID().slice(0, 8);
  const [location, supplier, unit, vat, term] = await Promise.all([
    prisma.location.create({ data: { companyId, code: `TPC-L-${s}`, name: "Treasury Purchase Credit" } }),
    prisma.partner.create({ data: { companyId, code: `TPC-S-${s}`, name: "Fornitore Nota Credito", isSupplier: true } }),
    prisma.unitOfMeasure.create({ data: { companyId, code: `TPC-U-${s}`, name: "Unità TPC", symbol: "pz" } }),
    prisma.vatRate.create({ data: { companyId, code: `TPC-V-${s}`, name: "IVA TPC", percentage: 22 } }),
    prisma.paymentTerm.create({ data: { companyId, code: `TPC-T-${s}`, name: "Termine TPC", dueDays: 30 } }),
  ]);
  locationId = location.id; supplierId = supplier.id; unitId = unit.id; vatId = vat.id; termId = term.id;
  itemId = (await prisma.item.create({ data: { companyId, code: `TPC-I-${s}`, name: "Item TPC", type: "PRODUCT", unitOfMeasureId: unitId, vatRateId: vatId, salePrice: 50, purchasePrice: 50, stockManaged: true, purchasable: true } })).id;
  warehouseId = (await prisma.warehouse.create({ data: { companyId, locationId, code: `TPC-W-${s}`, name: "Magazzino TPC", allowNegativeStock: true, createdById: userId } })).id;
  for (const type of ["PURCHASE_ORDER", "GOODS_RECEIPT", "RETURN", "CREDIT_NOTE"] as const) {
    const row = await prisma.documentSeries.create({ data: { companyId, locationId, code: `TPC-${type}-${s}`, name: `Serie ${type}`, documentType: type } });
    seriesIds.push(row.id);
  }
  const opening = await postInventoryMovement(companyId, userId, { locationId, warehouseId, itemId, movementType: "ADJUSTMENT_IN", quantity: 10, unitOfMeasureId: unitId, referenceType: "TreasuryPurchaseCreditNoteTest", referenceId: s });
  movementIds.push(opening.id);
});

after(async () => {
  const schedules = await prisma.paymentSchedule.findMany({ where: { documentId: { in: documentIds } }, select: { id: true } });
  if (schedules.length) await prisma.paymentSchedule.deleteMany({ where: { id: { in: schedules.map((row) => row.id) } } });
  if (documentIds.length) {
    await prisma.documentLink.deleteMany({ where: { OR: [{ sourceDocumentId: { in: documentIds } }, { targetDocumentId: { in: documentIds } }] } });
    await prisma.documentEvent.deleteMany({ where: { documentId: { in: documentIds } } });
    await prisma.domainEvent.deleteMany({ where: { aggregateType: "BusinessDocument", aggregateId: { in: documentIds } } });
    const lines = await prisma.businessDocumentLine.findMany({ where: { documentId: { in: documentIds } }, select: { id: true } });
    await prisma.inventoryMovement.deleteMany({ where: { referenceType: "BusinessDocumentLine", referenceId: { in: lines.map((row) => row.id) } } });
    await prisma.businessDocument.deleteMany({ where: { id: { in: documentIds } } });
  }
  if (movementIds.length) await prisma.inventoryMovement.deleteMany({ where: { id: { in: movementIds } } });
  await prisma.stockBalance.deleteMany({ where: { warehouseId } });
  if (seriesIds.length) await prisma.documentSeries.deleteMany({ where: { id: { in: seriesIds } } });
  await prisma.warehouse.delete({ where: { id: warehouseId } });
  if (itemId) await prisma.item.delete({ where: { id: itemId } });
  if (supplierId) await prisma.partner.delete({ where: { id: supplierId } });
  if (termId) await prisma.paymentTerm.delete({ where: { id: termId } });
  if (vatId) await prisma.vatRate.delete({ where: { id: vatId } });
  if (unitId) await prisma.unitOfMeasure.delete({ where: { id: unitId } });
  if (locationId) await prisma.location.delete({ where: { id: locationId } });
  await prisma.$disconnect();
});

test("Treasury: la nota di credito d'acquisto genera una scadenza RECEIVABLE, non PAYABLE", async () => {
  const order = await createPurchaseOrder(companyId, userId, { partnerId: supplierId, documentDate: new Date(), currency: "EUR", locationId, warehouseId, paymentTermId: termId, lines: [{ itemId, quantity: 2, unitOfMeasureId: unitId, unitPrice: 50, vatRateId: vatId, warehouseId }] });
  purchaseOrderId = order.id; documentIds.push(purchaseOrderId);
  await confirmPurchaseOrder(companyId, userId, locationId, purchaseOrderId);

  const receipt = await createReceiptFromPurchaseOrder(companyId, userId, locationId, purchaseOrderId);
  receiptId = receipt.id; documentIds.push(receiptId);
  await confirmDocument(companyId, userId, locationId, receiptId);
  await postGoodsReceipt(companyId, userId, locationId, receiptId);

  const purchaseReturn = await createPurchaseReturn(companyId, userId, locationId, receiptId);
  returnId = purchaseReturn.id; documentIds.push(returnId);
  await confirmDocument(companyId, userId, locationId, returnId);
  await postPurchaseReturn(companyId, userId, locationId, returnId);

  const creditNote = await createCreditNoteFromReturn(companyId, userId, locationId, returnId);
  creditNoteId = creditNote.id; documentIds.push(creditNoteId);
  await confirmDocument(companyId, userId, locationId, creditNoteId);
  await postDocument(companyId, userId, locationId, creditNoteId);

  const schedule = await prisma.paymentSchedule.findFirstOrThrow({ where: { companyId, locationId, documentId: creditNoteId } });
  assert.equal(schedule.direction, "RECEIVABLE");
});
