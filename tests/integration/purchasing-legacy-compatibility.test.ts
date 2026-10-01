import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { createDraft, confirmDocument, duplicateDraft, getDocument, postDocument } from "../../lib/documents";
import { postInventoryMovement } from "../../lib/inventory";
import { saveItemSupplier } from "../../lib/inventory-procurement";
import { MODULE_CODES } from "../../lib/module-catalog";
import { prisma } from "../../lib/prisma";
import { postGoodsReceipt, postPurchaseReturn, createPurchaseReturn } from "../../lib/purchasing";

const target = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (!target.pathname.endsWith("_test")) throw new Error("Goods receipt tests require an isolated _test database.");

let companyId = "", otherCompanyId = "", userId = "", locationId = "";
let warehouseId = "", supplierId = "", unitId = "", vatId = "", seriesId = "";
let itemA = "", itemB = "";
let binId = "", purchaseUnit = "";
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
  for (const code of ["A", "B"]) {
    const item = await prisma.item.create({ data: { companyId, code, name: code, type: "PRODUCT", unitOfMeasureId: unitId, vatRateId: vatId, stockManaged: true, purchasable: true, trackLots: code === "TRACKED", trackExpiration: code === "TRACKED", trackSerials: code === "TRACKED" } });
    if (code === "A") itemA = item.id;
    else itemB = item.id;
  }
  seriesId = (await prisma.documentSeries.create({ data: { companyId, locationId, code: "RECEIPT", name: "Receipt", documentType: "GOODS_RECEIPT" } })).id;
  binId = (await prisma.warehouseBin.create({ data: { companyId, warehouseId, code: "BIN", name: "Bin" } })).id;
  await prisma.documentSeries.create({ data: { companyId, locationId, code: "RETURN", name: "Return", documentType: "RETURN" } });
  purchaseUnit = (await prisma.unitOfMeasure.create({ data: { companyId, code: "BOX", name: "Box", symbol: "box", precision: 3 } })).id;
});

async function legacy(unit = purchaseUnit, item = itemA) {
  return (await createDraft(companyId, userId, { seriesId, partnerId: supplierId, documentDate: new Date(), locationId, warehouseId,
    lines: [{ itemId: item, quantity: 2, unitOfMeasureId: unit, unitPrice: 12, vatRateId: vatId, warehouseId, stockUnitOfMeasureId: null, purchaseConversionFactor: null, warehouseBinId: null }] })).id;
}
async function snapshot(id: string) {
  const row = await prisma.businessDocumentLine.findFirstOrThrow({ where: { companyId, documentId: id } });
  assert.equal(row.stockUnitOfMeasureId, null); assert.equal(row.purchaseConversionFactor, null); assert.equal(row.warehouseBinId, null); return row;
}
async function blocked(id: string) {
  await confirmDocument(companyId, userId, locationId, id); const before = await getDocument(companyId, locationId, id);
  const movements = await prisma.inventoryMovement.findMany({ where: { companyId }, orderBy: { id: "asc" } }), stock = await prisma.stockBalance.findMany({ where: { companyId }, orderBy: { id: "asc" } });
  await assert.rejects(postGoodsReceipt(companyId, userId, locationId, id), /Snapshot conversione UOM mancante/);
  assert.deepEqual(await getDocument(companyId, locationId, id), before); assert.deepEqual(await prisma.inventoryMovement.findMany({ where: { companyId }, orderBy: { id: "asc" } }), movements); assert.deepEqual(await prisma.stockBalance.findMany({ where: { companyId }, orderBy: { id: "asc" } }), stock); await snapshot(id);
  const copy = await duplicateDraft(companyId, userId, locationId, id); await snapshot(copy.id);
}
function supplier(itemId: string, factor: number) { return saveItemSupplier(companyId, locationId, { itemId, supplierPartnerId: supplierId, purchaseUomId: purchaseUnit, packSize: factor, minimumOrderQuantity: 1, leadTimeDays: 0, currency: "EUR", unitCost: 12 }); }
test("Legacy A: one exact historical receipt records base UOM, quantity and bin; no automatic repair", async () => {
  const id = await legacy(unitId), row = await snapshot(id); await confirmDocument(companyId, userId, locationId, id);
  // Reproduce the pre-Procurement engine path: persisted base-UOM movement,
  // then posted document. Current ItemSupplier is not historical evidence.
  await postInventoryMovement(companyId, userId, { locationId, warehouseId, binId, itemId: itemA, movementType: "RECEIPT", quantity: 2, unitOfMeasureId: unitId, referenceType: "BusinessDocumentLine", referenceId: row.id });
  await postDocument(companyId, userId, locationId, id);
  const evidence = await prisma.inventoryMovement.findMany({ where: { companyId, locationId, itemId: itemA, referenceType: "BusinessDocumentLine", referenceId: row.id, movementType: "RECEIPT", direction: 1, reversedBy: null } });
  assert.equal(evidence.length, 1); assert.equal(evidence[0].unitOfMeasureId, row.unitOfMeasureId); assert.equal(Number(evidence[0].quantity), Number(row.quantity)); assert.equal(evidence[0].binId, binId);
  await snapshot(id); const returned = await createPurchaseReturn(companyId, userId, locationId, id); await confirmDocument(companyId, userId, locationId, returned.id);
  const before = await getDocument(companyId, locationId, returned.id); await assert.rejects(postPurchaseReturn(companyId, userId, locationId, returned.id), /Snapshot conversione UOM mancante/); assert.deepEqual(await getDocument(companyId, locationId, returned.id), before); await snapshot(returned.id);
});
test("Legacy B: compatible current supplier cannot establish historical factor", async () => {
  await supplier(itemA, 6); const id = await legacy(); await blocked(id);
});
test("Legacy C: supplier changed from 6 to 10 cannot repair a historical line", async () => {
  await supplier(itemA, 6); const id = await legacy(); await supplier(itemA, 10); await blocked(id);
});
test("Legacy D: no ItemSupplier provides no conversion evidence", async () => {
  assert.equal(await prisma.itemSupplier.count({ where: { companyId, itemId: itemB } }), 0); await blocked(await legacy(purchaseUnit, itemB));
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
    await prisma.company.delete({ where: { id: companyId } });
  }
  if (otherCompanyId) await prisma.company.delete({ where: { id: otherCompanyId } });
  if (userId) await prisma.user.delete({ where: { id: userId } });
  await prisma.$disconnect();
});
