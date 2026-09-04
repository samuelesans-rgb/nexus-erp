import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after, before } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";
import { hasRestaurantCapability } from "../../lib/restaurant-access";
import {
  FloorConfigError,
  getFloorConfiguration,
  saveFloorArea,
  saveFloorLayout,
  saveFloorTable,
} from "../../lib/restaurant-floor-config";
import {
  getOperationalRestaurantFloor,
  openFloorTable,
} from "../../lib/restaurant-floor-operations";

const url = process.env.DATABASE_URL ?? "";
if (!url.includes("_test"))
  throw new Error("Floor editor tests require _test DB.");
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url }),
});
const suffix = randomUUID().slice(0, 8);
let companyId = "",
  otherCompanyId = "",
  locationId = "",
  otherLocationId = "",
  userId = "";
const actor = () => ({ companyId, locationId, userId });

before(async () => {
  const [company, other] = await Promise.all([
    prisma.company.create({ data: { name: `Floor ${suffix}` } }),
    prisma.company.create({ data: { name: `Other ${suffix}` } }),
  ]);
  companyId = company.id;
  otherCompanyId = other.id;
  const [location, otherLocation] = await Promise.all([
    prisma.location.create({
      data: { companyId, code: `FL-${suffix}`, name: "Floor" },
    }),
    prisma.location.create({
      data: { companyId: otherCompanyId, code: `OT-${suffix}`, name: "Other" },
    }),
  ]);
  locationId = location.id;
  otherLocationId = otherLocation.id;
  const user = await prisma.user.create({
    data: {
      firstName: "Floor",
      lastName: "Admin",
      email: `floor-${suffix}@test.invalid`,
      password: "unused",
    },
  });
  userId = user.id;
});
after(async () => {
  await prisma.auditLog.deleteMany({
    where: { companyId: { in: [companyId, otherCompanyId] } },
  });
  await prisma.restaurantTable.deleteMany({ where: { companyId } });
  await prisma.restaurantArea.deleteMany({ where: { companyId } });
  await prisma.location.deleteMany({
    where: { id: { in: [locationId, otherLocationId] } },
  });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.company.deleteMany({
    where: { id: { in: [companyId, otherCompanyId] } },
  });
  await prisma.$disconnect();
});

test("multi-sala crea, modifica, ordina e disattiva con audit", async () => {
  const first = await saveFloorArea(actor(), {
    code: "S1",
    name: "Sala uno",
    active: true,
    sortOrder: 20,
    layoutWidth: 1200,
    layoutHeight: 800,
    backgroundOpacity: 0.15,
  });
  const second = await saveFloorArea(actor(), {
    code: "S2",
    name: "Sala due",
    active: true,
    sortOrder: 10,
    layoutWidth: 1000,
    layoutHeight: 600,
    backgroundOpacity: 0.2,
  });
  await saveFloorArea(actor(), {
    id: first.id,
    code: "S1",
    name: "Sala principale",
    active: false,
    sortOrder: 0,
    layoutWidth: 1400,
    layoutHeight: 900,
    backgroundOpacity: 0.1,
  });
  const rooms = await getFloorConfiguration(actor());
  assert.deepEqual(
    rooms.map(({ id }) => id),
    [first.id, second.id],
  );
  assert.equal(rooms[0].name, "Sala principale");
  assert.equal(rooms[0].active, false);
  assert.equal(
    await prisma.auditLog.count({
      where: { companyId, action: { in: ["AREA_CREATED", "AREA_DISABLED"] } },
    }),
    3,
  );
});

test("tavoli validano geometria, shape, capacità, mapping e isolamento", async () => {
  const area = await prisma.restaurantArea.findFirstOrThrow({
    where: { companyId, code: "S2" },
  });
  const table = await saveFloorTable(actor(), {
    areaId: area.id,
    code: "T1",
    name: "Tavolo 1",
    seats: 4,
    shape: "RECTANGLE",
    positionX: 100,
    positionY: 120,
    width: 140,
    height: 80,
    rotation: 90,
    sortOrder: 1,
    active: true,
    visibleInFloor: true,
    fusionTableNumber: 12,
  });
  await assert.rejects(
    saveFloorTable(actor(), {
      areaId: area.id,
      code: "T2",
      name: "Tavolo 2",
      seats: 0,
      shape: "ROUND",
      positionX: -1,
      positionY: 0,
      width: 80,
      height: 90,
      rotation: 13,
      sortOrder: 2,
      active: true,
      visibleInFloor: true,
      fusionTableNumber: 12,
    }),
    FloorConfigError,
  );
  await assert.rejects(
    saveFloorTable(actor(), {
      areaId: area.id,
      code: "T2",
      name: "Tavolo 2",
      seats: 2,
      shape: "RECTANGLE",
      positionX: 20,
      positionY: 20,
      width: 120,
      height: 80,
      rotation: 0,
      sortOrder: 2,
      active: true,
      visibleInFloor: true,
      fusionTableNumber: 12,
    }),
  );
  await assert.rejects(
    saveFloorTable(
      { companyId, locationId: otherLocationId, userId },
      {
        id: table.id,
        areaId: area.id,
        code: "T1",
        name: "X",
        seats: 4,
        shape: "RECTANGLE",
        positionX: 0,
        positionY: 0,
        width: 120,
        height: 80,
        rotation: 0,
        sortOrder: 0,
        active: true,
        visibleInFloor: true,
        fusionTableNumber: 12,
      },
    ),
    FloorConfigError,
  );
});

test("layout batch persiste più tavoli e rifiuta conflitto ottimistico", async () => {
  const area = await prisma.restaurantArea.findFirstOrThrow({
    where: { companyId, code: "S2" },
  });
  const second = await saveFloorTable(actor(), {
    areaId: area.id,
    code: "T3",
    name: "Tavolo 3",
    seats: 2,
    shape: "ROUND",
    positionX: 300,
    positionY: 200,
    width: 80,
    height: 80,
    rotation: 0,
    sortOrder: 3,
    active: true,
    visibleInFloor: false,
    fusionTableNumber: 13,
  });
  const current = await prisma.restaurantArea.findUniqueOrThrow({
    where: { id: area.id },
    include: { tables: true },
  });
  const layouts = current.tables.map((table, index) => ({
    id: table.id,
    positionX: 50 + index * 180,
    positionY: 60,
    width: Number(table.width),
    height: Number(table.height),
    rotation: Number(table.rotation),
  }));
  await saveFloorLayout(actor(), area.id, current.updatedAt, layouts);
  assert.equal(
    Number(
      (
        await prisma.restaurantTable.findUniqueOrThrow({
          where: { id: second.id },
        })
      ).positionY,
    ),
    60,
  );
  await assert.rejects(
    saveFloorLayout(actor(), area.id, current.updatedAt, layouts),
    /modificata da un altro utente/,
  );
  assert.equal(
    await prisma.auditLog.count({
      where: { companyId, action: "FLOOR_LAYOUT_UPDATED", entityId: area.id },
    }),
    1,
  );
});

test("Sala vede solo sale e tavoli attivi/visibili e non può aprire nascosti", async () => {
  const floor = await getOperationalRestaurantFloor(companyId, locationId);
  assert.equal(floor.areas.length, 1);
  assert.equal(floor.areas[0].name, "Sala due");
  assert.deepEqual(
    floor.areas[0].tables.map(({ code }) => code),
    ["T1"],
  );
  const hidden = await prisma.restaurantTable.findFirstOrThrow({
    where: { companyId, code: "T3" },
  });
  await assert.rejects(
    openFloorTable(actor(), hidden.id, 2),
    /non disponibile/,
  );
  assert.equal(hasRestaurantCapability(["ADMIN"], "manage"), true);
  assert.equal(hasRestaurantCapability(["SALA"], "manage"), false);
  assert.equal(hasRestaurantCapability(["SALA"], "floor"), true);
});
