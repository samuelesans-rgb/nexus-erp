import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { prisma } from "../../lib/prisma";
import {
  deriveTableStatus,
  deriveTableStatusFromRow,
  RESERVED_LEAD_MINUTES,
  tableHasOpenOrderWhere,
  tableIsFreeNowWhere,
  tableStatusInclude,
} from "../../lib/restaurant-table-status";

const databaseName = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid").pathname.slice(1);
if (!databaseName.endsWith("_test")) throw new Error("Table status tests require a database ending in _test.");
const suffix = randomUUID().slice(0, 8);
let companyId = "", locationId = "", userId = "", areaId = "";
const table = (code: string) => prisma.restaurantTable.findFirstOrThrow({ where: { companyId, code }, include: tableStatusInclude });

before(async () => {
  companyId = (await prisma.company.create({ data: { name: `TableStatus ${suffix}`, vatNumber: `TS${suffix}` } })).id;
  locationId = (await prisma.location.create({ data: { companyId, code: `TS-${suffix}`, slug: `ts-${suffix}`, name: "Sede" } })).id;
  userId = (await prisma.user.create({ data: { email: `ts-${suffix}@example.test`, firstName: "TS", lastName: "Test", password: "unused" } })).id;
  await prisma.membership.create({ data: { companyId, userId, active: true, isDefault: true } });
  areaId = (await prisma.restaurantArea.create({ data: { companyId, locationId, code: "SALA", name: "Sala" } })).id;
});

after(async () => {
  await prisma.restaurantOrderTable.deleteMany({ where: { companyId } });
  await prisma.restaurantOrder.deleteMany({ where: { companyId } });
  await prisma.restaurantReservationTable.deleteMany({ where: { companyId } });
  await prisma.restaurantReservation.deleteMany({ where: { companyId } });
  await prisma.domainEvent.deleteMany({ where: { companyId } });
  await prisma.auditLog.deleteMany({ where: { companyId } });
  await prisma.restaurantTable.deleteMany({ where: { companyId } });
  await prisma.restaurantArea.deleteMany({ where: { companyId } });
  await prisma.membership.deleteMany({ where: { companyId } });
  await prisma.location.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
  await prisma.user.delete({ where: { id: userId } });
  await prisma.$disconnect();
});

test("matrice di precedenza: fisico batte derivato, ordine batte DIRTY, DIRTY batte RESERVED", () => {
  const cases: Array<[Parameters<typeof deriveTableStatus>[0], string]> = [
    [{ physicalStatus: "OUT_OF_SERVICE", hasOpenOrder: true, hasImminentReservation: true }, "OUT_OF_SERVICE"],
    [{ physicalStatus: "DIRTY", hasOpenOrder: true, hasImminentReservation: true }, "OCCUPIED"],
    [{ physicalStatus: "READY", hasOpenOrder: true, hasImminentReservation: true }, "OCCUPIED"],
    [{ physicalStatus: "DIRTY", hasOpenOrder: false, hasImminentReservation: true }, "DIRTY"],
    [{ physicalStatus: "DIRTY", hasOpenOrder: false, hasImminentReservation: false }, "DIRTY"],
    [{ physicalStatus: "READY", hasOpenOrder: false, hasImminentReservation: true }, "RESERVED"],
    [{ physicalStatus: "READY", hasOpenOrder: false, hasImminentReservation: false }, "AVAILABLE"],
  ];
  for (const [input, expected] of cases)
    assert.equal(deriveTableStatus(input), expected, JSON.stringify(input));
});

test("derivazione da riga reale su tutti gli stati", async () => {
  const codes = ["FREE", "BUSY", "DIRTY", "OOS", "RESV", "LATER"] as const;
  for (const code of codes)
    await prisma.restaurantTable.create({ data: { companyId, locationId, areaId, code: `${code}-${suffix}`, name: code, seats: 4 } });
  await prisma.restaurantTable.updateMany({ where: { companyId, code: `DIRTY-${suffix}` }, data: { physicalStatus: "DIRTY" } });
  await prisma.restaurantTable.updateMany({ where: { companyId, code: `OOS-${suffix}` }, data: { physicalStatus: "OUT_OF_SERVICE" } });

  const busy = await prisma.restaurantTable.findFirstOrThrow({ where: { companyId, code: `BUSY-${suffix}` } });
  const order = await prisma.restaurantOrder.create({ data: { companyId, locationId, code: `ORD-${suffix}`, guestCount: 2, createdById: userId, updatedById: userId }, select: { id: true } });
  await prisma.restaurantOrderTable.create({ data: { companyId, locationId, orderId: order.id, tableId: busy.id } });

  const soon = new Date(Date.now() + 20 * 60000);
  const later = new Date(Date.now() + 6 * 3600000);
  for (const [code, start] of [[`RESV-${suffix}`, soon], [`LATER-${suffix}`, later]] as const) {
    const row = await prisma.restaurantTable.findFirstOrThrow({ where: { companyId, code } });
    await prisma.restaurantReservation.create({ data: { companyId, locationId, code: `R-${code}`, guestName: "Ospite", partySize: 2, reservationDate: start, startTime: start, endTime: new Date(start.getTime() + 3600000), status: "CONFIRMED", tables: { create: [{ tableId: row.id }] } } });
  }

  assert.equal(deriveTableStatusFromRow(await table(`FREE-${suffix}`)), "AVAILABLE");
  assert.equal(deriveTableStatusFromRow(await table(`BUSY-${suffix}`)), "OCCUPIED");
  assert.equal(deriveTableStatusFromRow(await table(`DIRTY-${suffix}`)), "DIRTY");
  assert.equal(deriveTableStatusFromRow(await table(`OOS-${suffix}`)), "OUT_OF_SERVICE");
  assert.equal(deriveTableStatusFromRow(await table(`RESV-${suffix}`)), "RESERVED", `prenotazione entro ${RESERVED_LEAD_MINUTES} minuti`);
  assert.equal(deriveTableStatusFromRow(await table(`LATER-${suffix}`)), "AVAILABLE", "una prenotazione lontana non colora il tavolo");
});

test("i predicati SQL concordano con la derivazione in memoria", async () => {
  const rows = await prisma.restaurantTable.findMany({ where: { companyId, deletedAt: null }, include: tableStatusInclude });
  const occupiedSql = new Set((await prisma.restaurantTable.findMany({ where: { companyId, deletedAt: null, ...tableHasOpenOrderWhere() }, select: { id: true } })).map((r) => r.id));
  const freeSql = new Set((await prisma.restaurantTable.findMany({ where: { companyId, deletedAt: null, ...tableIsFreeNowWhere() }, select: { id: true } })).map((r) => r.id));
  assert.ok(rows.length >= 6);
  for (const row of rows) {
    const derived = deriveTableStatusFromRow(row);
    assert.equal(occupiedSql.has(row.id), derived === "OCCUPIED", `open-order SQL vs derivazione per ${row.code}`);
    // tableIsFreeNowWhere = fisicamente pronto e senza comanda: non è mai DIRTY,
    // OUT_OF_SERVICE o OCCUPIED, mentre RESERVED resta prenotabile per un walk-in.
    if (freeSql.has(row.id))
      assert.ok(["AVAILABLE", "RESERVED"].includes(derived), `${row.code} risulta libero in SQL ma deriva ${derived}`);
    else
      assert.ok(["OCCUPIED", "DIRTY", "OUT_OF_SERVICE"].includes(derived), `${row.code} non è libero in SQL ma deriva ${derived}`);
  }
});
