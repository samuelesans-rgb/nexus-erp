import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { createDraft, confirmDocument } from "../../lib/documents";
import { MODULE_CODES } from "../../lib/module-catalog";
import { prisma } from "../../lib/prisma";
import { postGoodsReceipt } from "../../lib/purchasing";

const target = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (!target.pathname.endsWith("_test")) throw new Error("Goods receipt tests require an isolated _test database.");

let companyId = "", otherCompanyId = "", userId = "", locationId = "", otherLocationId = "";
let warehouseId = "", supplierId = "", unitId = "", vatId = "", seriesId = "";
let itemA = "", itemB = "", trackedItem = "", lotId = "", serialId = "", retryReceipt = "";
const documents: string[] = [];
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
});

function line(itemId: string, quantity: number, extra: Record<string, unknown> = {}) {
  return { itemId, quantity, unitOfMeasureId: unitId, stockUnitOfMeasureId: unitId, purchaseConversionFactor: 1, unitPrice: 1, vatRateId: vatId, warehouseId, ...extra };
}
async function receipt(lines: ReturnType<typeof line>[]) {
  const row = await createDraft(companyId, userId, { seriesId, partnerId: supplierId, documentDate: new Date(), locationId, warehouseId, lines });
  documents.push(row.id);
  await confirmDocument(companyId, userId, locationId, row.id);
  return row.id;
}
async function state(id: string) {
  return {
    document: await prisma.businessDocument.findUniqueOrThrow({ where: { id } }),
    movements: await prisma.inventoryMovement.findMany({ where: { companyId }, orderBy: { id: "asc" } }),
    balances: await prisma.stockBalance.findMany({ where: { companyId }, orderBy: { id: "asc" } }),
    lots: await prisma.inventoryLot.findMany({ where: { companyId }, orderBy: { id: "asc" } }),
    serials: await prisma.inventorySerial.findMany({ where: { companyId }, orderBy: { id: "asc" } }),
    events: await prisma.domainEvent.findMany({ where: { companyId }, orderBy: { id: "asc" } }),
    documentEvents: await prisma.documentEvent.findMany({ where: { companyId }, orderBy: { id: "asc" } }),
  };
}
async function receiptMovements(id: string) {
  const lines = await prisma.businessDocumentLine.findMany({ where: { companyId, documentId: id }, select: { id: true } });
  return prisma.inventoryMovement.findMany({ where: { companyId, referenceType: "BusinessDocumentLine", referenceId: { in: lines.map((row) => row.id) } } });
}

test("A: multiline receipt posts exactly one set of movements and events", async () => {
  const id = await receipt([line(itemA, 2), line(itemB, 3)]);
  await postGoodsReceipt(companyId, userId, locationId, id);
  assert.equal((await state(id)).document.status, "POSTED");
  assert.deepEqual((await receiptMovements(id)).map((row) => Number(row.quantity)).sort(), [2, 3]);
  const balances = await prisma.stockBalance.findMany({ where: { companyId } });
  assert.equal(Number(balances.find((row) => row.itemId === itemA)?.quantity), 2);
  assert.equal(Number(balances.find((row) => row.itemId === itemB)?.quantity), 3);
  assert.equal(await prisma.domainEvent.count({ where: { companyId, aggregateId: id, eventType: "GoodsReceiptPosted" } }), 1);
  assert.equal(await prisma.documentEvent.count({ where: { companyId, documentId: id, eventType: "DocumentPosted" } }), 1);
});

test("B: database failure on second movement rolls back first movement, stock, tracking and events", async () => {
  // Valid document inputs, but the converted stock quantity overflows the
  // InventoryMovement DECIMAL(15,3). This fails in the DB after row 1 writes,
  // rather than merely exercising read-only preflight rejection.
  retryReceipt = await receipt([
    line(trackedItem, 1, { lotId, serialId }),
    line(itemA, 1_000_000, { purchaseConversionFactor: 100_000_000 }),
  ]);
  const before = await state(retryReceipt);
  await assert.rejects(postGoodsReceipt(companyId, userId, locationId, retryReceipt), /numeric field overflow|out of range|value too long/i);
  assert.deepEqual(await state(retryReceipt), before);
  assert.equal((await receiptMovements(retryReceipt)).length, 0);
  assert.equal((await prisma.inventorySerial.findUniqueOrThrow({ where: { id: serialId } })).status, "ISSUED");
});

test("C: retry after correcting only fixture factor posts every row once, including lot and serial", async () => {
  await prisma.businessDocumentLine.updateMany({ where: { companyId, documentId: retryReceipt, itemId: itemA }, data: { purchaseConversionFactor: 1 } });
  await postGoodsReceipt(companyId, userId, locationId, retryReceipt);
  const movements = await receiptMovements(retryReceipt);
  assert.equal(movements.length, 2);
  assert.equal(Number(movements.find((row) => row.itemId === itemA)?.quantity), 1_000_000);
  const tracked = movements.find((row) => row.itemId === trackedItem)!;
  assert.equal(tracked.lotId, lotId); assert.equal(tracked.serialId, serialId);
  assert.equal((await prisma.inventorySerial.findUniqueOrThrow({ where: { id: serialId } })).status, "AVAILABLE");
  const posted = await state(retryReceipt);
  assert.equal(posted.document.status, "POSTED");
  assert.equal(Number(posted.balances.find((row) => row.itemId === itemA)?.quantity), 1_000_002);
  assert.equal(Number(posted.balances.find((row) => row.itemId === trackedItem)?.quantity), 1);
});

test("D: second receipt attempt leaves all posted state unchanged", async () => {
  const before = await state(retryReceipt);
  await assert.rejects(postGoodsReceipt(companyId, userId, locationId, retryReceipt), /Solo un ricevimento confermato/);
  assert.deepEqual(await state(retryReceipt), before);
});

test("E: concurrent multiline receipt has one effective posting", async () => {
  const id = await receipt([line(itemA, 5), line(itemB, 7)]);
  const before = await state(id);
  const results = await Promise.allSettled([postGoodsReceipt(companyId, userId, locationId, id), postGoodsReceipt(companyId, userId, locationId, id)]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const after = await state(id);
  assert.equal(after.document.status, "POSTED"); assert.equal((await receiptMovements(id)).length, 2);
  for (const [item, quantity] of [[itemA, 5], [itemB, 7]] as const) {
    assert.equal(Number(after.balances.find((row) => row.itemId === item)?.quantity) - Number(before.balances.find((row) => row.itemId === item)?.quantity), quantity);
  }
  assert.equal(await prisma.domainEvent.count({ where: { companyId, aggregateId: id, eventType: "GoodsReceiptPosted" } }), 1);
});

test("Preflight rejects missing legacy snapshots without writes", async () => {
  const id = await receipt([line(itemA, 1), line(itemB, 1, { stockUnitOfMeasureId: null, purchaseConversionFactor: null })]);
  const before = await state(id);
  await assert.rejects(postGoodsReceipt(companyId, userId, locationId, id), /Snapshot conversione UOM mancante/);
  assert.deepEqual(await state(id), before);
});

test("Tenant and location checks reject posting without writes", async () => {
  const id = await receipt([line(itemA, 1)]); const before = await state(id);
  await assert.rejects(postGoodsReceipt(companyId, userId, otherLocationId, id));
  await assert.rejects(postGoodsReceipt(otherCompanyId, userId, locationId, id));
  assert.deepEqual(await state(id), before);
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
