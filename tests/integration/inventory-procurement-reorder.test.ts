import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { confirmDocument } from "../../lib/documents";
import { postInventoryMovement } from "../../lib/inventory";
import { saveItemSupplier, saveWarehouseItemPolicy, getReorderProposals, createPurchaseOrdersFromReorder } from "../../lib/inventory-procurement";
import { MODULE_CODES } from "../../lib/module-catalog";
import { prisma } from "../../lib/prisma";
import { postGoodsReceipt, confirmPurchaseOrder, createReceiptFromPurchaseOrder } from "../../lib/purchasing";

const target = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (!target.pathname.endsWith("_test")) throw new Error("Goods receipt tests require an isolated _test database.");

let companyId = "", otherCompanyId = "", userId = "", locationId = "", otherLocationId = "";
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
  otherLocationId = (await prisma.location.create({ data: { companyId, code: "B", name: "Receipt B" } })).id;
  warehouseId = (await prisma.warehouse.create({ data: { companyId, locationId, code: "WH", name: "Receipt warehouse", createdById: userId } })).id;
  supplierId = (await prisma.partner.create({ data: { companyId, code: "SUP", name: "Supplier", isSupplier: true } })).id;
  unitId = (await prisma.unitOfMeasure.create({ data: { companyId, code: "PZ", name: "Piece", symbol: "pz", precision: 3 } })).id;
  vatId = (await prisma.vatRate.create({ data: { companyId, code: "VAT", name: "VAT", percentage: 10 } })).id;
  await prisma.documentSeries.create({ data: { companyId, locationId, code: "RECEIPT", name: "Receipt", documentType: "GOODS_RECEIPT" } });

  purchaseUnit = (await prisma.unitOfMeasure.create({ data: { companyId, code: "BOX", name: "Box", symbol: "box", precision: 3 } })).id;
  await prisma.documentSeries.create({ data: { companyId, locationId, code: "PO", name: "Purchase order", documentType: "PURCHASE_ORDER" } });
});

async function fixture(factor = 6, supplier = supplierId) {
  const item = await prisma.item.create({ data: { companyId, code: randomUUID(), name: "Reorder item", type: "PRODUCT", unitOfMeasureId: unitId, vatRateId: vatId, stockManaged: true, purchasable: true } });
  const link = await saveItemSupplier(companyId, locationId, { itemId: item.id, supplierPartnerId: supplier, purchaseUomId: purchaseUnit, preferred: true, packSize: factor, minimumOrderQuantity: 1, leadTimeDays: 0, currency: "EUR", unitCost: 12 });
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
test("Reorder 18 PCS -> 3 BOX snapshots -> normal receipt adds 18 PCS", async () => {
  const f = await fixture(); const proposal = (await getReorderProposals(companyId, locationId)).find(p => p.policyId === f.policy.id)!;
  assert.equal(proposal.available, 12); assert.equal(proposal.targetStock - proposal.available, 18); assert.equal(proposal.suggestedQty, 3);
  const result = await order([f.policy.id]); const [line] = await lines(result.documentIds[0]);
  assert.equal(Number(line.quantity), 3); assert.equal(line.unitOfMeasureId, purchaseUnit); assert.equal(line.stockUnitOfMeasureId, unitId); assert.equal(Number(line.purchaseConversionFactor), 6);
  // No policy/supplier field chooses a bin: NULL is explicit, no arbitrary bin.
  assert.equal(line.warehouseBinId, null);
  const id = await receive(result.documentIds[0]); const receiptLines = await lines(id);
  const movements = await prisma.inventoryMovement.findMany({ where: { companyId, referenceId: { in: receiptLines.map(l => l.id) } } });
  assert.equal(movements.length, 1); assert.equal(Number(movements[0].quantity), 18); assert.equal(movements[0].unitOfMeasureId, unitId); assert.equal(await balance(f.item.id), 30);
  assert.equal((await prisma.businessDocument.findUniqueOrThrow({ where: { id } })).status, "POSTED");
});
test("Supplier factor/UOM changes after reorder creation do not reinterpret snapshots", async () => {
  const f = await fixture(), result = await order([f.policy.id]); const before = await lines(result.documentIds[0]);
  await saveItemSupplier(companyId, locationId, { itemId: f.item.id, supplierPartnerId: supplierId, purchaseUomId: unitId, preferred: true, packSize: 10, minimumOrderQuantity: 1, leadTimeDays: 0, currency: "EUR", unitCost: 99 });
  assert.deepEqual(await lines(result.documentIds[0]), before);
  await receive(result.documentIds[0]); assert.equal(await balance(f.item.id), 30);
});
test("Two items group into one order and receive their independent factors", async () => {
  const a = await fixture(6), b = await fixture(3); const result = await order([a.policy.id, b.policy.id]);
  assert.equal(result.documentIds.length, 1); const rows = await lines(result.documentIds[0]); assert.equal(rows.length, 2);
  for (const [f, qty, factor] of [[a, 3, 6], [b, 6, 3]] as const) {
    const row = rows.find(r => r.itemId === f.item.id)!; assert.equal(Number(row.quantity), qty); assert.equal(Number(row.purchaseConversionFactor), factor); assert.equal(row.stockUnitOfMeasureId, unitId);
  }
  await receive(result.documentIds[0]); assert.equal(await balance(a.item.id), 30); assert.equal(await balance(b.item.id), 30);
});
test("Same idempotency key returns same order with no duplicate lines", async () => {
  const f = await fixture(), key = randomUUID(), first = await order([f.policy.id], key);
  const count = await prisma.businessDocument.count({ where: { companyId } }); const rows = await lines(first.documentIds[0]);
  assert.deepEqual(await order([f.policy.id], key), first); assert.equal(await prisma.businessDocument.count({ where: { companyId } }), count); assert.deepEqual(await lines(first.documentIds[0]), rows);
});
test("Missing active conversion link and invalid API factor fail closed", async () => {
  const f = await fixture();
  await assert.rejects(saveItemSupplier(companyId, locationId, { itemId: f.item.id, supplierPartnerId: supplierId, purchaseUomId: purchaseUnit, packSize: 0, minimumOrderQuantity: 1, leadTimeDays: 0, currency: "EUR", unitCost: 12 }));
  await prisma.itemSupplier.update({ where: { id: f.link.id }, data: { active: false } });
  await rejectsNoOrder(() => order([f.policy.id]));
});
test("Inactive purchase UOM rejects order without partial writes", async () => {
  const f = await fixture(); await prisma.unitOfMeasure.update({ where: { id: purchaseUnit }, data: { active: false } });
  try { await rejectsNoOrder(() => order([f.policy.id])); } finally { await prisma.unitOfMeasure.update({ where: { id: purchaseUnit }, data: { active: true } }); }
});
test("Supplier invalidated after proposal rejects and rolls back other supplier group", async () => {
  const valid = await fixture(); const supplier = await prisma.partner.create({ data: { companyId, code: randomUUID(), name: "Second", isSupplier: true } });
  const stale = await fixture(6, supplier.id); assert.ok((await getReorderProposals(companyId, locationId)).some(p => p.policyId === stale.policy.id));
  await prisma.partner.update({ where: { id: supplier.id }, data: { status: "SUSPENDED" } });
  await rejectsNoOrder(() => order([valid.policy.id, stale.policy.id]));
});
test("Foreign location policy and company cannot produce even a partial selected order", async () => {
  const f = await fixture(); const wh = await prisma.warehouse.create({ data: { companyId, locationId: otherLocationId, code: randomUUID(), name: "Foreign", createdById: userId } });
  const policy = await saveWarehouseItemPolicy(companyId, otherLocationId, { warehouseId: wh.id, itemId: f.item.id, reorderPoint: 1, targetStock: 10 });
  await rejectsNoOrder(() => order([f.policy.id, policy.id]));
  await rejectsNoOrder(() => createPurchaseOrdersFromReorder(otherCompanyId, locationId, userId, randomUUID(), [f.policy.id]));
  await assert.rejects(saveWarehouseItemPolicy(otherCompanyId, locationId, { warehouseId, itemId: f.item.id, reorderPoint: 1 }));
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
