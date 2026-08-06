import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { cancelBookingWithNotifications } from "../../lib/booking-email";
import type { EmailMessage, EmailProvider } from "../../lib/email";
import { prisma } from "../../lib/prisma";
import { PublicBookingRateLimiter, submitPublicBooking } from "../../lib/public-booking";

if (!(process.env.DATABASE_URL ?? "").includes("_test")) throw new Error("I test Booking Email richiedono DATABASE_URL _test.");

class RecordingProvider implements EmailProvider {
  readonly name = "test" as const;
  readonly messages: EmailMessage[] = [];

  async send(message: EmailMessage) {
    this.messages.push(message);
    return { provider: "noop" as const };
  }
}

class FailingProvider implements EmailProvider {
  readonly name = "test" as const;
  calls = 0;

  async send(_message: EmailMessage): Promise<never> {
    this.calls += 1;
    throw new Error("SMTP unavailable");
  }
}

const suffix = randomUUID().slice(0, 8).toLowerCase();
const slug = `booking-email-${suffix}`;
const reservationIds: string[] = [];
let companyId = "";
let locationId = "";
let areaId = "";
let tableId = "";

function future(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(12, 0, 0, 0);
  return date;
}

async function book(days: number, provider: EmailProvider, idempotencyKey = randomUUID()) {
  const result = await submitPublicBooking(slug, randomUUID(), {
    idempotencyKey,
    startTime: future(days),
    partySize: 2,
    guestName: "Cliente Email",
    phone: "+390123456789",
    email: `cliente-${suffix}@example.test`,
    notes: "Nota essenziale",
    privacyConsent: true,
  }, new PublicBookingRateLimiter(), provider, "http://127.0.0.1:3100");
  if (!reservationIds.includes(result.reservationId)) reservationIds.push(result.reservationId);
  return result;
}

before(async () => {
  const company = await prisma.company.findUniqueOrThrow({ where: { vatNumber: "IT00000000000" } });
  const location = await prisma.location.create({ data: { companyId: company.id, slug, code: `MAIL-${suffix.toUpperCase()}`, name: "Booking Email", email: "ristorante@example.test", phone: "+3902000000" } });
  const area = await prisma.restaurantArea.create({ data: { companyId: company.id, locationId: location.id, code: `MAIL-${suffix.toUpperCase()}`, name: "Email" } });
  const table = await prisma.restaurantTable.create({ data: { companyId: company.id, locationId: location.id, areaId: area.id, code: `MAIL-${suffix.toUpperCase()}`, name: "Email", seats: 4 } });
  await prisma.restaurantBookingSettings.create({ data: { companyId: company.id, locationId: location.id, minAdvanceMinutes: 0, maxAdvanceDays: 365, openingHours: {}, internalNotificationEmail: "booking@example.test" } });
  companyId = company.id;
  locationId = location.id;
  areaId = area.id;
  tableId = table.id;
});

after(async () => {
  await prisma.domainEvent.deleteMany({ where: { companyId, aggregateType: "RestaurantReservation", aggregateId: { in: reservationIds } } });
  await prisma.restaurantReservationTable.deleteMany({ where: { companyId, reservationId: { in: reservationIds } } });
  await prisma.restaurantReservation.deleteMany({ where: { id: { in: reservationIds } } });
  await prisma.idempotencyRecord.deleteMany({ where: { companyId, aggregateType: "RestaurantReservation", aggregateId: { in: reservationIds } } });
  await prisma.restaurantBookingSettings.deleteMany({ where: { companyId, locationId } });
  await prisma.restaurantTable.deleteMany({ where: { id: tableId } });
  await prisma.restaurantArea.deleteMany({ where: { id: areaId } });
  await prisma.location.deleteMany({ where: { id: locationId } });
  await prisma.$disconnect();
});

test("Booking Email: conferma cliente invocata una volta", async () => {
  const provider = new RecordingProvider();
  await book(40, provider);
  assert.equal(provider.messages.filter((message) => message.to.endsWith("@example.test") && message.to.startsWith("cliente-")).length, 1);
});

test("Booking Email: notifica interna invocata una volta", async () => {
  const provider = new RecordingProvider();
  await book(41, provider);
  assert.equal(provider.messages.filter((message) => message.to === "booking@example.test").length, 1);
});

test("Booking Email: submit idempotente non duplica gli invii", async () => {
  const provider = new RecordingProvider();
  const key = randomUUID();
  const first = await book(42, provider, key);
  const second = await book(42, provider, key);
  assert.equal(second.reservationId, first.reservationId);
  assert.equal(provider.messages.length, 2);
});

test("Booking Email: fallimento SMTP non annulla la prenotazione", async () => {
  const provider = new FailingProvider();
  const result = await book(43, provider);
  const reservation = await prisma.restaurantReservation.findUniqueOrThrow({ where: { id: result.reservationId } });
  assert.equal(reservation.status, "PENDING");
  assert.equal(provider.calls, 2);
});

test("Booking Email: cancellazione invia cliente e ristorante una volta", async () => {
  const provider = new RecordingProvider();
  const result = await book(44, provider);
  await cancelBookingWithNotifications(companyId, locationId, result.reservationId, null, provider);
  const cancellationMessages = provider.messages.filter((message) => message.subject.startsWith("Prenotazione annullata"));
  assert.equal(cancellationMessages.length, 2);
  assert.equal((await prisma.restaurantReservation.findUniqueOrThrow({ where: { id: result.reservationId } })).status, "CANCELLED");
});
