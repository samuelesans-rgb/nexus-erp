import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { confirmOpening, parseOpeningCsv, previewOpening, type OpeningRow } from "../../lib/inventory-procurement";
import { MODULE_CODES } from "../../lib/module-catalog";
import { prisma } from "../../lib/prisma";

const target = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
assert.equal(target.hostname, "127.0.0.1");
assert.equal(target.port, "51039");
assert.equal(target.pathname, "/nexus_procurement_test");
assert.equal(target.username, "nexus_procurement_test");
let companyId = "", foreignCompanyId = "", locationId = "", otherLocationId = "", userId = "", warehouseId = "", unitId = "";
const suffix = randomUUID();
before(async () => {
  const identity = await prisma.$queryRaw<Array<{ db: string; role: string }>>`SELECT current_database() AS db, current_user AS role`;
  assert.deepEqual(identity[0], { db: "nexus_procurement_test", role: "nexus_procurement_test" });
  companyId = (await prisma.company.create({ data: { name: `Opening ${suffix}` } })).id;
  foreignCompanyId = (await prisma.company.create({ data: { name: `Foreign opening ${suffix}` } })).id;
  userId = (await prisma.user.create({ data: { email: `${suffix}@opening.invalid`, firstName: "Opening", lastName: "Test", password: "UNUSABLE_TEST_PASSWORD" } })).id;
  await prisma.membership.create({ data: { companyId, userId } });
  const moduleDefinition = await prisma.moduleDefinition.upsert({ where: { code: MODULE_CODES.CORE_INVENTORY }, create: { code: MODULE_CODES.CORE_INVENTORY, name: "Inventory", category: "CORE", status: "AVAILABLE" }, update: {} });
  await prisma.companyModule.create({ data: { companyId, moduleDefinitionId: moduleDefinition.id, enabled: true } });
  locationId = (await prisma.location.create({ data: { companyId, code: "A", name: "A" } })).id;
  otherLocationId = (await prisma.location.create({ data: { companyId, code: "B", name: "B" } })).id;
  warehouseId = (await prisma.warehouse.create({ data: { companyId, locationId, code: "WH", name: "WH", createdById: userId } })).id;
  unitId = (await prisma.unitOfMeasure.create({ data: { companyId, code: "PCS", name: "Piece", symbol: "pcs", precision: 3 } })).id;
  await prisma.warehouseBin.create({ data: { companyId, warehouseId, code: "BIN", name: "BIN" } });
});
async function fixture(tracked = false) {
  const item = await prisma.item.create({ data: { companyId, code: randomUUID(), name: "Opening item", type: "PRODUCT", stockManaged: true, unitOfMeasureId: unitId, trackLots: tracked, trackSerials: tracked } });
  const row: OpeningRow = { itemCode: item.code, warehouseCode: "WH", binCode: "BIN", uomCode: "PCS", quantity: tracked ? 1 : 2, unitCost: 4, ...(tracked ? { lotCode: randomUUID(), serialCode: randomUUID() } : {}) };
  return { item, row };
}
const confirm = (rows: OpeningRow[], key = randomUUID(), location = locationId) => confirmOpening(companyId, location, userId, key, rows);
async function snapshot() {
  return Promise.all([
    prisma.inventoryMovement.findMany({ where: { companyId }, orderBy: { id: "asc" } }),
    prisma.stockBalance.findMany({ where: { companyId }, orderBy: { id: "asc" } }),
    prisma.inventoryLot.findMany({ where: { companyId }, orderBy: { id: "asc" } }),
    prisma.inventorySerial.findMany({ where: { companyId }, orderBy: { id: "asc" } }),
    prisma.auditLog.findMany({ where: { companyId }, orderBy: { id: "asc" } }),
    prisma.domainEvent.findMany({ where: { companyId }, orderBy: { id: "asc" } }),
  ]);
}
test("Valid CSV preview is read-only and preserves format", async () => {
  const f = await fixture(); const before = await snapshot();
  const rows = parseOpeningCsv(`itemCode,warehouseCode,binCode,quantity,uomCode,unitCost,lotCode,serialCode,expiryDate,note\n${f.item.code},WH,BIN,2,PCS,4,,,,note`);
  assert.equal((await previewOpening(companyId, locationId, rows)).valid, true);
  assert.deepEqual(await snapshot(), before);
});
test("Valid CSV confirm writes stock and audit", async () => {
  const f = await fixture(); const result = await confirm([f.row]); assert.equal(result.lineCount, 1);
  const balance = await prisma.stockBalance.findFirstOrThrow({ where: { companyId, itemId: f.item.id } }); assert.equal(Number(balance.quantity), 2);
  assert.equal(await prisma.auditLog.count({ where: { companyId, entityId: result.aggregateId, action: "INVENTORY_OPENING_POSTED" } }), 1);
});
test("Multiline confirm posts independent quantities", async () => {
  const a = await fixture(), b = await fixture(); b.row.quantity = 5;
  const result = await confirm([a.row, b.row]); assert.equal(result.lineCount, 2);
  for (const f of [a, b]) assert.equal(Number((await prisma.stockBalance.findFirstOrThrow({ where: { companyId, itemId: f.item.id } })).quantity), f.row.quantity);
});
for (const invalid of ["item", "inactive-item", "other-company-item", "other-location", "uom", "warehouse", "bin"]) {
  test(`Opening invalid reference fails closed: ${invalid}`, async () => {
    const f = await fixture(); let location = locationId;
    if (invalid === "item") f.row.itemCode = "MISSING";
    if (invalid === "inactive-item") await prisma.item.update({ where: { id: f.item.id }, data: { active: false } });
    if (invalid === "other-company-item") { const foreign = await prisma.item.create({ data: { companyId: foreignCompanyId, code: randomUUID(), name: "Foreign", type: "PRODUCT", stockManaged: true } }); f.row.itemCode = foreign.code; }
    if (invalid === "other-location") location = otherLocationId;
    if (invalid === "uom") f.row.uomCode = "MISSING";
    if (invalid === "warehouse") f.row.warehouseCode = "MISSING";
    if (invalid === "bin") f.row.binCode = "MISSING";
    const before = await snapshot(); assert.equal((await previewOpening(companyId, location, [f.row])).valid, false);
    await assert.rejects(confirm([f.row], randomUUID(), location)); assert.deepEqual(await snapshot(), before);
  });
}
test("Lot and serial tracking preserved by opening", async () => {
  const f = await fixture(true); const result = await confirm([f.row]);
  const movement = await prisma.inventoryMovement.findUniqueOrThrow({ where: { id: result.movementIds[0] } });
  assert.ok(movement.lotId); assert.ok(movement.serialId);
  assert.equal((await prisma.inventoryLot.findUniqueOrThrow({ where: { id: movement.lotId } })).lotNumber, f.row.lotCode);
  assert.equal((await prisma.inventorySerial.findUniqueOrThrow({ where: { id: movement.serialId } })).status, "AVAILABLE");
});
test("Second line precision failure rolls back first movement, stock, tracking, audit and events", async () => {
  const a = await fixture(true), b = await fixture(); b.row.quantity = 1.2345;
  assert.equal((await previewOpening(companyId, locationId, [a.row, b.row])).valid, true);
  const before = await snapshot(); const key = randomUUID();
  await assert.rejects(confirm([a.row, b.row], key), /decimali/); assert.deepEqual(await snapshot(), before);
  // The idempotency engine may record FAILED; business writes must all roll back.
  b.row.quantity = 3; assert.equal((await confirm([a.row, b.row], key)).lineCount, 2);
  assert.equal(await prisma.inventoryMovement.count({ where: { companyId, referenceId: key } }), 2);
});
test("Repeated opening key returns same result without duplicate writes", async () => {
  const f = await fixture(); const key = randomUUID(); const first = await confirm([f.row], key); const before = await snapshot();
  assert.deepEqual(await confirm([f.row], key), first); assert.deepEqual(await snapshot(), before);
});
test("Concurrent opening same key posts once using existing Serializable strategy", async () => {
  const f = await fixture(); const key = randomUUID(); const results = await Promise.allSettled([confirm([f.row], key), confirm([f.row], key)]);
  assert.ok(results.some(r => r.status === "fulfilled"));
  assert.equal(await prisma.inventoryMovement.count({ where: { companyId, referenceId: key } }), 1);
  assert.equal(Number((await prisma.stockBalance.findFirstOrThrow({ where: { companyId, itemId: f.item.id } })).quantity), 2);
  assert.equal(await prisma.auditLog.count({ where: { companyId, action: "INVENTORY_OPENING_POSTED", entityId: (await prisma.inventoryMovement.findFirstOrThrow({ where: { companyId, referenceId: key } })).id } }), 1);
});
test("Confirm reads decisions through transaction delegates, never global findMany", async () => {
  // Prisma delegates are proxies, so native method spies cannot instrument them.
  // Guard the actual helper/call boundary and execute that path against PostgreSQL.
  const source = readFileSync(new URL("../../lib/inventory-procurement.ts", import.meta.url), "utf8");
  const helper = source.slice(source.indexOf("async function previewOpeningTx("), source.indexOf("export async function previewOpening("));
  assert.ok(helper.length > 0); assert.doesNotMatch(helper, /\bprisma\./);
  for (const model of ["item", "warehouse", "unitOfMeasure"]) assert.ok(helper.includes(`tx.${model}.findMany`));
  const confirmSource = source.slice(source.indexOf("export async function confirmOpening("), source.indexOf("export async function getReorderProposals("));
  assert.match(confirmSource, /previewOpeningTx\(tx,companyId,locationId,rows\)/);
  assert.doesNotMatch(confirmSource, /\bpreviewOpening\(/);
  const f = await fixture(); assert.equal((await confirm([f.row])).lineCount, 1);
});

after(async () => {
  if (companyId) {
    await prisma.inventoryMovement.deleteMany({ where: { companyId } });
    await prisma.stockBalance.deleteMany({ where: { companyId } });
    await prisma.domainEvent.deleteMany({ where: { companyId } });
    await prisma.auditLog.deleteMany({ where: { companyId } });
    await prisma.inventoryLot.deleteMany({ where: { companyId } });
    await prisma.inventorySerial.deleteMany({ where: { companyId } });
    await prisma.warehouseBin.deleteMany({ where: { companyId } });
    await prisma.warehouse.deleteMany({ where: { companyId } });
    await prisma.item.deleteMany({ where: { companyId } });
    await prisma.unitOfMeasure.deleteMany({ where: { companyId } });
    await prisma.idempotencyRecord.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
  }
  if (foreignCompanyId) { await prisma.item.deleteMany({ where: { companyId: foreignCompanyId } }); await prisma.company.delete({ where: { id: foreignCompanyId } }); }
  if (userId) await prisma.user.delete({ where: { id: userId } });
  await prisma.$disconnect();
});
