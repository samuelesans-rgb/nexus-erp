import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { assignTable, cancelReservation, confirmReservation, createReservation, RestaurantBookingError } from "../../lib/restaurant-booking";
import { getAvailableSlots } from "../../lib/restaurant-availability";
import { prisma } from "../../lib/prisma";

if (!(process.env.DATABASE_URL ?? "").includes("_test")) throw new Error("I test Booking richiedono DATABASE_URL _test.");

const suffix = randomUUID().slice(0, 8).toUpperCase();
let companyId = ""; let userId = ""; let locationA = ""; let locationB = ""; let tableA = ""; let tableB = ""; let areaA = ""; let areaB = "";
const reservationIds: string[] = [];
const start = (() => { const value = new Date(); value.setDate(value.getDate() + 2); value.setHours(12, 0, 0, 0); return value; })();

before(async () => {
  const company = await prisma.company.findUniqueOrThrow({ where: { vatNumber: "IT00000000000" } });
  const user = await prisma.user.findFirstOrThrow({ where: { memberships: { some: { companyId: company.id, active: true } } } });
  const first = await prisma.location.findFirstOrThrow({ where: { companyId: company.id, active: true, deletedAt: null } });
  const second = await prisma.location.create({ data: { companyId: company.id, code: `BOOK-${suffix}`, name: `Booking ${suffix}` } });
  const [firstArea, secondArea] = await Promise.all([
    prisma.restaurantArea.create({ data: { companyId: company.id, locationId: first.id, code: `BA-${suffix}`, name: "Booking A" } }),
    prisma.restaurantArea.create({ data: { companyId: company.id, locationId: second.id, code: `BB-${suffix}`, name: "Booking B" } }),
  ]);
  const [firstTable, secondTable] = await Promise.all([
    prisma.restaurantTable.create({ data: { companyId: company.id, locationId: first.id, areaId: firstArea.id, code: `BT-A-${suffix}`, name: "Booking A", seats: 4 } }),
    prisma.restaurantTable.create({ data: { companyId: company.id, locationId: second.id, areaId: secondArea.id, code: `BT-B-${suffix}`, name: "Booking B", seats: 4 } }),
  ]);
  await Promise.all([first.id, second.id].map((locationId) => prisma.restaurantBookingSettings.upsert({ where: { companyId_locationId: { companyId: company.id, locationId } }, update: { minAdvanceMinutes: 0, openingHours: {} }, create: { companyId: company.id, locationId, minAdvanceMinutes: 0, openingHours: {} } })));
  companyId = company.id; userId = user.id; locationA = first.id; locationB = second.id; areaA = firstArea.id; areaB = secondArea.id; tableA = firstTable.id; tableB = secondTable.id;
});

after(async () => { await prisma.restaurantReservationTable.deleteMany({ where: { companyId, reservationId: { in: reservationIds } } }); await prisma.restaurantReservation.deleteMany({ where: { id: { in: reservationIds } } }); await prisma.restaurantTable.deleteMany({ where: { id: { in: [tableA, tableB] } } }); await prisma.restaurantArea.deleteMany({ where: { id: { in: [areaA, areaB] } } }); await prisma.restaurantBookingSettings.deleteMany({ where: { companyId, locationId: locationB } }); await prisma.location.deleteMany({ where: { id: locationB } }); await prisma.$disconnect(); });

async function create(key = randomUUID(), overrides: Partial<{ locationId: string; partySize: number; tableId: string; startTime: Date }> = {}) { const reservationStart = overrides.startTime ?? new Date(start.getTime() + reservationIds.length * 86_400_000); const result = await createReservation(companyId, userId, key, { locationId: overrides.locationId ?? locationA, guestName: "Booking Test", partySize: overrides.partySize ?? 2, startTime: reservationStart, tableId: overrides.tableId, source: "WEBSITE" }); reservationIds.push(result.reservationId); return result; }

test("Booking: crea prenotazione e restituisce slot disponibili", async () => { const slots = await getAvailableSlots(companyId, locationA, { date: start, partySize: 2 }); assert.equal(slots.some((slot) => slot.getTime() === start.getTime()), true); const result = await create(); assert.ok(result.reservationId); const row = await prisma.restaurantReservation.findUniqueOrThrow({ where: { id: result.reservationId } }); assert.equal(row.locationId, locationA); assert.equal(row.durationMinutes, 120); });
test("Booking: rifiuta sovrapposizione e capienza insufficiente", async () => { const overlapStart = new Date(start.getTime() + 10 * 86_400_000); await create(randomUUID(), { tableId: tableA, startTime: overlapStart }); await assert.rejects(create(randomUUID(), { tableId: tableA, startTime: overlapStart }), RestaurantBookingError); await assert.rejects(create(randomUUID(), { partySize: 9, startTime: overlapStart }), RestaurantBookingError); });
test("Booking: isolamento Location e tavolo cross-location", async () => { const result = await create(randomUUID(), { locationId: locationB, tableId: tableB }); const row = await prisma.restaurantReservation.findUniqueOrThrow({ where: { id: result.reservationId } }); assert.equal(row.locationId, locationB); await assert.rejects(create(randomUUID(), { locationId: locationA, tableId: tableB }), RestaurantBookingError); });
test("Booking: cancellazione libera il tavolo e conferma è location-safe", async () => { const result = await create(randomUUID(), { locationId: locationB, tableId: tableB }); await confirmReservation(companyId, locationB, result.reservationId); await cancelReservation(companyId, locationB, result.reservationId); const next = await create(randomUUID(), { locationId: locationB, tableId: tableB }); assert.ok(next.reservationId); });
test("Booking: replay idempotente restituisce la stessa prenotazione", async () => { const key = randomUUID(); const first = await create(key, { locationId: locationB, tableId: tableB }); const second = await createReservation(companyId, userId, key, { locationId: locationB, guestName: "Booking Test", partySize: 2, startTime: start, tableId: tableB, source: "WEBSITE" }); assert.equal(first.reservationId, second.reservationId); });
test("Booking: assegnazione table cross-location rifiutata", async () => { const result = await create(randomUUID(), { locationId: locationB, tableId: tableB }); await assert.rejects(assignTable(companyId, locationB, result.reservationId, tableA), RestaurantBookingError); });
