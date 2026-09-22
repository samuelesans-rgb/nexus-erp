import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { checkAvailability, getAvailableSlots } from "../../lib/restaurant-availability";
import { createReservation, newCancellationToken } from "../../lib/restaurant-booking";
import { openOrder } from "../../lib/restaurant-orders";
import { prisma } from "../../lib/prisma";
import { zonedTimeToUtc } from "../../lib/timezone";

if (!(process.env.DATABASE_URL ?? "").includes("_test")) throw new Error("Richiede DATABASE_URL _test.");

const ROME = "Europe/Rome";
const suffix = randomUUID().slice(0, 8);
let companyId = "", locationId = "", areaId = "", userId = "";
const tables: string[] = [];
const created: string[] = [];

before(async () => {
  companyId = (await prisma.company.create({ data: { name: `Cap ${suffix}` } })).id;
  userId = (await prisma.user.create({ data: { email: `cap-${suffix}@test.invalid`, firstName: "T", lastName: "T", password: "x" } })).id;
  locationId = (await prisma.location.create({ data: { companyId, code: `CAP-${suffix}`, slug: `cap-${suffix}`, name: "Sede", timezone: ROME } })).id;
  areaId = (await prisma.restaurantArea.create({ data: { companyId, locationId, code: "S", name: "Sala" } })).id;
  // Quattro tavoli da due: nessuno regge da solo un gruppo grande.
  for (let i = 1; i <= 4; i++)
    tables.push((await prisma.restaurantTable.create({ data: { companyId, locationId, areaId, code: `T${i}`, name: `T${i}`, seats: 2, maxSeats: 2, combinable: true } })).id);
  await prisma.restaurantBookingSettings.create({
    data: { companyId, locationId, enabled: true, slotIntervalMinutes: 60, defaultDurationMinutes: 60, minAdvanceMinutes: 0, maxAdvanceDays: 730, maxCoversPerSlot: 0,
      openingHours: Object.fromEntries(["0","1","2","3","4","5","6"].map((d) => [d, [["19:00", "23:00"]]])) },
  });
});

after(async () => {
  await prisma.auditLog.deleteMany({ where: { companyId } });
  await prisma.restaurantOrderLine.deleteMany({ where: { companyId } });
  await prisma.restaurantOrderTable.deleteMany({ where: { companyId } });
  await prisma.restaurantOrder.deleteMany({ where: { companyId } });
  await prisma.restaurantReservationTable.deleteMany({ where: { companyId } });
  await prisma.restaurantReservation.deleteMany({ where: { companyId } });
  await prisma.idempotencyRecord.deleteMany({ where: { companyId } });
  await prisma.domainEvent.deleteMany({ where: { companyId } });
  await prisma.restaurantBookingSettings.deleteMany({ where: { companyId } });
  await prisma.restaurantTable.deleteMany({ where: { companyId } });
  await prisma.restaurantArea.deleteMany({ where: { companyId } });
  await prisma.location.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
  await prisma.user.delete({ where: { id: userId } });
  await prisma.$disconnect();
});

const evening = (day: number, hour = 20) => zonedTimeToUtc({ year: 2027, month: 3, day, hour }, ROME);
const book = async (startTime: Date, partySize: number) => {
  const result = await createReservation(companyId, null, randomUUID(), { cancellationToken: newCancellationToken(), locationId, guestName: "Ospite", partySize, startTime, source: "WEBSITE" });
  created.push(result.reservationId);
  return result;
};

test("una prenotazione dal sito non si prende tavoli specifici", async () => {
  const result = await book(evening(1), 2);
  const claimed = await prisma.restaurantReservationTable.count({ where: { companyId, reservationId: result.reservationId } });
  assert.equal(claimed, 0, "il tavolo lo sceglie il cameriere all'arrivo");
});

test("un gruppo grande entra grazie all'unione al volo", async () => {
  // Quattro tavoli da due: nessuno da solo regge otto persone, e non esiste
  // alcuna combinazione configurata. Prima questo gruppo non era prenotabile.
  const available = await checkAvailability(companyId, locationId, { startTime: evening(2), partySize: 8, ignoreAdvance: true });
  assert.equal(available.available, true);
  assert.deepEqual(available.tableIds, [], "accettato per capienza, senza fissare i tavoli");
  const result = await book(evening(2), 8);
  assert.ok(result.reservationId);
});

test("oltre la capienza della sala si rifiuta", async () => {
  // Otto posti in tutto: nove persone non ci stanno.
  const available = await checkAvailability(companyId, locationId, { startTime: evening(3), partySize: 9, ignoreAdvance: true });
  assert.equal(available.available, false);
  await assert.rejects(book(evening(3), 9), /Nessun tavolo disponibile/);
});

test("le prenotazioni della stessa fascia competono per la sala", async () => {
  const slot = evening(4);
  await book(slot, 6); // occupa tre tavoli su quattro
  const stillFits = await checkAvailability(companyId, locationId, { startTime: slot, partySize: 2, ignoreAdvance: true });
  assert.equal(stillFits.available, true, "resta un tavolo da due");
  await book(slot, 2);
  const overflow = await checkAvailability(companyId, locationId, { startTime: slot, partySize: 2, ignoreAdvance: true });
  assert.equal(overflow.available, false, "la sala è piena: non si accetta oltre");
});

test("la Sala può aprire l'unione che il sito ha promesso", async () => {
  // È il punto di coerenza: se il canale pubblico accetta un gruppo contando
  // su un'unione al volo, il cameriere deve poterla aprire davvero.
  const order = await openOrder(companyId, locationId, userId, { tableIds: tables.slice(0, 4), guestCount: 8, serviceType: "DINE_IN" });
  assert.ok(order.id);
  await prisma.restaurantOrder.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
});

test("§4 la valutazione in memoria dà gli stessi slot di quella per slot", async () => {
  const day = evening(10, 12);
  const inMemory = await getAvailableSlots(companyId, locationId, { date: day, partySize: 4 });
  const perSlot = await getAvailableSlots(companyId, locationId, { date: day, partySize: 4 }, checkAvailability);
  assert.deepEqual(inMemory.map((d) => d.toISOString()), perSlot.map((d) => d.toISOString()));
  assert.ok(inMemory.length, "la serata deve produrre slot");
});
