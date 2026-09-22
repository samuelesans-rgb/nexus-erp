import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, test } from "node:test";

import { createReservation, newCancellationToken, transitionReservation } from "../../lib/restaurant-booking";
import { acceptWaitlistOffer, pendingStaffCalls, resolveStaffCall, RestaurantWaitlistError } from "../../lib/restaurant-waitlist";
import { sendWaitlistOffer } from "../../lib/booking-email";
import type { EmailMessage, EmailProvider } from "../../lib/email";
import { PublicBookingRateLimiter, submitPublicBooking } from "../../lib/public-booking";
import { prisma } from "../../lib/prisma";
import { zonedTimeToUtc } from "../../lib/timezone";

if (!(process.env.DATABASE_URL ?? "").includes("_test")) throw new Error("Richiede DATABASE_URL _test.");

const ROME = "Europe/Rome";
const suffix = randomUUID().slice(0, 8);
let companyId = "", locationId = "", areaId = "", tableId = "";

before(async () => {
  companyId = (await prisma.company.create({ data: { name: `Wait ${suffix}` } })).id;
  locationId = (await prisma.location.create({ data: { companyId, code: `W-${suffix}`, slug: `w-${suffix}`, name: "Sede", timezone: ROME } })).id;
  areaId = (await prisma.restaurantArea.create({ data: { companyId, locationId, code: "S", name: "Sala" } })).id;
  // Un solo tavolo da due: il posto si libera e si riassegna in modo visibile.
  tableId = (await prisma.restaurantTable.create({ data: { companyId, locationId, areaId, code: "T1", name: "T1", seats: 2, maxSeats: 2 } })).id;
  await prisma.restaurantBookingSettings.create({
    data: { companyId, locationId, enabled: true, slotIntervalMinutes: 60, defaultDurationMinutes: 60, minAdvanceMinutes: 0, maxAdvanceDays: 730, maxCoversPerSlot: 0,
      openingHours: Object.fromEntries(["0","1","2","3","4","5","6"].map((d) => [d, [["00:00", "23:59"]]])) },
  });
});

beforeEach(async () => {
  await prisma.restaurantReservationTable.deleteMany({ where: { companyId } });
  await prisma.restaurantReservation.deleteMany({ where: { companyId } });
  await prisma.idempotencyRecord.deleteMany({ where: { companyId } });
});

after(async () => {
  await prisma.domainEvent.deleteMany({ where: { companyId } });
  await prisma.restaurantReservationTable.deleteMany({ where: { companyId } });
  await prisma.restaurantReservation.deleteMany({ where: { companyId } });
  await prisma.idempotencyRecord.deleteMany({ where: { companyId } });
  await prisma.restaurantBookingSettings.deleteMany({ where: { companyId } });
  await prisma.restaurantTable.deleteMany({ where: { companyId } });
  await prisma.restaurantArea.deleteMany({ where: { companyId } });
  await prisma.location.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
  await prisma.$disconnect();
});

const inHours = (h: number) => new Date(Date.now() + h * 3_600_000);
const holder = async (startTime: Date, partySize = 2) => {
  const result = await createReservation(companyId, null, randomUUID(), { cancellationToken: newCancellationToken(), locationId, guestName: "Titolare", partySize, startTime, source: "WEBSITE" });
  await transitionReservation(companyId, locationId, result.reservationId, "CONFIRMED");
  return result.reservationId;
};
const waiter = async (startTime: Date, options: { partySize?: number; from?: Date; to?: Date; name?: string } = {}) =>
  (await prisma.restaurantReservation.create({
    data: { companyId, locationId, code: `W-${randomUUID().slice(0, 6)}`, guestName: options.name ?? "In lista", phone: "+390000", email: `w-${randomUUID().slice(0, 6)}@test.invalid`,
      partySize: options.partySize ?? 2, reservationDate: startTime, startTime, endTime: new Date(startTime.getTime() + 3_600_000), durationMinutes: 60,
      status: "WAITLIST", source: "WEBSITE", waitlistFromTime: options.from ?? startTime, waitlistToTime: options.to ?? startTime },
    select: { id: true },
  })).id;

test("una cancellazione offre il posto al primo in lista", async () => {
  const slot = inHours(6);
  const booked = await holder(slot);
  const first = await waiter(slot, { name: "Primo" });
  await waiter(slot, { name: "Secondo" });

  const result = await transitionReservation(companyId, locationId, booked, "CANCELLED");
  assert.ok(result.waitlist?.offer, "deve essere partita un'offerta");
  assert.equal(result.waitlist!.offer!.reservationId, first, "l'ordine è quello di iscrizione");
  const row = await prisma.restaurantReservation.findUniqueOrThrow({ where: { id: first }, select: { offerExpiresAt: true, offerTokenHash: true } });
  assert.ok(row.offerExpiresAt && row.offerTokenHash, "l'offerta è registrata con scadenza e token");
});

test("il token dell'offerta non viene conservato in chiaro", async () => {
  const slot = inHours(6);
  const booked = await holder(slot);
  const entry = await waiter(slot);
  const result = await transitionReservation(companyId, locationId, booked, "CANCELLED");
  const plain = result.waitlist!.offer!.offerToken;
  const row = await prisma.restaurantReservation.findUniqueOrThrow({ where: { id: entry }, select: { offerTokenHash: true } });
  assert.notEqual(row.offerTokenHash, plain, "in database c'è l'impronta, non il token");
  assert.equal(row.offerTokenHash!.length, 64, "sha256 esadecimale");
});

test("accettare l'offerta conferma la prenotazione e consuma il token", async () => {
  const slot = inHours(6);
  const booked = await holder(slot);
  const entry = await waiter(slot);
  const offer = (await transitionReservation(companyId, locationId, booked, "CANCELLED")).waitlist!.offer!;

  const accepted = await acceptWaitlistOffer(companyId, locationId, offer.offerToken);
  assert.equal(accepted.id, entry);
  const row = await prisma.restaurantReservation.findUniqueOrThrow({ where: { id: entry }, select: { status: true, offerTokenHash: true, offerExpiresAt: true } });
  assert.equal(row.status, "CONFIRMED");
  assert.equal(row.offerTokenHash, null, "il token è speso");
  assert.equal(row.offerExpiresAt, null);
  await assert.rejects(acceptWaitlistOffer(companyId, locationId, offer.offerToken), RestaurantWaitlistError, "non si accetta due volte");
});

test("un'offerta scaduta non si accetta", async () => {
  const slot = inHours(6);
  const booked = await holder(slot);
  const entry = await waiter(slot);
  const offer = (await transitionReservation(companyId, locationId, booked, "CANCELLED")).waitlist!.offer!;
  await prisma.restaurantReservation.update({ where: { id: entry }, data: { offerExpiresAt: new Date(Date.now() - 60_000) } });
  await assert.rejects(acceptWaitlistOffer(companyId, locationId, offer.offerToken), /scaduta/);
  assert.equal((await prisma.restaurantReservation.findUniqueOrThrow({ where: { id: entry }, select: { status: true } })).status, "WAITLIST");
});

test("chi è in lista per una fascia diversa non viene disturbato", async () => {
  const slot = inHours(6);
  const booked = await holder(slot);
  await waiter(inHours(20), { name: "Altra sera" });
  const result = await transitionReservation(companyId, locationId, booked, "CANCELLED");
  assert.equal(result.waitlist?.offer, undefined, "nessuna offerta a chi voleva un'altra fascia");
});

test("un posto troppo piccolo non viene offerto a un gruppo grande", async () => {
  const slot = inHours(6);
  const booked = await holder(slot, 2);
  await waiter(slot, { partySize: 6, name: "Gruppo grande" });
  const result = await transitionReservation(companyId, locationId, booked, "CANCELLED");
  assert.equal(result.waitlist?.offer, undefined, "liberare un tavolo da due non serve a sei persone");
});

test("sotto i 45 minuti si chiede allo staff di chiamare, e l'avviso resta", async () => {
  const slot = new Date(Date.now() + 25 * 60_000);
  const booked = await holder(slot);
  const entry = await waiter(slot, { name: "Rossi" });

  const result = await transitionReservation(companyId, locationId, booked, "CANCELLED");
  assert.equal(result.waitlist?.offer, undefined, "niente email: non c'è tempo");
  assert.ok(result.waitlist?.call, "si chiede di telefonare");
  assert.equal(result.waitlist!.call!.guestName, "Rossi");

  const calls = await pendingStaffCalls(companyId, locationId);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.id, entry);
  assert.ok(calls[0]!.timeLabel.includes(":"), "l'ora è quella del locale");

  // L'avviso non sparisce da solo: resta finché qualcuno non lo gestisce.
  assert.equal((await pendingStaffCalls(companyId, locationId)).length, 1);
  await resolveStaffCall(companyId, locationId, entry);
  assert.equal((await pendingStaffCalls(companyId, locationId)).length, 0);
  await assert.rejects(resolveStaffCall(companyId, locationId, entry), /già gestita/);
});

test("un'offerta già in corso non viene sovrascritta da una seconda liberazione", async () => {
  const slot = inHours(6);
  const primo = await holder(slot);
  const entry = await waiter(slot);
  const offer = (await transitionReservation(companyId, locationId, primo, "CANCELLED")).waitlist!.offer!;

  const secondo = await holder(slot);
  const again = await transitionReservation(companyId, locationId, secondo, "CANCELLED");
  assert.equal(again.waitlist?.offer, undefined, "chi ha già un'offerta aperta non viene disturbato di nuovo");
  const row = await prisma.restaurantReservation.findUniqueOrThrow({ where: { id: entry }, select: { offerTokenHash: true } });
  assert.ok(row.offerTokenHash, "l'offerta originale resta valida");
  await acceptWaitlistOffer(companyId, locationId, offer.offerToken);
});

class Recorder implements EmailProvider {
  readonly name = "test" as const;
  readonly messages: EmailMessage[] = [];
  async send(message: EmailMessage) { this.messages.push(message); return { provider: "noop" as const }; }
}
class Unconfigured implements EmailProvider {
  readonly name = "noop" as const;
  calls = 0;
  async send() { this.calls += 1; return { provider: "noop" as const }; }
}

test("dal sito: niente posto, e si entra in lista invece di trovare un muro", async () => {
  const slot = inHours(8);
  await holder(slot); // l'unico tavolo è occupato
  const result = await submitPublicBooking(`w-${suffix}`, randomUUID(), {
    idempotencyKey: randomUUID(), startTime: slot, partySize: 2, guestName: "In coda",
    phone: "+390001", email: `coda-${randomUUID().slice(0, 6)}@test.invalid`,
    privacyConsent: true, joinWaitlistIfFull: true, waitlistToleranceMinutes: 30,
  }, new PublicBookingRateLimiter(), new Recorder(), "http://127.0.0.1:3100");
  assert.equal(result.status, "WAITLIST");
  const row = await prisma.restaurantReservation.findUniqueOrThrow({ where: { id: result.reservationId }, select: { status: true, waitlistFromTime: true, waitlistToTime: true } });
  assert.equal(row.status, "WAITLIST");
  // La tolleranza dichiarata definisce quali liberazioni lo riguardano.
  assert.equal(row.waitlistFromTime!.toISOString(), new Date(slot.getTime() - 30 * 60_000).toISOString());
  assert.equal(row.waitlistToTime!.toISOString(), new Date(slot.getTime() + 30 * 60_000).toISOString());
});

test("senza adesione esplicita nessuno finisce in lista", async () => {
  const slot = inHours(9);
  await holder(slot);
  await assert.rejects(
    submitPublicBooking(`w-${suffix}`, randomUUID(), {
      idempotencyKey: randomUUID(), startTime: slot, partySize: 2, guestName: "Non voglio la lista",
      phone: "+390002", email: `no-${randomUUID().slice(0, 6)}@test.invalid`, privacyConsent: true,
    }, new PublicBookingRateLimiter(), new Recorder(), "http://127.0.0.1:3100"),
    /Nessun tavolo disponibile/,
  );
  assert.equal(await prisma.restaurantReservation.count({ where: { companyId, status: "WAITLIST" } }), 0);
});

test("l'offerta arriva per email con un link che conferma", async () => {
  const slot = inHours(10);
  const booked = await holder(slot);
  const entry = await waiter(slot, { name: "Bianchi" });
  await prisma.restaurantReservation.update({ where: { id: entry }, data: { email: `off-${suffix}@test.invalid` } });

  const outcome = await transitionReservation(companyId, locationId, booked, "CANCELLED");
  const offer = outcome.waitlist!.offer!;
  const provider = new Recorder();
  await sendWaitlistOffer(companyId, locationId, offer, "http://127.0.0.1:3100", provider);

  const mail = provider.messages.find((m) => m.to === `off-${suffix}@test.invalid`);
  assert.ok(mail, "l'offerta deve partire");
  assert.match(mail.subject, /si è liberato un tavolo/i);
  const token = /offer\/([A-Za-z0-9_-]+)/.exec(mail.html)?.[1];
  assert.ok(token, "il messaggio contiene il link per confermare");
  const accepted = await acceptWaitlistOffer(companyId, locationId, decodeURIComponent(token));
  assert.equal(accepted.id, entry);
});

test("canale email non configurato: lo dichiara, non finge di aver invitato", async () => {
  const slot = inHours(11);
  const booked = await holder(slot);
  const entry = await waiter(slot);
  await prisma.restaurantReservation.update({ where: { id: entry }, data: { email: `nc-${suffix}@test.invalid` } });
  const offer = (await transitionReservation(companyId, locationId, booked, "CANCELLED")).waitlist!.offer!;

  const provider = new Unconfigured();
  await sendWaitlistOffer(companyId, locationId, offer, "http://127.0.0.1:3100", provider);
  assert.equal(provider.calls, 0, "non si finge un invio su un canale che non esiste");
  const skipped = await prisma.domainEvent.count({ where: { companyId, aggregateId: entry, eventType: "BookingEmailSkipped" } });
  assert.ok(skipped >= 1, "la mancata configurazione resta a registro");
  // L'offerta resta comunque valida: il posto è tenuto fino alla scadenza.
  const row = await prisma.restaurantReservation.findUniqueOrThrow({ where: { id: entry }, select: { offerExpiresAt: true } });
  assert.ok(row.offerExpiresAt, "il posto resta riservato anche se l'avviso non è partito");
});
