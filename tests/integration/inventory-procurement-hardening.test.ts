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
test("Active supplier/item/warehouse proposal and order pass shared Purchasing validation", async () => {
  const f = await fixture(); assert.ok((await getReorderProposals(companyId, locationId)).some(p => p.policyId === f.policy.id)); const result = await order([f.policy.id]); assert.equal(result.documentIds.length, 1);
  // Reorder has no bin selector: NULL remains explicit, never an arbitrary bin.
  assert.equal((await lines(result.documentIds[0]))[0].warehouseBinId, null); await receive(result.documentIds[0]); assert.equal(await balance(f.item.id), 30);
});
for (const state of ["suspended-supplier", "inactive-supplier", "deleted-supplier", "non-supplier", "inactive-link", "foreign-location-link", "inactive-item", "deleted-item", "non-purchasable-item", "inactive-warehouse", "deleted-warehouse", "inactive-purchase-uom", "deleted-purchase-uom", "inactive-stock-uom", "inactive-policy"]) {
  test(`Proposal filtering and stale creation fail closed: ${state}`, async () => {
    const f = await fixture(); assert.ok((await getReorderProposals(companyId, locationId)).some(p => p.policyId === f.policy.id));
    const stamp = new Date();
    if (state === "suspended-supplier") await prisma.partner.update({ where: { id: supplierId }, data: { status: "SUSPENDED" } });
    if (state === "inactive-supplier") await prisma.partner.update({ where: { id: supplierId }, data: { active: false } });
    if (state === "deleted-supplier") await prisma.partner.update({ where: { id: supplierId }, data: { deletedAt: stamp } });
    if (state === "non-supplier") await prisma.partner.update({ where: { id: supplierId }, data: { isSupplier: false } });
    if (state === "inactive-link") await prisma.itemSupplier.update({ where: { id: f.link.id }, data: { active: false } });
    if (state === "foreign-location-link") await prisma.itemSupplier.update({ where: { id: f.link.id }, data: { locationId: otherLocationId } });
    if (state === "inactive-item") await prisma.item.update({ where: { id: f.item.id }, data: { active: false } });
    if (state === "deleted-item") await prisma.item.update({ where: { id: f.item.id }, data: { deletedAt: stamp } });
    if (state === "non-purchasable-item") await prisma.item.update({ where: { id: f.item.id }, data: { purchasable: false } });
    if (state === "inactive-warehouse") await prisma.warehouse.update({ where: { id: warehouseId }, data: { active: false } });
    if (state === "deleted-warehouse") await prisma.warehouse.update({ where: { id: warehouseId }, data: { deletedAt: stamp } });
    if (state === "inactive-purchase-uom") await prisma.unitOfMeasure.update({ where: { id: purchaseUnit }, data: { active: false } });
    if (state === "deleted-purchase-uom") await prisma.unitOfMeasure.update({ where: { id: purchaseUnit }, data: { deletedAt: stamp } });
    if (state === "inactive-stock-uom") await prisma.unitOfMeasure.update({ where: { id: unitId }, data: { active: false } });
    if (state === "inactive-policy") await prisma.warehouseItemPolicy.update({ where: { id: f.policy.id }, data: { active: false } });
    try {
      assert.ok(!(await getReorderProposals(companyId, locationId)).some(p => p.policyId === f.policy.id));
      const audit = await prisma.auditLog.count({ where: { companyId } }), events = await prisma.domainEvent.count({ where: { companyId } });
      await rejectsNoOrder(() => order([f.policy.id])); assert.equal(await prisma.auditLog.count({ where: { companyId } }), audit); assert.equal(await prisma.domainEvent.count({ where: { companyId } }), events);
    } finally {
      await prisma.partner.update({ where: { id: supplierId }, data: { status: "ACTIVE", active: true, deletedAt: null, isSupplier: true } });
      await prisma.warehouse.update({ where: { id: warehouseId }, data: { active: true, deletedAt: null } });
      await prisma.unitOfMeasure.updateMany({ where: { id: { in: [unitId, purchaseUnit] } }, data: { active: true, deletedAt: null } });
    }
  });
}
test("Supplier of another company is rejected by shared link validation", async () => {
  const f = await fixture(); const supplier = await prisma.partner.create({ data: { companyId: otherCompanyId, code: "FOREIGN", name: "Foreign supplier", isSupplier: true } });
  await assert.rejects(saveItemSupplier(companyId, locationId, { itemId: f.item.id, supplierPartnerId: supplier.id, purchaseUomId: purchaseUnit, packSize: 6, minimumOrderQuantity: 1, leadTimeDays: 0, currency: "EUR", unitCost: 12 }));
});
async function purchase(binId: string, itemId: string, lineWarehouseId?: string) {
  const series = await prisma.documentSeries.findFirstOrThrow({ where: { companyId, locationId, documentType: "PURCHASE_ORDER" } });
  return createPurchaseOrder(companyId, userId, { seriesId: series.id, partnerId: supplierId, documentDate: new Date(), locationId, warehouseId, currency: "EUR", lines: [{ itemId, quantity: 1, unitOfMeasureId: purchaseUnit, unitPrice: 12, vatRateId: vatId, warehouseId: lineWarehouseId, warehouseBinId: binId }] });
}
test("Header warehouse correctly resolves matching bin; line warehouse override remains valid", async () => {
  const f = await fixture(); const bin = await prisma.warehouseBin.create({ data: { companyId, warehouseId, code: randomUUID(), name: "Valid" } });
  const doc = await purchase(bin.id, f.item.id); const row = (await lines(doc.id))[0]; assert.equal(row.warehouseBinId, bin.id); assert.equal(row.warehouseId, null);
  await receive(doc.id); assert.equal(await balance(f.item.id), 18);
  const wh = await prisma.warehouse.create({ data: { companyId, locationId, code: randomUUID(), name: "Override", createdById: userId } });
  const otherBin = await prisma.warehouseBin.create({ data: { companyId, warehouseId: wh.id, code: "BIN", name: "Override" } });
  const override = await purchase(otherBin.id, f.item.id, wh.id); assert.equal((await lines(override.id))[0].warehouseId, wh.id); assert.equal((await lines(override.id))[0].warehouseBinId, otherBin.id);
});
for (const kind of ["other-warehouse", "other-location", "other-company", "inactive", "deleted", "no-warehouse"]) {
  test(`Bin rejects at document creation: ${kind}`, async () => {
    const f = await fixture(); let company = companyId, location = locationId, warehouse = warehouseId;
    if (kind === "other-company") { company = otherCompanyId; location = (await prisma.location.create({ data: { companyId: company, code: randomUUID(), name: "Foreign" } })).id; }
    if (kind === "other-location") location = otherLocationId;
    if (kind.startsWith("other")) warehouse = (await prisma.warehouse.create({ data: { companyId: company, locationId: location, code: randomUUID(), name: "Wrong", createdById: userId } })).id;
    const bin = await prisma.warehouseBin.create({ data: { companyId: company, warehouseId: warehouse, code: randomUUID(), name: "Bin", active: kind !== "inactive", deletedAt: kind === "deleted" ? new Date() : null } });
    if (kind !== "no-warehouse") await rejectsNoOrder(() => purchase(bin.id, f.item.id));
    else {
      // Direct Document Engine caller must also reject a bin without any warehouse.
      const { createDraft } = await import("../../lib/documents"); const series = await prisma.documentSeries.findFirstOrThrow({ where: { companyId, locationId, documentType: "PURCHASE_ORDER" } });
      await rejectsNoOrder(() => createDraft(companyId, userId, { seriesId: series.id, partnerId: supplierId, documentDate: new Date(), locationId, lines: [{ itemId: f.item.id, quantity: 1, unitOfMeasureId: unitId, unitPrice: 1, vatRateId: vatId, warehouseBinId: bin.id }] }));
    }
  });
}
test("Draft edit validates header warehouse/bin before replacing lines", async () => {
  const { createDraft, updateDraft, getDocument } = await import("../../lib/documents"); const f = await fixture();
  const series = await prisma.documentSeries.findFirstOrThrow({ where: { companyId, locationId, documentType: "PURCHASE_ORDER" } });
  const validBin = await prisma.warehouseBin.create({ data: { companyId, warehouseId, code: randomUUID(), name: "Valid edit" } });
  const wrongWarehouse = await prisma.warehouse.create({ data: { companyId, locationId, code: randomUUID(), name: "Wrong edit", createdById: userId } });
  const wrongBin = await prisma.warehouseBin.create({ data: { companyId, warehouseId: wrongWarehouse.id, code: "BIN", name: "Wrong edit" } });
  const input = { partnerId: supplierId, documentDate: new Date(), locationId, warehouseId, lines: [{ itemId: f.item.id, quantity: 1, unitOfMeasureId: unitId, unitPrice: 1, vatRateId: vatId }] };
  const doc = await createDraft(companyId, userId, { ...input, seriesId: series.id }); const before = await getDocument(companyId, locationId, doc.id);
  await assert.rejects(updateDraft(companyId, userId, doc.id, { ...input, lines: [{ ...input.lines[0], warehouseBinId: wrongBin.id }] })); assert.deepEqual(await getDocument(companyId, locationId, doc.id), before);
  await updateDraft(companyId, userId, doc.id, { ...input, lines: [{ ...input.lines[0], warehouseBinId: validBin.id }] });
  const row = (await lines(doc.id))[0]; assert.equal(row.warehouseBinId, validBin.id); assert.equal(row.warehouseId, null); assert.equal(row.stockUnitOfMeasureId, null); assert.equal(row.purchaseConversionFactor, null);
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
  if (otherCompanyId) { await prisma.warehouseBin.deleteMany({ where: { companyId: otherCompanyId } }); await prisma.warehouse.deleteMany({ where: { companyId: otherCompanyId } }); await prisma.partner.deleteMany({ where: { companyId: otherCompanyId } }); await prisma.idempotencyRecord.deleteMany({ where: { companyId: otherCompanyId } }); await prisma.company.delete({ where: { id: otherCompanyId } }); }
  if (userId) await prisma.user.delete({ where: { id: userId } });
  await prisma.$disconnect();
});
