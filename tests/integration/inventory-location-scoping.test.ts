import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import {
  InventoryDomainError,
  getInventoryLots,
  getInventoryMovements,
  getInventoryOptions,
  getStockBalance,
  getWarehouses,
  postInventoryMovement,
} from "../../lib/inventory";
import { prisma } from "../../lib/prisma";

const databaseUrl = process.env.DATABASE_URL ?? "";
if (!databaseUrl.includes("_test")) {
  throw new Error("I test Inventory Location richiedono un DATABASE_URL dedicato contenente _test.");
}

let companyId = "";
let otherCompanyId = "";
let userId = "";
let itemId = "";
let unitOfMeasureId = "";
let locationAId = "";
let locationBId = "";
let warehouseAId = "";
let warehouseBId = "";
let lotAId = "";
let lotBId = "";
let serialAId = "";
let serialBId = "";

const suffix = randomUUID().slice(0, 8).toUpperCase();
const createdMovementIds: string[] = [];

async function post(
  warehouseId: string,
  overrides: { locationId?: string; lotId?: string; serialId?: string; referenceId?: string } = {},
) {
  const movement = await postInventoryMovement(companyId, userId, {
    warehouseId,
    locationId: overrides.locationId,
    itemId,
    movementType: "ADJUSTMENT_IN",
    quantity: 1,
    unitOfMeasureId,
    lotId: overrides.lotId,
    serialId: overrides.serialId,
    referenceType: "InventoryLocationScopingTest",
    referenceId: overrides.referenceId ?? `LOC-${randomUUID()}`,
  });
  createdMovementIds.push(movement.id);
  return movement;
}

before(async () => {
  const company = await prisma.company.findUniqueOrThrow({
    where: { vatNumber: "IT00000000000" },
  });
  const user = await prisma.user.findFirstOrThrow({
    where: { memberships: { some: { companyId: company.id, active: true } } },
  });
  const item = await prisma.item.findFirstOrThrow({
    where: {
      companyId: company.id,
      type: "PRODUCT",
      stockManaged: true,
      active: true,
      deletedAt: null,
    },
    select: { id: true, unitOfMeasureId: true },
  });
  const locationA = await prisma.location.findFirstOrThrow({
    where: { companyId: company.id, active: true, deletedAt: null },
    orderBy: { code: "asc" },
  });
  const locationB = await prisma.location.create({
    data: { companyId: company.id, code: `INV-${suffix}`, name: `Inventory ${suffix}` },
  });
  const [warehouseA, warehouseB] = await Promise.all([
    prisma.warehouse.create({
      data: {
        companyId: company.id,
        locationId: locationA.id,
        code: `INV-A-${suffix}`,
        name: "Warehouse A",
        allowNegativeStock: true,
        createdById: user.id,
      },
    }),
    prisma.warehouse.create({
      data: {
        companyId: company.id,
        locationId: locationB.id,
        code: `INV-B-${suffix}`,
        name: "Warehouse B",
        allowNegativeStock: true,
        createdById: user.id,
      },
    }),
  ]);
  const [lotA, lotB, serialA, serialB] = await Promise.all([
    prisma.inventoryLot.create({
      data: { companyId: company.id, locationId: locationA.id, itemId: item.id, lotNumber: `LOT-A-${suffix}` },
    }),
    prisma.inventoryLot.create({
      data: { companyId: company.id, locationId: locationB.id, itemId: item.id, lotNumber: `LOT-B-${suffix}` },
    }),
    prisma.inventorySerial.create({
      data: { companyId: company.id, locationId: locationA.id, itemId: item.id, serialNumber: `SER-A-${suffix}` },
    }),
    prisma.inventorySerial.create({
      data: { companyId: company.id, locationId: locationB.id, itemId: item.id, serialNumber: `SER-B-${suffix}` },
    }),
  ]);
  const otherCompany = await prisma.company.create({ data: { name: `Inventory tenant ${suffix}` } });

  companyId = company.id;
  otherCompanyId = otherCompany.id;
  userId = user.id;
  itemId = item.id;
  unitOfMeasureId = item.unitOfMeasureId!;
  locationAId = locationA.id;
  locationBId = locationB.id;
  warehouseAId = warehouseA.id;
  warehouseBId = warehouseB.id;
  lotAId = lotA.id;
  lotBId = lotB.id;
  serialAId = serialA.id;
  serialBId = serialB.id;
});

after(async () => {
  if (companyId) {
    await prisma.domainEvent.deleteMany({ where: { companyId, aggregateId: { in: createdMovementIds } } });
    await prisma.inventoryMovement.deleteMany({
      where: { companyId, warehouseId: { in: [warehouseAId, warehouseBId] } },
    });
    await prisma.stockBalance.deleteMany({
      where: { companyId, warehouseId: { in: [warehouseAId, warehouseBId] } },
    });
    await prisma.inventorySerial.deleteMany({ where: { id: { in: [serialAId, serialBId] } } });
    await prisma.inventoryLot.deleteMany({ where: { id: { in: [lotAId, lotBId] } } });
    await prisma.warehouse.deleteMany({ where: { id: { in: [warehouseAId, warehouseBId] } } });
    await prisma.location.deleteMany({ where: { id: locationBId } });
  }
  if (otherCompanyId) await prisma.company.delete({ where: { id: otherCompanyId } });
  await prisma.$disconnect();
});

test("Warehouse, giacenze e movimenti sono isolati per Location", async () => {
  const movementA = await post(warehouseAId, {
    locationId: locationAId,
    referenceId: `MOVE-A-${suffix}`,
  });
  const movementB = await post(warehouseBId, {
    locationId: locationBId,
    referenceId: `MOVE-B-${suffix}`,
  });
  const [warehousesA, warehousesB, balancesA, balancesB, movementsA, movementsB] = await Promise.all([
    getWarehouses(companyId, locationAId),
    getWarehouses(companyId, locationBId),
    getStockBalance(companyId, locationAId),
    getStockBalance(companyId, locationBId),
    getInventoryMovements(companyId, locationAId),
    getInventoryMovements(companyId, locationBId),
  ]);

  assert.equal(warehousesA.some(({ id }) => id === warehouseAId), true);
  assert.equal(warehousesA.some(({ id }) => id === warehouseBId), false);
  assert.equal(warehousesB.some(({ id }) => id === warehouseBId), true);
  assert.equal(warehousesB.some(({ id }) => id === warehouseAId), false);
  assert.equal(balancesA.some((row) => row.warehouse.id === warehouseAId), true);
  assert.equal(balancesA.some((row) => row.warehouse.id === warehouseBId), false);
  assert.equal(balancesB.some((row) => row.warehouse.id === warehouseBId), true);
  assert.equal(movementsA.rows.some((row) => row.id === movementA.id), true);
  assert.equal(movementsA.rows.some((row) => row.id === movementB.id), false);
  assert.equal(movementsB.rows.some((row) => row.id === movementB.id), true);
});

test("Lotti e seriali sono isolati per Location", async () => {
  const [lotsA, lotsB, optionsA, optionsB] = await Promise.all([
    getInventoryLots(companyId, locationAId),
    getInventoryLots(companyId, locationBId),
    getInventoryOptions(companyId, locationAId),
    getInventoryOptions(companyId, locationBId),
  ]);
  assert.equal(lotsA.some((lot) => lot.id === lotAId), true);
  assert.equal(lotsA.some((lot) => lot.id === lotBId), false);
  assert.equal(lotsB.some((lot) => lot.id === lotBId), true);
  assert.equal(optionsA.serials.some((serial) => serial.id === serialAId), true);
  assert.equal(optionsA.serials.some((serial) => serial.id === serialBId), false);
  assert.equal(optionsB.serials.some((serial) => serial.id === serialBId), true);
});

test("Rifiuta Warehouse, Lotto e Serial di un'altra Location", async () => {
  await assert.rejects(
    post(warehouseAId, { locationId: locationBId }),
    InventoryDomainError,
  );
  await assert.rejects(post(warehouseAId, { lotId: lotBId }), InventoryDomainError);
  await assert.rejects(post(warehouseAId, { serialId: serialBId }), InventoryDomainError);
});

test("Rifiuta riferimenti Inventory cross-tenant", async () => {
  await assert.rejects(
    postInventoryMovement(otherCompanyId, userId, {
      warehouseId: warehouseAId,
      itemId,
      movementType: "ADJUSTMENT_IN",
      quantity: 1,
      unitOfMeasureId,
    }),
    InventoryDomainError,
  );
});

test("La compatibilità legacy deriva la Location dal Warehouse", async () => {
  const movement = await post(warehouseAId, { referenceId: `DERIVE-${suffix}` });
  const persisted = await prisma.inventoryMovement.findUniqueOrThrow({
    where: { id: movement.id },
    select: { locationId: true, warehouseId: true },
  });
  assert.equal(persisted.warehouseId, warehouseAId);
  assert.equal(persisted.locationId, locationAId);
});
