import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { createDraft, confirmDocument } from "../../lib/documents";
import { postInventoryMovement } from "../../lib/inventory";
import { saveItemSupplier } from "../../lib/inventory-procurement";
import { MODULE_CODES } from "../../lib/module-catalog";
import { prisma } from "../../lib/prisma";
import { postGoodsReceipt, postPurchaseReturn, createPurchaseReturn } from "../../lib/purchasing";

const target = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (!target.pathname.endsWith("_test")) throw new Error("Goods receipt tests require an isolated _test database.");

let companyId = "", otherCompanyId = "", userId = "", locationId = "", otherLocationId = "";
let warehouseId = "", supplierId = "", unitId = "", vatId = "", seriesId = "";
let itemA = "", itemB = "", trackedItem = "", lotId = "", serialId = "";
let purchaseUnit = "", caseUnit = "", returnSeries = "";
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
  for (const code of ["A", "B", "TRACKED"]) {
    const item = await prisma.item.create({ data: { companyId, code, name: code, type: "PRODUCT", unitOfMeasureId: unitId, vatRateId: vatId, stockManaged: true, purchasable: true, trackLots: code === "TRACKED", trackExpiration: code === "TRACKED", trackSerials: code === "TRACKED" } });
    if (code === "A") itemA = item.id;
    else if (code === "B") itemB = item.id;
    else trackedItem = item.id;
  }
  lotId = (await prisma.inventoryLot.create({ data: { companyId, locationId, itemId: trackedItem, lotNumber: "LOT", expirationDate: new Date("2099-01-01") } })).id;
  serialId = (await prisma.inventorySerial.create({ data: { companyId, locationId, itemId: trackedItem, serialNumber: suffix, status: "ISSUED" } })).id;
  seriesId = (await prisma.documentSeries.create({ data: { companyId, locationId, code: "RECEIPT", name: "Receipt", documentType: "GOODS_RECEIPT" } })).id;
  purchaseUnit = (await prisma.unitOfMeasure.create({ data: { companyId, code: "BOX", name: "Box", symbol: "box", precision: 3 } })).id;
  caseUnit = (await prisma.unitOfMeasure.create({ data: { companyId, code: "CASE", name: "Case", symbol: "case", precision: 3 } })).id;
  returnSeries = (await prisma.documentSeries.create({ data: { companyId, locationId, code: "RETURN", name: "Return", documentType: "RETURN" } })).id;
});

function line(itemId: string, quantity: number, extra: Record<string, unknown> = {}) {
  return { itemId, quantity, unitOfMeasureId: purchaseUnit, stockUnitOfMeasureId: unitId, purchaseConversionFactor: 6, unitPrice: 12, vatRateId: vatId, warehouseId, ...extra };
}
async function freshItem() { return (await prisma.item.create({ data: { companyId, code: randomUUID(), name: "Return item", type: "PRODUCT", unitOfMeasureId: unitId, vatRateId: vatId, stockManaged: true, purchasable: true } })).id; }
async function receipt(lines: ReturnType<typeof line>[]) {
  const row = await createDraft(companyId, userId, { seriesId, partnerId: supplierId, documentDate: new Date(), locationId, warehouseId, lines });
  await confirmDocument(companyId, userId, locationId, row.id); await postGoodsReceipt(companyId, userId, locationId, row.id); return row.id;
}
async function returned(sourceId: string, quantities?: Record<string, number>) {
  const row = await createPurchaseReturn(companyId, userId, locationId, sourceId, quantities);
  await confirmDocument(companyId, userId, locationId, row.id); return row.id;
}
async function rows(id: string) { return prisma.businessDocumentLine.findMany({ where: { companyId, documentId: id }, orderBy: { lineNumber: "asc" } }); }
async function movements(id: string) { return prisma.inventoryMovement.findMany({ where: { companyId, movementType: "RETURN_OUT", referenceId: { in: (await rows(id)).map(l => l.id) } } }); }
async function balance(itemId: string) { return Number((await prisma.stockBalance.findFirstOrThrow({ where: { companyId, warehouseId, itemId } })).quantity); }
async function state(id: string) {
  return { document: await prisma.businessDocument.findUniqueOrThrow({ where: { id } }),
    movements: await prisma.inventoryMovement.findMany({ where: { companyId }, orderBy: { id: "asc" } }),
    balances: await prisma.stockBalance.findMany({ where: { companyId }, orderBy: { id: "asc" } }),
    lots: await prisma.inventoryLot.findMany({ where: { companyId }, orderBy: { id: "asc" } }),
    serials: await prisma.inventorySerial.findMany({ where: { companyId }, orderBy: { id: "asc" } }),
    events: await prisma.domainEvent.findMany({ where: { companyId }, orderBy: { id: "asc" } }),
    documentEvents: await prisma.documentEvent.findMany({ where: { companyId }, orderBy: { id: "asc" } }) };
}
let retryReturn = "", retryItem = "";
test("2 BOX received +12 PCS; returning 1 BOX subtracts 6 PCS", async () => {
  const item = await freshItem(), source = await receipt([line(item, 2)]), sourceLine = (await rows(source))[0];
  assert.equal(await balance(item), 12);
  const id = await returned(source, { [sourceLine.id]: 1 }); await postPurchaseReturn(companyId, userId, locationId, id);
  const row = (await rows(id))[0], movement = (await movements(id))[0];
  assert.equal(Number(row.quantity), 1); assert.equal(row.unitOfMeasureId, purchaseUnit); assert.equal(row.stockUnitOfMeasureId, unitId); assert.equal(Number(row.purchaseConversionFactor), 6);
  assert.equal(Number(movement.quantity), 6); assert.equal(movement.direction, -1); assert.equal(movement.unitOfMeasureId, unitId); assert.equal(await balance(item), 6);
  assert.equal((await state(id)).document.status, "POSTED");
});
test("Return uses original factor 6 after supplier changes to 10", async () => {
  const item = await freshItem();
  const data = { itemId: item, supplierPartnerId: supplierId, purchaseUomId: purchaseUnit, packSize: 6, minimumOrderQuantity: 1, leadTimeDays: 0, currency: "EUR", unitCost: 12 };
  await saveItemSupplier(companyId, locationId, data); const source = await receipt([line(item, 2)]);
  await saveItemSupplier(companyId, locationId, { ...data, packSize: 10, unitCost: 99 });
  const id = await returned(source, { [(await rows(source))[0].id]: 1 }); await postPurchaseReturn(companyId, userId, locationId, id);
  assert.equal(Number((await rows(id))[0].purchaseConversionFactor), 6); assert.equal(Number((await movements(id))[0].quantity), 6); assert.equal(await balance(item), 6);
});
test("Two partial returns subtract 6 each; over-return rejected by existing conversion limit", async () => {
  const item = await freshItem(), source = await receipt([line(item, 3)]), sourceLine = (await rows(source))[0];
  for (const expected of [12, 6]) { const id = await returned(source, { [sourceLine.id]: 1 }); await postPurchaseReturn(companyId, userId, locationId, id); assert.equal(await balance(item), expected); assert.equal((await movements(id)).length, 1); }
  const before = await state(source); await assert.rejects(createPurchaseReturn(companyId, userId, locationId, source, { [sourceLine.id]: 2 }), /Quantità superiore/); assert.deepEqual(await state(source), before);
});
test("Multiline BOX x6 and CASE x3 return their independent stock quantities", async () => {
  const a = await freshItem(), b = await freshItem(), source = await receipt([line(a, 1), line(b, 2, { unitOfMeasureId: caseUnit, purchaseConversionFactor: 3 })]);
  const id = await returned(source); await postPurchaseReturn(companyId, userId, locationId, id);
  const posted = await movements(id); assert.equal(posted.length, 2); for (const m of posted) { assert.equal(Number(m.quantity), 6); assert.equal(m.direction, -1); assert.equal(m.unitOfMeasureId, unitId); }
  assert.equal(await balance(a), 0); assert.equal(await balance(b), 0);
});
test("Second row stock failure rolls back first tracked return, document, stock and events", async () => {
  retryItem = await freshItem(); const source = await receipt([line(trackedItem, 1, { unitOfMeasureId: unitId, purchaseConversionFactor: 1, lotId, serialId }), line(retryItem, 2)]);
  retryReturn = await returned(source);
  await postInventoryMovement(companyId, userId, { locationId, warehouseId, itemId: retryItem, movementType: "ISSUE", quantity: 12, unitOfMeasureId: unitId });
  const before = await state(retryReturn); await assert.rejects(postPurchaseReturn(companyId, userId, locationId, retryReturn), /Giacenza insufficiente/);
  assert.deepEqual(await state(retryReturn), before); assert.equal((await movements(retryReturn)).length, 0); assert.equal((await prisma.inventorySerial.findUniqueOrThrow({ where: { id: serialId } })).status, "AVAILABLE");
});
test("Retry with restored fixture stock posts exactly once, preserving lot/serial semantics", async () => {
  await postInventoryMovement(companyId, userId, { locationId, warehouseId, itemId: retryItem, movementType: "ADJUSTMENT_IN", quantity: 12, unitOfMeasureId: unitId });
  await postPurchaseReturn(companyId, userId, locationId, retryReturn);
  const posted = await movements(retryReturn); assert.equal(posted.length, 2); const tracked = posted.find(m => m.itemId === trackedItem)!;
  assert.equal(tracked.lotId, lotId); assert.equal(tracked.serialId, serialId); assert.equal(tracked.direction, -1); assert.equal(Number(tracked.quantity), 1);
  assert.equal((await prisma.inventorySerial.findUniqueOrThrow({ where: { id: serialId } })).status, "ISSUED"); assert.equal(await balance(trackedItem), 0); assert.equal(await balance(retryItem), 0);
});
test("Double return rejected without second subtraction", async () => {
  const before = await state(retryReturn); await assert.rejects(postPurchaseReturn(companyId, userId, locationId, retryReturn), /Solo un reso confermato/); assert.deepEqual(await state(retryReturn), before);
});
test("Concurrent returns on same document have one effective posting", async () => {
  const item = await freshItem(), source = await receipt([line(item, 2)]), id = await returned(source, { [(await rows(source))[0].id]: 1 });
  const results = await Promise.allSettled([postPurchaseReturn(companyId, userId, locationId, id), postPurchaseReturn(companyId, userId, locationId, id)]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1); assert.equal((await movements(id)).length, 1); assert.equal(await balance(item), 6); assert.equal((await state(id)).document.status, "POSTED");
  assert.equal(await prisma.domainEvent.count({ where: { companyId, aggregateId: id, eventType: "PurchaseReturnPosted" } }), 1);
});
test("Legacy NULL snapshots reject without fallback or writes", async () => {
  const row = await createDraft(companyId, userId, { seriesId: returnSeries, partnerId: supplierId, documentDate: new Date(), locationId, warehouseId, lines: [line(itemA, 1, { stockUnitOfMeasureId: null, purchaseConversionFactor: null })] });
  await confirmDocument(companyId, userId, locationId, row.id); const before = await state(row.id);
  await assert.rejects(postPurchaseReturn(companyId, userId, locationId, row.id), /Snapshot conversione UOM mancante/); assert.deepEqual(await state(row.id), before);
});
test("Return posting preserves tenant and location isolation", async () => {
  const source = await receipt([line(itemB, 1)]), id = await returned(source), before = await state(id);
  await assert.rejects(postPurchaseReturn(otherCompanyId, userId, locationId, id)); await assert.rejects(postPurchaseReturn(companyId, userId, otherLocationId, id)); assert.deepEqual(await state(id), before);
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
    await prisma.warehouse.deleteMany({ where: { companyId } });
    await prisma.itemSupplier.deleteMany({ where: { companyId } });
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
