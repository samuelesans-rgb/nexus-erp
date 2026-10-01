import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { confirmDocument } from "../../lib/documents";
import { postInventoryMovement } from "../../lib/inventory";
import { saveItemSupplier, saveWarehouseItemPolicy, getReorderProposals, createPurchaseOrdersFromReorder } from "../../lib/inventory-procurement";
import { MODULE_CODES } from "../../lib/module-catalog";
import { prisma } from "../../lib/prisma";
import { postGoodsReceipt, confirmPurchaseOrder, createReceiptFromPurchaseOrder, createPurchaseOrder } from "../../lib/purchasing";

const target = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (!target.pathname.endsWith("_test")) throw new Error("Goods receipt tests require an isolated _test database.");

let companyId = "", otherCompanyId = "", userId = "", locationId = "";
let warehouseId = "", supplierId = "", unitId = "", vatId = "";

let purchaseUnit = "";
const suffix = randomUUID();

before(async () => {
  const identity = await prisma.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`;
  assert.equal(identity[0].db, decodeURIComponent(target.pathname.slice(1)));
  assert.ok(identity[0].db.endsWith("_test"));
  companyId = (await prisma.company.create({ data: { name: `Atomic receipt ${suffix}` } })).id;
  otherCompanyId = (await prisma.company.create({ data: { name: `Other atomic receipt ${suffix}` } })).id;
  userId = (await prisma.user.create({ data: { email: `${suffix}@atomic-receipt.invalid`, firstName: "Atomic", lastName: "Receipt", password: "UNUSABLE_TEST_PASSWORD" } })).id;
  await prisma.membership.create({ data: { companyId, userId } });
  const moduleDefinition = await prisma.moduleDefinition.upsert({ where: { code: MODULE_CODES.CORE_INVENTORY }, create: { code: MODULE_CODES.CORE_INVENTORY, name: "Inventory", category: "CORE", status: "AVAILABLE" }, update: {} });
  await prisma.companyModule.createMany({ data: [companyId, otherCompanyId].map((id) => ({ companyId: id, moduleDefinitionId: moduleDefinition.id, enabled: true })) });
  locationId = (await prisma.location.create({ data: { companyId, code: "A", name: "Receipt A" } })).id;
  warehouseId = (await prisma.warehouse.create({ data: { companyId, locationId, code: "WH", name: "Receipt warehouse", createdById: userId } })).id;
  supplierId = (await prisma.partner.create({ data: { companyId, code: "SUP", name: "Supplier", isSupplier: true } })).id;
  unitId = (await prisma.unitOfMeasure.create({ data: { companyId, code: "PZ", name: "Piece", symbol: "pz", precision: 3 } })).id;
  vatId = (await prisma.vatRate.create({ data: { companyId, code: "VAT", name: "VAT", percentage: 10 } })).id;
  await prisma.documentSeries.create({ data: { companyId, locationId, code: "RECEIPT", name: "Receipt", documentType: "GOODS_RECEIPT" } });

  purchaseUnit = (await prisma.unitOfMeasure.create({ data: { companyId, code: "BOX", name: "Box", symbol: "box", precision: 3 } })).id;
  await prisma.documentSeries.create({ data: { companyId, locationId, code: "PO", name: "Purchase order", documentType: "PURCHASE_ORDER" } });
});

async function fixture(currency = "EUR") {
  const item = await prisma.item.create({ data: { companyId, code: randomUUID(), name: "Reorder item", type: "PRODUCT", unitOfMeasureId: unitId, vatRateId: vatId, stockManaged: true, purchasable: true } });
  const link = await saveItemSupplier(companyId, locationId, { itemId: item.id, supplierPartnerId: supplierId, purchaseUomId: purchaseUnit, preferred: true, packSize: 6, minimumOrderQuantity: 1, leadTimeDays: 0, currency, unitCost: 24 });
  await postInventoryMovement(companyId, userId, { locationId, warehouseId, itemId: item.id, movementType: "OPENING", quantity: 12, unitOfMeasureId: unitId, unitCost: 1 });
  const policy = await saveWarehouseItemPolicy(companyId, locationId, { warehouseId, itemId: item.id, minimumStock: 12, reorderPoint: 12, targetStock: 30 });
  return { item, link, policy };
}
async function order(ids: string[], key = randomUUID()) { return createPurchaseOrdersFromReorder(companyId, locationId, userId, key, ids); }
async function lines(id: string) { return prisma.businessDocumentLine.findMany({ where: { companyId, documentId: id }, orderBy: { lineNumber: "asc" } }); }
async function receive(id: string) {
  await confirmPurchaseOrder(companyId, userId, locationId, id);
  const receipt = await createReceiptFromPurchaseOrder(companyId, userId, locationId, id);
  await confirmDocument(companyId, userId, locationId, receipt.id);
  await postGoodsReceipt(companyId, userId, locationId, receipt.id); return receipt.id;
}
async function balance(itemId: string) { return Number((await prisma.stockBalance.findFirstOrThrow({ where: { companyId, warehouseId, itemId } })).quantity); }
async function rejectsNoOrder(run: () => Promise<unknown>) {
  const before = await prisma.businessDocument.findMany({ where: { companyId }, orderBy: { id: "asc" } });
  const beforeLines = await prisma.businessDocumentLine.findMany({ where: { companyId }, orderBy: { id: "asc" } });
  await assert.rejects(run());
  assert.deepEqual(await prisma.businessDocument.findMany({ where: { companyId }, orderBy: { id: "asc" } }), before);
  assert.deepEqual(await prisma.businessDocumentLine.findMany({ where: { companyId }, orderBy: { id: "asc" } }), beforeLines);
}
test("EUR proposal/order retain 24 EUR and normal receipt works", async () => {
  const f = await fixture(); const proposal = (await getReorderProposals(companyId, locationId)).find(p => p.policyId === f.policy.id)!;
  assert.equal(proposal.currency, "EUR"); assert.equal(proposal.unitCost, 24); const result = await order([f.policy.id]);
  const doc = await prisma.businessDocument.findUniqueOrThrow({ where: { id: result.documentIds[0] } }); assert.equal(doc.currency, "EUR"); assert.equal(Number((await lines(doc.id))[0].unitPrice), 24);
  await receive(doc.id); assert.equal(await balance(f.item.id), 30);
});
test("USD proposal retains its monetary meaning; reorder fails closed with no EUR order", async () => {
  const f = await fixture("USD"), proposal = (await getReorderProposals(companyId, locationId)).find(p => p.policyId === f.policy.id)!;
  assert.equal(proposal.currency, "USD"); assert.equal(proposal.unitCost, 24); await rejectsNoOrder(() => order([f.policy.id]));
});
test("Mixed EUR/USD for same supplier rejects entire selection before orders", async () => {
  const eur = await fixture(), usd = await fixture("USD"); const events = await prisma.auditLog.count({ where: { companyId } });
  await rejectsNoOrder(() => order([eur.policy.id, usd.policy.id])); assert.equal(await prisma.auditLog.count({ where: { companyId } }), events);
});
test("EUR idempotent retry preserves currency, prices and rows without duplicates", async () => {
  const f = await fixture(), key = randomUUID(), first = await order([f.policy.id], key), rows = await lines(first.documentIds[0]);
  const docs = await prisma.businessDocument.findMany({ where: { companyId }, orderBy: { id: "asc" } }); assert.deepEqual(await order([f.policy.id], key), first);
  assert.deepEqual(await lines(first.documentIds[0]), rows); assert.deepEqual(await prisma.businessDocument.findMany({ where: { companyId }, orderBy: { id: "asc" } }), docs);
});
test("Created EUR document and cost stay immutable after supplier currency/cost change", async () => {
  const f = await fixture(), result = await order([f.policy.id]), id = result.documentIds[0]; const doc = await prisma.businessDocument.findUniqueOrThrow({ where: { id } }), rows = await lines(id);
  await saveItemSupplier(companyId, locationId, { itemId: f.item.id, supplierPartnerId: supplierId, purchaseUomId: purchaseUnit, preferred: true, packSize: 6, minimumOrderQuantity: 1, leadTimeDays: 0, currency: "USD", unitCost: 30 });
  assert.deepEqual(await prisma.businessDocument.findUniqueOrThrow({ where: { id } }), doc); assert.deepEqual(await lines(id), rows);
  assert.equal(doc.currency, "EUR"); assert.equal(Number(rows[0].unitPrice), 24);
});
for (const currency of ["", "ZZZ", "EURO"]) {
  test(`Invalid currency ${JSON.stringify(currency)} rejects API and persisted legacy link`, async () => {
    const f = await fixture(); await assert.rejects(saveItemSupplier(companyId, locationId, { itemId: f.item.id, supplierPartnerId: supplierId, purchaseUomId: purchaseUnit, packSize: 6, minimumOrderQuantity: 1, leadTimeDays: 0, currency, unitCost: 24 }), /valuta supplier/);
    assert.equal((await prisma.itemSupplier.findUniqueOrThrow({ where: { id: f.link.id } })).currency, "EUR");
    // Simulate malformed preexisting data in the isolated DB, not API coercion.
    await prisma.itemSupplier.update({ where: { id: f.link.id }, data: { currency } }); await rejectsNoOrder(() => order([f.policy.id]));
    await prisma.itemSupplier.update({ where: { id: f.link.id }, data: { active: false } });
  });
}
test("Inactive supplier and inactive link reject currency-bearing reorder", async () => {
  const f = await fixture(); await prisma.partner.update({ where: { id: supplierId }, data: { active: false } });
  try { await rejectsNoOrder(() => order([f.policy.id])); } finally { await prisma.partner.update({ where: { id: supplierId }, data: { active: true } }); }
  await prisma.itemSupplier.update({ where: { id: f.link.id }, data: { active: false } }); await rejectsNoOrder(() => order([f.policy.id]));
});
test("Non-EUR company/document mismatch fails closed without inventing exchange rate", async () => {
  const f = await fixture(); await prisma.company.update({ where: { id: companyId }, data: { currency: "USD" } });
  try { await rejectsNoOrder(() => order([f.policy.id])); } finally { await prisma.company.update({ where: { id: companyId }, data: { currency: "EUR" } }); }
});
test("Standard purchase path preserves explicitly supplied USD and exchange rate", async () => {
  const f = await fixture("USD"); const series = await prisma.documentSeries.findFirstOrThrow({ where: { companyId, locationId, documentType: "PURCHASE_ORDER" } });
  const result = await createPurchaseOrder(companyId, userId, { seriesId: series.id, partnerId: supplierId, documentDate: new Date(), locationId, warehouseId, currency: "USD", exchangeRate: 1.2,
    lines: [{ itemId: f.item.id, unitOfMeasureId: purchaseUnit, quantity: 3, unitPrice: 24, vatRateId: vatId, warehouseId }] });
  const doc = await prisma.businessDocument.findUniqueOrThrow({ where: { id: result.id } }); assert.equal(doc.currency, "USD"); assert.equal(Number(doc.exchangeRate), 1.2); assert.equal(Number((await lines(doc.id))[0].unitPrice), 24);
});
after(async () => {
  if (companyId) {
    await prisma.inventoryMovement.deleteMany({ where: { companyId } });
    await prisma.stockBalance.deleteMany({ where: { companyId } });
    await prisma.documentEvent.deleteMany({ where: { companyId } });
    await prisma.domainEvent.deleteMany({ where: { companyId } });
    await prisma.documentLink.deleteMany({ where: { companyId } });
    await prisma.businessDocument.deleteMany({ where: { companyId } });
    await prisma.documentSeries.deleteMany({ where: { companyId } });
    await prisma.inventoryLot.deleteMany({ where: { companyId } });
    await prisma.inventorySerial.deleteMany({ where: { companyId } });
    await prisma.itemSupplier.deleteMany({ where: { companyId } });
    await prisma.warehouseBin.deleteMany({ where: { companyId } });
    await prisma.warehouse.deleteMany({ where: { companyId } });
    await prisma.item.deleteMany({ where: { companyId } });
    await prisma.partner.deleteMany({ where: { companyId } });
    await prisma.vatRate.deleteMany({ where: { companyId } });
    await prisma.unitOfMeasure.deleteMany({ where: { companyId } });
    await prisma.auditLog.deleteMany({ where: { companyId } });
    await prisma.idempotencyRecord.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
  }
  if (otherCompanyId) { await prisma.idempotencyRecord.deleteMany({ where: { companyId: otherCompanyId } }); await prisma.company.delete({ where: { id: otherCompanyId } }); }
  if (userId) await prisma.user.delete({ where: { id: userId } });
  await prisma.$disconnect();
});
