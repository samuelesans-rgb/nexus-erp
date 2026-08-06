import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { prisma } from "../../lib/prisma";
import { PublicBookingError, PublicBookingRateLimiter, getPublicLocation, submitPublicBooking } from "../../lib/public-booking";

if (!(process.env.DATABASE_URL ?? "").includes("_test")) throw new Error("I test Public Booking richiedono DATABASE_URL _test.");

const suffix = randomUUID().slice(0, 8).toUpperCase();
const slug = `public-${suffix.toLowerCase()}`;
const reservationIds: string[] = [];
const idempotencyKeys: string[] = [];
let companyId = "";
let locationId = "";
let areaId = "";
let tableId = "";

function future(days: number, hour = 12) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  value.setHours(hour, 0, 0, 0);
  return value;
}

function input(startTime: Date, overrides: Partial<{ idempotencyKey: string; partySize: number; privacyConsent: boolean }> = {}) {
  const idempotencyKey = overrides.idempotencyKey ?? randomUUID();
  if (!idempotencyKeys.includes(idempotencyKey)) idempotencyKeys.push(idempotencyKey);
  return { idempotencyKey, startTime, partySize: overrides.partySize ?? 2, guestName: "Cliente Pubblico", phone: "+390123456789", email: `public-${suffix}@example.test`, notes: "Tavolo tranquillo", privacyConsent: overrides.privacyConsent ?? true };
}

async function submit(startTime: Date, overrides: Parameters<typeof input>[1] = {}, rateKey = randomUUID(), limiter?: PublicBookingRateLimiter) {
  const result = await submitPublicBooking(slug, rateKey, input(startTime, overrides), limiter);
  if (!reservationIds.includes(result.reservationId)) reservationIds.push(result.reservationId);
  return result;
}

before(async () => {
  const company = await prisma.company.findUniqueOrThrow({ where: { vatNumber: "IT00000000000" } });
  const location = await prisma.location.create({ data: { companyId: company.id, slug, code: `PUB-${suffix}`, name: `Public Booking ${suffix}` } });
  const area = await prisma.restaurantArea.create({ data: { companyId: company.id, locationId: location.id, code: slug, name: "Public Booking" } });
  const table = await prisma.restaurantTable.create({ data: { companyId: company.id, locationId: location.id, areaId: area.id, code: `T-${suffix}`, name: "Tavolo pubblico", seats: 4 } });
  await prisma.restaurantBookingSettings.create({ data: { companyId: company.id, locationId: location.id, minAdvanceMinutes: 0, maxAdvanceDays: 365, openingHours: {}, confirmationMessage: "Richiesta ricevuta." } });
  companyId = company.id;
  locationId = location.id;
  areaId = area.id;
  tableId = table.id;
});

after(async () => {
  await prisma.domainEvent.deleteMany({ where: { companyId, aggregateType: "RestaurantReservation", aggregateId: { in: reservationIds } } });
  await prisma.restaurantReservationTable.deleteMany({ where: { companyId, reservationId: { in: reservationIds } } });
  await prisma.restaurantReservation.deleteMany({ where: { id: { in: reservationIds } } });
  await prisma.idempotencyRecord.deleteMany({ where: { companyId, commandType: "RestaurantBookingCreate", idempotencyKey: { in: idempotencyKeys } } });
  await prisma.restaurantBookingSettings.deleteMany({ where: { companyId, locationId } });
  await prisma.restaurantTable.deleteMany({ where: { id: tableId } });
  await prisma.restaurantArea.deleteMany({ where: { id: areaId } });
  await prisma.location.deleteMany({ where: { id: locationId } });
  await prisma.$disconnect();
});

test("Public Booking: location inesistente restituisce null", async () => {
  assert.equal(await getPublicLocation(`missing-${suffix}`), null);
});

test("Public Booking: prenotazione completata tramite Booking Engine", async () => {
  const result = await submit(future(30));
  const row = await prisma.restaurantReservation.findUniqueOrThrow({ where: { id: result.reservationId } });
  assert.equal(row.companyId, companyId);
  assert.equal(row.locationId, locationId);
  assert.equal(row.source, "WEBSITE");
  assert.equal(result.confirmationMessage, "Richiesta ricevuta.");
});

test("Public Booking: slot già occupato rifiutato", async () => {
  const start = future(31);
  await submit(start);
  await assert.rejects(submit(start), /Nessun tavolo disponibile/);
});

test("Public Booking: consenso privacy obbligatorio", async () => {
  await assert.rejects(submitPublicBooking(slug, randomUUID(), input(future(32), { privacyConsent: false })), PublicBookingError);
});

test("Public Booking: capienza insufficiente rifiutata", async () => {
  await assert.rejects(submit(future(33), { partySize: 5 }), /Nessun tavolo disponibile/);
});

test("Public Booking: rate limit minimo applicato", async () => {
  const limiter = new PublicBookingRateLimiter(2, 60_000);
  const key = randomUUID();
  const idempotencyKey = randomUUID();
  const start = future(34);
  const first = await submit(start, { idempotencyKey }, key, limiter);
  const second = await submit(start, { idempotencyKey }, key, limiter);
  assert.equal(second.reservationId, first.reservationId);
  await assert.rejects(submit(start, { idempotencyKey }, key, limiter), /Troppe richieste/);
});

test("Public Booking: doppio submit idempotente", async () => {
  const key = randomUUID();
  const start = future(35);
  const first = await submit(start, { idempotencyKey: key });
  const second = await submit(start, { idempotencyKey: key });
  assert.equal(second.reservationId, first.reservationId);
  assert.equal(await prisma.restaurantReservation.count({ where: { id: first.reservationId } }), 1);
});
