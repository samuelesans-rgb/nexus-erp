import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { createDraft, confirmDocument, duplicateDraft, updateDraft, getDocument, type DraftInput } from "../../lib/documents";
import { MODULE_CODES } from "../../lib/module-catalog";
import { prisma } from "../../lib/prisma";
import { postGoodsReceipt } from "../../lib/purchasing";

const target = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (!target.pathname.endsWith("_test")) throw new Error("Goods receipt tests require an isolated _test database.");

let companyId = "", otherCompanyId = "", userId = "", locationId = "", otherLocationId = "";
let warehouseId = "", supplierId = "", unitId = "", vatId = "", seriesId = "";
let itemA = "", itemB = "";
let binId = "", purchaseUnit = "", supplierLink = "";
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
  for (const code of ["A", "B"]) {
    const item = await prisma.item.create({ data: { companyId, code, name: code, type: "PRODUCT", unitOfMeasureId: unitId, vatRateId: vatId, stockManaged: true, purchasable: true, trackLots: code === "TRACKED", trackExpiration: code === "TRACKED", trackSerials: code === "TRACKED" } });
    if (code === "A") itemA = item.id;
    else itemB = item.id;
  }
  seriesId = (await prisma.documentSeries.create({ data: { companyId, locationId, code: "RECEIPT", name: "Receipt", documentType: "GOODS_RECEIPT" } })).id;
  binId = (await prisma.warehouseBin.create({ data: { companyId, warehouseId, code: "BIN", name: "Bin" } })).id;
  purchaseUnit = (await prisma.unitOfMeasure.create({ data: { companyId, code: "BOX", name: "Box", symbol: "box", precision: 3 } })).id;
  supplierLink = (await prisma.itemSupplier.create({ data: { companyId, locationId, itemId: itemA, supplierPartnerId: supplierId, purchaseUomId: purchaseUnit, packSize: 6, unitCost: 12 } })).id;
});

// Policy: preserve source snapshots; never recalculate from current supplier
// data. Reject structural edits of snapshot-bearing rows. Legacy NULL stays NULL.
function input(legacy = false): DraftInput {
  return { seriesId, partnerId: supplierId, documentDate: new Date(), locationId, warehouseId,
    lines: [{ itemId: itemA, quantity: 2, unitOfMeasureId: purchaseUnit, unitPrice: 12, vatRateId: vatId, warehouseId,
      stockUnitOfMeasureId: legacy ? null : unitId, purchaseConversionFactor: legacy ? null : 6, warehouseBinId: legacy ? null : binId }] };
}
async function document(legacy = false) { return (await createDraft(companyId, userId, input(legacy))).id; }
async function snapshots(id: string) {
  const row = await prisma.businessDocumentLine.findFirstOrThrow({ where: { companyId, documentId: id } });
  return { stockUnitOfMeasureId: row.stockUnitOfMeasureId, purchaseConversionFactor: row.purchaseConversionFactor === null ? null : Number(row.purchaseConversionFactor), warehouseBinId: row.warehouseBinId };
}
async function edit(id: string, change: Partial<DraftInput["lines"][number]>) {
  const source = await getDocument(companyId, locationId, id); assert.ok(source);
  const line = source.lines[0];
  await updateDraft(companyId, userId, id, { ...input(), lines: [{ ...input().lines[0], id: line.id,
    stockUnitOfMeasureId: undefined, purchaseConversionFactor: undefined, warehouseBinId: undefined, ...change }] });
}
for (const [name, change] of [["quantity", { quantity: 3 }], ["price", { unitPrice: 15 }], ["description/notes", { description: "Edited", notes: "Safe edit" }]] as const) {
  test(`Edit ${name} preserves all three snapshots with action-shaped omissions`, async () => {
    const id = await document(), before = await snapshots(id); await edit(id, change); assert.deepEqual(await snapshots(id), before);
    const updated = await prisma.businessDocumentLine.findFirstOrThrow({ where: { documentId: id, companyId } });
    if ("quantity" in change) assert.equal(Number(updated.quantity), change.quantity);
    if ("unitPrice" in change) assert.equal(Number(updated.unitPrice), change.unitPrice);
    if ("description" in change) { assert.equal(updated.description, change.description); assert.equal(updated.notes, change.notes); }
  });
}
test("Supplier changes do not alter snapshots during edit", async () => {
  const id = await document(), before = await snapshots(id);
  await prisma.itemSupplier.update({ where: { id: supplierLink }, data: { packSize: 24, purchaseUomId: unitId, unitCost: 99 } });
  await edit(id, { quantity: 4 }); assert.deepEqual(await snapshots(id), before);
});
test("Structural item, UOM, warehouse, bin and snapshot edits reject without writes", async () => {
  const id = await document(); const before = await getDocument(companyId, locationId, id);
  const otherWarehouse = await prisma.warehouse.create({ data: { companyId, locationId, code: "OTHER", name: "Other", createdById: userId } });
  const otherBin = await prisma.warehouseBin.create({ data: { companyId, warehouseId: otherWarehouse.id, code: "OTHER", name: "Other" } });
  for (const change of [{ itemId: itemB }, { unitOfMeasureId: unitId }, { warehouseId: otherWarehouse.id }, { warehouseBinId: otherBin.id }, { stockUnitOfMeasureId: null }, { purchaseConversionFactor: 99 }]) {
    await assert.rejects(edit(id, change), /Modifica strutturale/); assert.deepEqual(await getDocument(companyId, locationId, id), before);
  }
});
test("Duplicate standard preserves snapshots and can be received with correct stock conversion", async () => {
  const id = await document(), copy = await duplicateDraft(companyId, userId, locationId, id);
  assert.deepEqual(await snapshots(copy.id), await snapshots(id));
  await confirmDocument(companyId, userId, locationId, copy.id); await postGoodsReceipt(companyId, userId, locationId, copy.id);
  assert.equal((await getDocument(companyId, locationId, copy.id))?.status, "POSTED");
  const line = await prisma.businessDocumentLine.findFirstOrThrow({ where: { documentId: copy.id } });
  const movement = await prisma.inventoryMovement.findFirstOrThrow({ where: { companyId, referenceId: line.id } });
  assert.equal(Number(movement.quantity), 12); assert.equal(movement.unitOfMeasureId, unitId); assert.equal(movement.binId, binId);
});
test("Duplicate after supplier change preserves original conversion, UOM and bin", async () => {
  const id = await document(); await prisma.itemSupplier.update({ where: { id: supplierLink }, data: { packSize: 48, unitCost: 123, purchaseUomId: unitId } });
  const copy = await duplicateDraft(companyId, userId, locationId, id); assert.deepEqual(await snapshots(copy.id), await snapshots(id));
  await confirmDocument(companyId, userId, locationId, copy.id); await postGoodsReceipt(companyId, userId, locationId, copy.id);
});
test("Legacy duplicate keeps NULL snapshots and legacy receive remains unresolved", async () => {
  const id = await document(true), copy = await duplicateDraft(companyId, userId, locationId, id);
  assert.deepEqual(await snapshots(copy.id), { stockUnitOfMeasureId: null, purchaseConversionFactor: null, warehouseBinId: null });
  await confirmDocument(companyId, userId, locationId, copy.id);
  await assert.rejects(postGoodsReceipt(companyId, userId, locationId, copy.id), /Snapshot conversione UOM mancante/);
});
test("Tenant/location and foreign line identity reject edit and duplicate", async () => {
  const id = await document(), before = await getDocument(companyId, locationId, id);
  await assert.rejects(updateDraft(otherCompanyId, userId, id, input()));
  await assert.rejects(updateDraft(companyId, userId, id, { ...input(), locationId: otherLocationId }));
  await assert.rejects(duplicateDraft(otherCompanyId, userId, locationId, id));
  await assert.rejects(duplicateDraft(companyId, userId, otherLocationId, id));
  await assert.rejects(edit(id, { id: "foreign-line" }), /Riga non appartenente/);
  assert.deepEqual(await getDocument(companyId, locationId, id), before);
});
test("Preserved bin must remain active and compatible; failed edit/duplicate writes nothing", async () => {
  const id = await document(); await prisma.warehouseBin.update({ where: { id: binId }, data: { active: false } });
  const before = await getDocument(companyId, locationId, id), count = await prisma.businessDocument.count({ where: { companyId } });
  try {
    await assert.rejects(edit(id, { quantity: 5 }), /Bin snapshot/);
    await assert.rejects(duplicateDraft(companyId, userId, locationId, id), /Bin snapshot/);
    assert.deepEqual(await getDocument(companyId, locationId, id), before);
    assert.equal(await prisma.businessDocument.count({ where: { companyId } }), count);
  } finally { await prisma.warehouseBin.update({ where: { id: binId }, data: { active: true } }); }
});
test("Single-line payload cannot silently discard another Procurement row", async () => {
  const data = input(); data.lines.push({ ...data.lines[0], itemId: itemB });
  const id = (await createDraft(companyId, userId, data)).id; const before = await getDocument(companyId, locationId, id);
  await assert.rejects(edit(id, { quantity: 5 }), /ambigua/);
  assert.deepEqual(await getDocument(companyId, locationId, id), before);
});
after(async () => {
  if (companyId) {
    await prisma.inventoryMovement.deleteMany({ where: { companyId } });
    await prisma.stockBalance.deleteMany({ where: { companyId } });
    await prisma.documentEvent.deleteMany({ where: { companyId } });
    await prisma.domainEvent.deleteMany({ where: { companyId } });
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
