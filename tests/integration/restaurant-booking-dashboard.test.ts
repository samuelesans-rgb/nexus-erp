import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import type { RestaurantReservationStatus } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import {
  RestaurantBookingError,
  assignTable,
  cancelReservation,
  confirmReservation,
  createReservation,
  getStaffReservation,
  getStaffReservations,
  transitionReservation,
  unassignTable,
  updateReservation,
} from "../../lib/restaurant-booking";

if (!(process.env.DATABASE_URL ?? "").includes("_test")) throw new Error("I test Dashboard Booking richiedono DATABASE_URL _test.");

const suffix = randomUUID().slice(0, 8).toUpperCase();
const reservationIds: string[] = [];
const idempotencyKeys: string[] = [];
let companyId = "";
let userId = "";
let locationA = "";
let locationB = "";
let areaA = "";
let areaB = "";
let tableA = "";
let tableA2 = "";
let smallTable = "";
let tableB = "";

function future(days: number, hour = 12) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  value.setHours(hour, 0, 0, 0);
  return value;
}

before(async () => {
  const company = await prisma.company.findUniqueOrThrow({ where: { vatNumber: "IT00000000000" } });
  const membership = await prisma.membership.findFirstOrThrow({ where: { companyId: company.id, active: true }, select: { userId: true } });
  const [firstLocation, secondLocation] = await Promise.all([
    prisma.location.create({ data: { companyId: company.id, code: `BDA-${suffix}`, name: `Booking Dashboard A ${suffix}` } }),
    prisma.location.create({ data: { companyId: company.id, code: `BDB-${suffix}`, name: `Booking Dashboard B ${suffix}` } }),
  ]);
  const [firstArea, secondArea] = await Promise.all([
    prisma.restaurantArea.create({ data: { companyId: company.id, locationId: firstLocation.id, code: `BDA-${suffix}`, name: "Dashboard A" } }),
    prisma.restaurantArea.create({ data: { companyId: company.id, locationId: secondLocation.id, code: `BDB-${suffix}`, name: "Dashboard B" } }),
  ]);
  const [firstTable, secondFirstTable, firstSmallTable, secondTable] = await Promise.all([
    prisma.restaurantTable.create({ data: { companyId: company.id, locationId: firstLocation.id, areaId: firstArea.id, code: `BDA1-${suffix}`, name: "Dashboard A1", seats: 6 } }),
    prisma.restaurantTable.create({ data: { companyId: company.id, locationId: firstLocation.id, areaId: firstArea.id, code: `BDA2-${suffix}`, name: "Dashboard A2", seats: 6 } }),
    prisma.restaurantTable.create({ data: { companyId: company.id, locationId: firstLocation.id, areaId: firstArea.id, code: `BDAS-${suffix}`, name: "Dashboard Small", seats: 2 } }),
    prisma.restaurantTable.create({ data: { companyId: company.id, locationId: secondLocation.id, areaId: secondArea.id, code: `BDB1-${suffix}`, name: "Dashboard B1", seats: 6 } }),
  ]);
  await prisma.restaurantBookingSettings.createMany({ data: [firstLocation.id, secondLocation.id].map((locationId) => ({ companyId: company.id, locationId, minAdvanceMinutes: 0, maxAdvanceDays: 365, openingHours: {} })) });
  companyId = company.id;
  userId = membership.userId;
  locationA = firstLocation.id;
  locationB = secondLocation.id;
  areaA = firstArea.id;
  areaB = secondArea.id;
  tableA = firstTable.id;
  tableA2 = secondFirstTable.id;
  smallTable = firstSmallTable.id;
  tableB = secondTable.id;
});

after(async () => {
  await prisma.domainEvent.deleteMany({ where: { companyId, aggregateType: "RestaurantReservation", aggregateId: { in: reservationIds } } });
  await prisma.restaurantReservationTable.deleteMany({ where: { companyId, reservationId: { in: reservationIds } } });
  await prisma.restaurantReservation.deleteMany({ where: { id: { in: reservationIds } } });
  await prisma.idempotencyRecord.deleteMany({ where: { companyId, commandType: "RestaurantBookingCreate", idempotencyKey: { in: idempotencyKeys } } });
  await prisma.restaurantBookingSettings.deleteMany({ where: { companyId, locationId: { in: [locationA, locationB] } } });
  await prisma.restaurantTable.deleteMany({ where: { id: { in: [tableA, tableA2, smallTable, tableB] } } });
  await prisma.restaurantArea.deleteMany({ where: { id: { in: [areaA, areaB] } } });
  await prisma.location.deleteMany({ where: { id: { in: [locationA, locationB] } } });
  await prisma.$disconnect();
});

async function create(locationId: string, tableId: string, startTime: Date, partySize = 2) {
  const key = randomUUID();
  idempotencyKeys.push(key);
  const result = await createReservation(companyId, userId, key, { locationId, tableId, startTime, partySize, guestName: `Guest ${suffix}`, phone: "+390000000", email: `booking-${suffix}@example.test`, source: "MANUAL" });
  reservationIds.push(result.reservationId);
  return result;
}

test("Dashboard Booking: lista filtrata per sede corrente, data, ricerca e stato", async () => {
  const start = future(10);
  const own = await create(locationA, tableA, start);
  await create(locationB, tableB, start);
  await confirmReservation(companyId, locationA, own.reservationId);
  const rows = await getStaffReservations(companyId, locationA, { date: start, query: suffix, status: "CONFIRMED" });
  assert.deepEqual(rows.map((row) => row.id), [own.reservationId]);
});

test("Dashboard Booking: accesso e mutazioni cross-location rifiutati", async () => {
  const reservation = await create(locationB, tableB, future(11));
  assert.equal(await getStaffReservation(companyId, locationA, reservation.reservationId), null);
  await assert.rejects(confirmReservation(companyId, locationA, reservation.reservationId), RestaurantBookingError);
  await assert.rejects(assignTable(companyId, locationA, reservation.reservationId, tableA), RestaurantBookingError);
});

test("Dashboard Booking: assegna, cambia e rimuove il tavolo", async () => {
  const reservation = await create(locationA, tableA, future(12));
  await unassignTable(companyId, locationA, reservation.reservationId, userId);
  assert.equal((await prisma.restaurantReservationTable.count({ where: { reservationId: reservation.reservationId } })), 0);
  await assignTable(companyId, locationA, reservation.reservationId, tableA2, userId);
  const assigned = await prisma.restaurantReservationTable.findFirstOrThrow({ where: { reservationId: reservation.reservationId } });
  assert.equal(assigned.tableId, tableA2);
});

test("Dashboard Booking: sovrapposizione rifiutata", async () => {
  const start = future(13);
  await create(locationA, tableA, start);
  const second = await create(locationA, tableA2, start);
  await assert.rejects(assignTable(companyId, locationA, second.reservationId, tableA), RestaurantBookingError);
});

test("Dashboard Booking: capienza insufficiente rifiutata", async () => {
  const reservation = await create(locationA, tableA, future(14), 4);
  await assert.rejects(assignTable(companyId, locationA, reservation.reservationId, smallTable), RestaurantBookingError);
});

test("Dashboard Booking: transizioni valide fino al completamento", async () => {
  const reservation = await create(locationA, tableA, future(15));
  for (const status of ["CONFIRMED", "SEATED", "COMPLETED"] satisfies RestaurantReservationStatus[]) {
    await transitionReservation(companyId, locationA, reservation.reservationId, status, userId);
  }
  const row = await prisma.restaurantReservation.findUniqueOrThrow({ where: { id: reservation.reservationId } });
  assert.equal(row.status, "COMPLETED");
});

test("Dashboard Booking: transizioni arbitrarie rifiutate", async () => {
  const reservation = await create(locationA, tableA, future(16));
  await assert.rejects(transitionReservation(companyId, locationA, reservation.reservationId, "COMPLETED", userId), RestaurantBookingError);
});

test("Dashboard Booking: aggiornamento dati e disponibilità", async () => {
  const reservation = await create(locationA, tableA, future(17));
  const changedStart = future(17, 15);
  await updateReservation(companyId, locationA, reservation.reservationId, { guestName: "Cliente aggiornato", phone: "123", email: "UPPER@EXAMPLE.TEST", partySize: 3, startTime: changedStart, durationMinutes: 90, notes: "Nota cliente", internalNotes: "Nota staff" }, userId);
  const row = await prisma.restaurantReservation.findUniqueOrThrow({ where: { id: reservation.reservationId } });
  assert.equal(row.guestName, "Cliente aggiornato");
  assert.equal(row.email, "upper@example.test");
  assert.equal(row.partySize, 3);
  assert.equal(row.startTime.getTime(), changedStart.getTime());
  assert.equal(row.durationMinutes, 90);
  assert.equal(row.internalNotes, "Nota staff");
});

test("Dashboard Booking: cancellazione valida", async () => {
  const reservation = await create(locationA, tableA, future(18));
  await cancelReservation(companyId, locationA, reservation.reservationId);
  const row = await prisma.restaurantReservation.findUniqueOrThrow({ where: { id: reservation.reservationId } });
  assert.equal(row.status, "CANCELLED");
  assert.ok(row.cancelledAt);
});

test("Dashboard Booking: no-show consentito solo dopo conferma", async () => {
  const reservation = await create(locationA, tableA, future(19));
  await transitionReservation(companyId, locationA, reservation.reservationId, "CONFIRMED", userId);
  await transitionReservation(companyId, locationA, reservation.reservationId, "NO_SHOW", userId);
  assert.equal((await prisma.restaurantReservation.findUniqueOrThrow({ where: { id: reservation.reservationId } })).status, "NO_SHOW");
});
