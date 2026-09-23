import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, test } from "node:test";

import { assignTable, assignTables, createReservation, createStaffReservation, newCancellationToken, updateReservation } from "../../lib/restaurant-booking";
import { openOrder } from "../../lib/restaurant-orders";
import { prisma } from "../../lib/prisma";

if (!(process.env.DATABASE_URL ?? "").includes("_test")) throw new Error("Richiede DATABASE_URL _test.");

const suffix = randomUUID().slice(0, 8);
let companyId = "", locationId = "", areaId = "", userId = "";
const tables: string[] = [];

before(async () => {
  companyId = (await prisma.company.create({ data: { name: `NB ${suffix}` } })).id;
  userId = (await prisma.user.create({ data: { email: `nb-${suffix}@test.invalid`, firstName: "T", lastName: "T", password: "x" } })).id;
  locationId = (await prisma.location.create({ data: { companyId, code: `NB-${suffix}`, slug: `nb-${suffix}`, name: "Sede", timezone: "Europe/Rome" } })).id;
  areaId = (await prisma.restaurantArea.create({ data: { companyId, locationId, code: "S", name: "Sala" } })).id;
  for (let i = 1; i <= 3; i++)
    tables.push((await prisma.restaurantTable.create({ data: { companyId, locationId, areaId, code: `N${i}`, name: `N${i}`, seats: 4, maxSeats: 4 } })).id);
  await prisma.restaurantBookingSettings.create({
    data: { companyId, locationId, enabled: true, slotIntervalMinutes: 60, defaultDurationMinutes: 60, minAdvanceMinutes: 0, maxAdvanceDays: 730, maxCoversPerSlot: 0,
      openingHours: Object.fromEntries(["0","1","2","3","4","5","6"].map((d) => [d, [["00:00", "23:59"]]])) },
  });
});

beforeEach(async () => {
  await prisma.restaurantOrderTable.deleteMany({ where: { companyId } });
  await prisma.restaurantOrder.deleteMany({ where: { companyId } });
  await prisma.restaurantReservationTable.deleteMany({ where: { companyId } });
  await prisma.restaurantReservation.deleteMany({ where: { companyId } });
  await prisma.idempotencyRecord.deleteMany({ where: { companyId } });
});

after(async () => {
  await prisma.auditLog.deleteMany({ where: { companyId } });
  await prisma.domainEvent.deleteMany({ where: { companyId } });
  await prisma.restaurantOrderTable.deleteMany({ where: { companyId } });
  await prisma.restaurantOrder.deleteMany({ where: { companyId } });
  await prisma.restaurantReservationTable.deleteMany({ where: { companyId } });
  await prisma.restaurantReservation.deleteMany({ where: { companyId } });
  await prisma.idempotencyRecord.deleteMany({ where: { companyId } });
  await prisma.restaurantBookingSettings.deleteMany({ where: { companyId } });
  await prisma.restaurantTable.deleteMany({ where: { companyId } });
  await prisma.restaurantArea.deleteMany({ where: { companyId } });
  await prisma.location.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
  await prisma.user.delete({ where: { id: userId } });
  await prisma.$disconnect();
});

const book = async (startTime: Date, partySize = 2) => {
  const result = await createReservation(companyId, null, randomUUID(), { cancellationToken: newCancellationToken(), locationId, guestName: "Ospite", partySize, startTime, source: "PHONE" });
  return result.reservationId;
};

test("§9 una comanda aperta adesso non impedisce di assegnare per domani", async () => {
  // La sala è piena: c'è una comanda aperta sul tavolo.
  const order = await openOrder(companyId, locationId, userId, { tableId: tables[0], guestCount: 2, serviceType: "DINE_IN" });
  const tomorrow = new Date(Date.now() + 24 * 3_600_000);
  const reservation = await book(tomorrow);

  // È il momento in cui il cameriere ha tempo per preparare il giorno dopo.
  const assigned = await assignTable(companyId, locationId, reservation, tables[0]!, userId);
  assert.equal(assigned.tableId, tables[0]);
  await prisma.restaurantOrder.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
});

test("§9 una prenotazione già in corso non arriva nemmeno all'assegnazione", async () => {
  // È il motivo per cui il controllo sulla comanda aperta è stato tolto invece
  // che condizionato: assignTable passa da checkAvailability, che rifiuta per
  // anticipo minimo ogni orario non futuro. Una finestra che contiene adesso
  // non raggiunge mai quel punto.
  const past = await prisma.restaurantReservation.create({
    data: { companyId, locationId, code: `PAST-${randomUUID().slice(0, 6)}`, guestName: "In corso", partySize: 2,
      reservationDate: new Date(Date.now() - 30 * 60_000), startTime: new Date(Date.now() - 30 * 60_000),
      endTime: new Date(Date.now() + 30 * 60_000), durationMinutes: 60, status: "CONFIRMED", source: "PHONE" },
    select: { id: true },
  });
  await assert.rejects(assignTable(companyId, locationId, past.id, tables[0]!, userId), /anticipo minimo/);
});

test("§9 un tavolo fuori servizio resta escluso comunque", async () => {
  await prisma.restaurantTable.update({ where: { id: tables[1] }, data: { physicalStatus: "OUT_OF_SERVICE" } });
  const tomorrow = await book(new Date(Date.now() + 24 * 3_600_000));
  await assert.rejects(assignTable(companyId, locationId, tomorrow, tables[1]!, userId), /non disponibile|non appartenente/);
  await prisma.restaurantTable.update({ where: { id: tables[1] }, data: { physicalStatus: "READY" } });
});

test("§8 spostare una prenotazione valida tutti i suoi tavoli, non solo il primo", async () => {
  const slot = new Date(Date.now() + 26 * 3_600_000);
  const moved = await book(slot, 4);
  await assignTables(companyId, locationId, moved, [tables[0]!, tables[1]!], userId);

  // Un'altra prenotazione occupa il SECONDO tavolo al nuovo orario.
  const target = new Date(Date.now() + 28 * 3_600_000);
  const blocker = await book(target, 4);
  await assignTable(companyId, locationId, blocker, tables[1]!, userId);

  // Spostare la prima sul nuovo orario deve fallire: prima il secondo tavolo
  // non veniva nemmeno guardato.
  await assert.rejects(
    updateReservation(companyId, locationId, moved, { guestName: "Ospite", partySize: 4, startTime: target, durationMinutes: 60 }, userId),
    /Sovrapposizione|non disponibile/,
  );
});

test("§10 una prenotazione non può nascere già seduta o terminata", async () => {
  const base = { guestName: "Furbo", partySize: 2, startTime: new Date(Date.now() + 5 * 3_600_000), source: "PHONE" as const };
  for (const status of ["SEATED", "COMPLETED", "NO_SHOW"] as const)
    await assert.rejects(
      createStaffReservation(companyId, locationId, userId, { ...base, status }),
      /non puo' nascere nello stato/,
      `${status} non è uno stato iniziale`,
    );
  // I tre leciti restano leciti.
  for (const status of ["PENDING", "WAITLIST", "CONFIRMED"] as const) {
    const created = await createStaffReservation(companyId, locationId, userId, { ...base, status });
    assert.ok(created.id);
  }
});

test("§15 la durata dello staff segue le impostazioni, non una costante", async () => {
  await prisma.restaurantBookingSettings.updateMany({ where: { companyId, locationId }, data: { defaultDurationMinutes: 90 } });
  const created = await createStaffReservation(companyId, locationId, userId, {
    guestName: "Novanta", partySize: 2, startTime: new Date(Date.now() + 6 * 3_600_000), source: "PHONE",
  });
  const row = await prisma.restaurantReservation.findUniqueOrThrow({ where: { id: created.id }, select: { durationMinutes: true } });
  assert.equal(row.durationMinutes, 90, "prima erano 120 fissi");
  await prisma.restaurantBookingSettings.updateMany({ where: { companyId, locationId }, data: { defaultDurationMinutes: 60 } });
});
