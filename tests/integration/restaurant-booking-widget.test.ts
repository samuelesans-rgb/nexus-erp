import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { OPTIONS as reservationOptions } from "../../app/api/widget/v1/[publicKey]/reservation/route";
import { prisma } from "../../lib/prisma";
import { BookingWidgetError, BookingWidgetRateLimiter, generateWidgetPublicKey, getWidgetAvailability, getWidgetPublicConfig, submitWidgetReservation } from "../../lib/restaurant-booking-widget";

if (!(process.env.DATABASE_URL ?? "").includes("_test")) throw new Error("I test Booking Widget richiedono DATABASE_URL _test.");

const suffix = randomUUID().slice(0, 8).toUpperCase();
const publicKey = generateWidgetPublicKey();
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

function reservationInput(startTime: Date, idempotencyKey = randomUUID()) {
  if (!idempotencyKeys.includes(idempotencyKey)) idempotencyKeys.push(idempotencyKey);
  return { idempotencyKey, startTime, partySize: 2, guestName: "Cliente Widget", phone: "+390212345678", email: `widget-${suffix}@example.test`, notes: "Test widget", privacyConsent: true };
}

before(async () => {
  const company = await prisma.company.findUniqueOrThrow({ where: { vatNumber: "IT00000000000" } });
  const location = await prisma.location.create({ data: { companyId: company.id, slug: `widget-${suffix.toLowerCase()}`, code: `W-${suffix}`, name: "Widget Test" } });
  const area = await prisma.restaurantArea.create({ data: { companyId: company.id, locationId: location.id, code: `W-${suffix}`, name: "Widget" } });
  const table = await prisma.restaurantTable.create({ data: { companyId: company.id, locationId: location.id, areaId: area.id, code: `W-${suffix}`, name: "Tavolo Widget", seats: 4 } });
  await prisma.restaurantBookingSettings.create({ data: { companyId: company.id, locationId: location.id, minAdvanceMinutes: 0, maxAdvanceDays: 365, openingHours: {} } });
  await prisma.restaurantBookingWidget.create({ data: { companyId: company.id, locationId: location.id, enabled: true, publicKey, allowedDomains: ["example.test"], heading: "Prenota Widget", successMessage: "Richiesta widget ricevuta." } });
  companyId = company.id; locationId = location.id; areaId = area.id; tableId = table.id;
});

after(async () => {
  const persistedReservations = await prisma.restaurantReservation.findMany({ where: { companyId, locationId }, select: { id: true } });
  const cleanupIds = [...new Set([...reservationIds, ...persistedReservations.map((reservation) => reservation.id)])];
  await prisma.domainEvent.deleteMany({ where: { companyId, aggregateType: "RestaurantReservation", aggregateId: { in: cleanupIds } } });
  await prisma.restaurantReservationTable.deleteMany({ where: { companyId, reservationId: { in: cleanupIds } } });
  await prisma.restaurantReservation.deleteMany({ where: { id: { in: cleanupIds } } });
  await prisma.idempotencyRecord.deleteMany({ where: { companyId, commandType: "RestaurantBookingCreate", idempotencyKey: { in: idempotencyKeys } } });
  await prisma.restaurantBookingWidget.deleteMany({ where: { companyId, locationId } });
  await prisma.restaurantBookingSettings.deleteMany({ where: { companyId, locationId } });
  await prisma.restaurantTable.deleteMany({ where: { id: tableId } });
  await prisma.restaurantArea.deleteMany({ where: { id: areaId } });
  await prisma.location.deleteMany({ where: { id: locationId } });
  await prisma.$disconnect();
});

test("Booking Widget: config pubblica non espone identificativi interni", async () => {
  const config = await getWidgetPublicConfig(publicKey, "https://www.example.test");
  assert.equal(config.heading, "Prenota Widget");
  assert.equal("companyId" in config, false);
  assert.equal("locationId" in config, false);
});

test("Booking Widget: applica i domini consentiti", async () => {
  await getWidgetPublicConfig(publicKey, "https://example.test");
  await assert.rejects(getWidgetPublicConfig(publicKey, "https://example.invalid"), (error: unknown) => error instanceof BookingWidgetError && error.status === 403);
});

test("Booking Widget: preflight CORS autorizza solo domini consentiti", async () => {
  const allowed = await reservationOptions(new Request(`http://localhost/api/widget/v1/${publicKey}/reservation`, { method: "OPTIONS", headers: { Origin: "https://shop.example.test" } }), { params: Promise.resolve({ publicKey }) });
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get("access-control-allow-origin"), "https://shop.example.test");
  const denied = await reservationOptions(new Request(`http://localhost/api/widget/v1/${publicKey}/reservation`, { method: "OPTIONS", headers: { Origin: "https://example.invalid" } }), { params: Promise.resolve({ publicKey }) });
  assert.equal(denied.status, 403);
});

test("Booking Widget: chiave pubblica usa entropia crittografica e formato v1 stabile", () => {
  const keys = new Set(Array.from({ length: 50 }, generateWidgetPublicKey));
  assert.equal(keys.size, 50);
  for (const key of keys) assert.match(key, /^nw_[A-Za-z0-9_-]{43}$/);
});

test("Booking Widget: chiave disattivata viene rifiutata", async () => {
  await prisma.restaurantBookingWidget.update({ where: { publicKey }, data: { enabled: false } });
  await assert.rejects(getWidgetPublicConfig(publicKey, "https://example.test"), (error: unknown) => error instanceof BookingWidgetError && error.status === 404);
  await prisma.restaurantBookingWidget.update({ where: { publicKey }, data: { enabled: true } });
});

test("Booking Widget: restituisce disponibilità della sede risolta dalla chiave", async () => {
  const slots = await getWidgetAvailability(publicKey, { date: future(30), partySize: 2 }, "https://example.test");
  assert.ok(slots.length > 0);
});

test("Booking Widget: crea una prenotazione nella sede della chiave", async () => {
  const result = await submitWidgetReservation(publicKey, randomUUID(), reservationInput(future(31)), "https://example.test", new BookingWidgetRateLimiter());
  const reservation = await prisma.restaurantReservation.findFirstOrThrow({ where: { companyId, locationId, code: result.code } });
  reservationIds.push(reservation.id);
  assert.equal(reservation.source, "WEBSITE");
});

test("Booking Widget: doppio invio idempotente non duplica la prenotazione", async () => {
  const key = randomUUID();
  const input = reservationInput(future(32), key);
  const limiter = new BookingWidgetRateLimiter();
  const first = await submitWidgetReservation(publicKey, randomUUID(), input, "https://example.test", limiter);
  const second = await submitWidgetReservation(publicKey, randomUUID(), input, "https://example.test", limiter);
  assert.equal(second.code, first.code);
  const rows = await prisma.restaurantReservation.findMany({ where: { companyId, locationId, code: first.code } });
  reservationIds.push(...rows.map((row) => row.id));
  assert.equal(rows.length, 1);
});
