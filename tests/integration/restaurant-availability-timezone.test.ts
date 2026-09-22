import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { checkAvailability, getAvailableSlots, RestaurantAvailabilityError } from "../../lib/restaurant-availability";
import { getStaffReservations } from "../../lib/restaurant-booking";
import { prisma } from "../../lib/prisma";
import { zonedParts, zonedTimeToUtc } from "../../lib/timezone";

if (!(process.env.DATABASE_URL ?? "").includes("_test")) throw new Error("Richiede DATABASE_URL _test.");

const ROME = "Europe/Rome";
const suffix = randomUUID().slice(0, 8);
let companyId = "", locationId = "", areaId = "", tableId = "";

before(async () => {
  const company = await prisma.company.create({ data: { name: `TZ ${suffix}` } });
  companyId = company.id;
  const location = await prisma.location.create({
    data: { companyId, code: `TZ-${suffix}`, slug: `tz-${suffix}`, name: "Sede", timezone: ROME },
  });
  locationId = location.id;
  const area = await prisma.restaurantArea.create({ data: { companyId, locationId, code: "S", name: "Sala" } });
  areaId = area.id;
  tableId = (await prisma.restaurantTable.create({
    data: { companyId, locationId, areaId, code: "T1", name: "T1", seats: 4, maxSeats: 6 },
  })).id;
  await prisma.restaurantBookingSettings.create({
    data: {
      companyId, locationId, enabled: true, slotIntervalMinutes: 60, defaultDurationMinutes: 60,
      minAdvanceMinutes: 0, maxAdvanceDays: 730, maxCoversPerSlot: 0,
      // Servizio serale dichiarato in ora locale: 19:00-23:00.
      openingHours: { "0": [["19:00", "23:00"]], "1": [["19:00", "23:00"]], "2": [["19:00", "23:00"]], "3": [["19:00", "23:00"]], "4": [["19:00", "23:00"]], "5": [["19:00", "23:00"]], "6": [["19:00", "23:00"]] },
    },
  });
});

after(async () => {
  await prisma.restaurantReservationTable.deleteMany({ where: { companyId } });
  await prisma.restaurantReservation.deleteMany({ where: { companyId } });
  await prisma.restaurantBookingSettings.deleteMany({ where: { companyId } });
  await prisma.restaurantTable.deleteMany({ where: { companyId } });
  await prisma.restaurantArea.deleteMany({ where: { companyId } });
  await prisma.location.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
  await prisma.$disconnect();
});

const romeAt = (y: number, m: number, d: number, hour: number, minute = 0) =>
  zonedTimeToUtc({ year: y, month: m, day: d, hour, minute }, ROME);

test("le 20:00 locali d'estate sono dentro il servizio, non fuori", async () => {
  // Prima della correzione "19:00" significava le 19 UTC, cioè le 21 a Roma:
  // una prenotazione per le 20:00 locali veniva rifiutata come fuori orario.
  const result = await checkAvailability(companyId, locationId, { startTime: romeAt(2026, 7, 15, 20), partySize: 2, ignoreAdvance: true });
  assert.equal(result.available, true);
});

test("le 18:00 locali d'estate sono fuori servizio, e vengono rifiutate", async () => {
  // Il rovescio: prima della correzione le 18:00 locali (16:00 UTC) cadevano
  // dentro la finestra letta come UTC, e venivano accettate a cucina chiusa.
  await assert.rejects(
    checkAvailability(companyId, locationId, { startTime: romeAt(2026, 7, 15, 18), partySize: 2, ignoreAdvance: true }),
    (error: Error) => error instanceof RestaurantAvailabilityError,
  );
});

test("25 ottobre 2026: il servizio resta alle 19:00 locali anche dopo il cambio d'ora", async () => {
  const before = await checkAvailability(companyId, locationId, { startTime: romeAt(2026, 10, 24, 20), partySize: 2, ignoreAdvance: true });
  const after = await checkAvailability(companyId, locationId, { startTime: romeAt(2026, 10, 25, 20), partySize: 2, ignoreAdvance: true });
  assert.equal(before.available, true, "sabato, ora legale");
  assert.equal(after.available, true, "domenica, ora solare: stessa ora di parete, scarto diverso");
  // Gli istanti UTC differiscono di 25 ore: quella notte dura un'ora in più.
  assert.equal((after.startTime.getTime() - before.startTime.getTime()) / 3_600_000, 25);
});

test("gli slot del giorno sono quelli del locale, non quelli di UTC", async () => {
  // Data futura: getAvailableSlots applica l'anticipo minimo e scarterebbe il passato.
  const slots = await getAvailableSlots(companyId, locationId, { date: romeAt(2026, 11, 10, 12), partySize: 2 });
  assert.ok(slots.length, "il servizio serale deve produrre slot");
  for (const slot of slots) {
    const p = zonedParts(slot, ROME);
    assert.equal(p.day, 10, "nessuno slot deve scivolare al giorno successivo");
    assert.ok(p.hour >= 19 && p.hour < 23, `slot fuori servizio: ${p.hour}:00`);
  }
});

test("una prenotazione dopo mezzanotte appartiene al giorno del locale", async () => {
  // 20 settembre 2026 all'01:30 a Roma = 19 settembre 23:30 UTC.
  const startTime = romeAt(2026, 9, 20, 1, 30);
  assert.equal(startTime.toISOString(), "2026-09-19T23:30:00.000Z");
  const reservation = await prisma.restaurantReservation.create({
    data: { companyId, locationId, code: `RES-TZ-${suffix}`, guestName: "Nottambulo", partySize: 2, reservationDate: startTime, startTime, endTime: new Date(startTime.getTime() + 3_600_000), durationMinutes: 60, status: "CONFIRMED", source: "PHONE" },
  });
  const onTheDay = await getStaffReservations(companyId, locationId, { date: romeAt(2026, 9, 20, 12) });
  assert.ok(onTheDay.some((row) => row.id === reservation.id), "deve comparire nell'elenco del 20, il giorno del locale");
  const dayBefore = await getStaffReservations(companyId, locationId, { date: romeAt(2026, 9, 19, 12) });
  assert.equal(dayBefore.some((row) => row.id === reservation.id), false, "non deve comparire nell'elenco del 19");
});

test("una chiusura vale per il giorno del calendario del locale", async () => {
  const { saveCalendarException } = await import("../../lib/restaurant-booking-settings");
  const closed = romeAt(2026, 12, 25, 20);
  await saveCalendarException(companyId, locationId, { date: closed, type: "CLOSED", intervals: [], maxCovers: null, reason: "Natale", active: true });
  await assert.rejects(
    checkAvailability(companyId, locationId, { startTime: closed, partySize: 2, ignoreAdvance: true }),
    /chiusa/,
    "il 25 dicembre il locale è chiuso",
  );
  // Il giorno dopo si prenota: la chiusura non deborda.
  const after = await checkAvailability(companyId, locationId, { startTime: romeAt(2026, 12, 26, 20), partySize: 2, ignoreAdvance: true });
  assert.equal(after.available, true);
  await prisma.restaurantCalendarException.deleteMany({ where: { companyId } });
});

test("una chiusura inserita poco dopo mezzanotte resta sul giorno giusto", async () => {
  const { saveCalendarException } = await import("../../lib/restaurant-booking-settings");
  // 25 dicembre all'00:30 a Roma è ancora il 24 in UTC: normalizzare
  // sull'orologio del server sposterebbe la chiusura al giorno prima.
  const justAfterMidnight = romeAt(2026, 12, 25, 0, 30);
  assert.equal(justAfterMidnight.toISOString(), "2026-12-24T23:30:00.000Z");
  await saveCalendarException(companyId, locationId, { date: justAfterMidnight, type: "CLOSED", intervals: [], maxCovers: null, reason: "Natale", active: true });
  const stored = await prisma.restaurantCalendarException.findFirstOrThrow({ where: { companyId }, select: { date: true } });
  assert.equal(stored.date.toISOString().slice(0, 10), "2026-12-25", "la data salvata è il 25, non il 24");
  await assert.rejects(checkAvailability(companyId, locationId, { startTime: romeAt(2026, 12, 25, 20), partySize: 2, ignoreAdvance: true }), /chiusa/);
  await prisma.restaurantCalendarException.deleteMany({ where: { companyId } });
});

test("§6 un guasto non viene riportato come 'nessuna disponibilità'", async () => {
  const { getAvailableSlots: slotsWith } = await import("../../lib/restaurant-availability");
  const boom = new Error("connessione al database interrotta");
  await assert.rejects(
    slotsWith(companyId, locationId, { date: romeAt(2026, 11, 10, 12), partySize: 2 }, async () => { throw boom; }),
    (error: Error) => error === boom,
    "l'errore deve arrivare al chiamante, non diventare una lista vuota",
  );
});

test("§6 la sede chiusa resta una risposta, non un errore", async () => {
  const { getAvailableSlots: slotsWith } = await import("../../lib/restaurant-availability");
  const slots = await slotsWith(
    companyId, locationId, { date: romeAt(2026, 11, 10, 12), partySize: 2 },
    async () => { throw new RestaurantAvailabilityError("La sede è chiusa nell’orario selezionato."); },
  );
  assert.deepEqual(slots, [], "nessuno slot, senza sollevare");
});
