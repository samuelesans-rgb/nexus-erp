import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, test } from "node:test";

import { getAvailableSlots } from "../../lib/restaurant-availability";
import { canManageBookingSettings, getRestaurantBookingSettings, RestaurantBookingSettingsError, saveRestaurantBookingSettings } from "../../lib/restaurant-booking-settings";
import { prisma } from "../../lib/prisma";

if (!(process.env.DATABASE_URL ?? "").includes("_test")) throw new Error("I test Booking Settings richiedono DATABASE_URL _test.");

const suffix = randomUUID().slice(0, 8).toUpperCase();
let companyId = "";
let otherCompanyId = "";
let locationA = "";
let locationB = "";
let otherLocation = "";
let areaId = "";
let tableId = "";

const baseInput = {
  enabled: true,
  openingHours: { "0": [], "1": [["12:00", "14:30"], ["19:00", "23:00"]], "2": [], "3": [], "4": [], "5": [], "6": [] },
  slotIntervalMinutes: 30,
  defaultDurationMinutes: 120,
  minAdvanceMinutes: 60,
  maxAdvanceDays: 90,
  maxCoversPerSlot: 40,
  internalNotificationEmail: "booking@example.test",
  confirmationMessage: "Richiesta ricevuta.",
};

before(async () => {
  const [company, otherCompany] = await Promise.all([
    prisma.company.create({ data: { name: `Booking Settings ${suffix}` } }),
    prisma.company.create({ data: { name: `Booking Settings Other ${suffix}` } }),
  ]);
  const [first, second, foreign] = await Promise.all([
    prisma.location.create({ data: { companyId: company.id, slug: `settings-a-${suffix.toLowerCase()}`, code: `SA-${suffix}`, name: "Settings A", timezone: "Etc/UTC", isHeadquarters: true } }),
    prisma.location.create({ data: { companyId: company.id, slug: `settings-b-${suffix.toLowerCase()}`, code: `SB-${suffix}`, name: "Settings B", timezone: "Etc/UTC" } }),
    prisma.location.create({ data: { companyId: otherCompany.id, slug: `settings-o-${suffix.toLowerCase()}`, code: `SO-${suffix}`, name: "Settings Other", timezone: "Etc/UTC", isHeadquarters: true } }),
  ]);
  const area = await prisma.restaurantArea.create({ data: { companyId: company.id, locationId: first.id, code: `AREA-${suffix}`, name: "Sala" } });
  const tableRow = await prisma.restaurantTable.create({ data: { companyId: company.id, locationId: first.id, areaId: area.id, code: `TABLE-${suffix}`, name: "Tavolo", seats: 4 } });
  companyId = company.id; otherCompanyId = otherCompany.id; locationA = first.id; locationB = second.id; otherLocation = foreign.id; areaId = area.id; tableId = tableRow.id;
});

beforeEach(async () => { await prisma.restaurantBookingSettings.deleteMany({ where: { locationId: { in: [locationA, locationB, otherLocation] } } }); });

after(async () => {
  await prisma.restaurantBookingSettings.deleteMany({ where: { locationId: { in: [locationA, locationB, otherLocation] } } });
  await prisma.restaurantTable.deleteMany({ where: { id: tableId } });
  await prisma.restaurantArea.deleteMany({ where: { id: areaId } });
  await prisma.location.deleteMany({ where: { id: { in: [locationA, locationB, otherLocation] } } });
  await prisma.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId] } } });
  await prisma.$disconnect();
});

test("Booking Settings: crea e normalizza gli intervalli", async () => {
  const row = await saveRestaurantBookingSettings(companyId, locationA, { ...baseInput, openingHours: { ...baseInput.openingHours, "1": [["19:00", "23:00"], ["12:00", "14:30"]] } });
  assert.equal(row.enabled, true);
  assert.deepEqual(row.openingHours, { ...baseInput.openingHours, "1": [["12:00", "14:30"], ["19:00", "23:00"]] });
  assert.equal(await prisma.restaurantBookingSettings.count({ where: { companyId, locationId: locationA } }), 1);
});

test("Booking Settings: aggiorna la stessa riga e bookingEnabled", async () => {
  await saveRestaurantBookingSettings(companyId, locationA, baseInput);
  await saveRestaurantBookingSettings(companyId, locationA, { ...baseInput, enabled: false, slotIntervalMinutes: 15, confirmationMessage: "Confermeremo a breve." });
  const row = await getRestaurantBookingSettings(companyId, locationA);
  assert.equal(row?.enabled, false);
  assert.equal(row?.slotIntervalMinutes, 15);
  assert.equal(row?.confirmationMessage, "Confermeremo a breve.");
  assert.equal(await prisma.restaurantBookingSettings.count({ where: { companyId, locationId: locationA } }), 1);
});

test("Booking Settings: isolamento Location e Company", async () => {
  await saveRestaurantBookingSettings(companyId, locationA, baseInput);
  await saveRestaurantBookingSettings(companyId, locationB, { ...baseInput, maxCoversPerSlot: 12 });
  await assert.rejects(saveRestaurantBookingSettings(companyId, otherLocation, baseInput), RestaurantBookingSettingsError);
  assert.equal((await getRestaurantBookingSettings(companyId, locationA))?.maxCoversPerSlot, 40);
  assert.equal((await getRestaurantBookingSettings(companyId, locationB))?.maxCoversPerSlot, 12);
});

test("Booking Settings: policy riservata a SUPER_ADMIN e ADMIN", () => {
  assert.equal(canManageBookingSettings(["SUPER_ADMIN"]), true);
  assert.equal(canManageBookingSettings(["ADMIN"]), true);
  assert.equal(canManageBookingSettings(["MANAGER", "SALES"]), false);
});

test("Booking Settings: rifiuta intervalli sovrapposti e orari invalidi", async () => {
  await assert.rejects(saveRestaurantBookingSettings(companyId, locationA, { ...baseInput, openingHours: { "1": [["12:00", "15:00"], ["14:30", "18:00"]] } }), /sovrapposti/);
  await assert.rejects(saveRestaurantBookingSettings(companyId, locationA, { ...baseInput, openingHours: { "1": [["25:00", "26:00"]] } }), /Orario non valido/);
  await assert.rejects(saveRestaurantBookingSettings(companyId, locationA, { ...baseInput, openingHours: { "1": [["18:00", "12:00"]] } }), /inizio non precedente/);
});

test("Booking Settings: rifiuta email e valori numerici fuori range", async () => {
  await assert.rejects(saveRestaurantBookingSettings(companyId, locationA, { ...baseInput, internalNotificationEmail: "non-email" }), /email/i);
  for (const invalid of [
    { slotIntervalMinutes: 0 }, { defaultDurationMinutes: 14 }, { minAdvanceMinutes: -1 },
    { maxAdvanceDays: 0 }, { maxCoversPerSlot: -1 },
  ]) await assert.rejects(saveRestaurantBookingSettings(companyId, locationA, { ...baseInput, ...invalid }), RestaurantBookingSettingsError);
  assert.equal(await prisma.restaurantBookingSettings.count({ where: { companyId, locationId: locationA } }), 0);
});

test("Booking Settings: rifiuta HTML nel messaggio", async () => {
  await assert.rejects(saveRestaurantBookingSettings(companyId, locationA, { ...baseInput, confirmationMessage: "<strong>Confermato</strong>" }), /HTML/);
});

test("Booking Settings: getAvailableSlots usa orari, durata e intervallo salvati", async () => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 10);
  date.setUTCHours(0, 0, 0, 0);
  const day = String(date.getUTCDay());
  const openingHours = { "0": [], "1": [], "2": [], "3": [], "4": [], "5": [], "6": [], [day]: [["12:00", "14:00"]] };
  await saveRestaurantBookingSettings(companyId, locationA, { ...baseInput, openingHours, slotIntervalMinutes: 30, defaultDurationMinutes: 60, minAdvanceMinutes: 0, maxAdvanceDays: 30 });
  const slots = await getAvailableSlots(companyId, locationA, { date, partySize: 2 });
  assert.deepEqual(slots.map((slot) => slot.toISOString().slice(11, 16)), ["12:00", "12:30", "13:00"]);
});
