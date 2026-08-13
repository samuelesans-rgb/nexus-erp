import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, test } from "node:test";
import { prisma } from "../../lib/prisma";
import { RestaurantProductionSetupError, setupRestaurantProduction } from "../../lib/restaurant-production-setup";

if (!(process.env.DATABASE_URL ?? "").includes("_test")) throw new Error("I test Restaurant Production Setup richiedono DATABASE_URL _test.");
const suffix = randomUUID().slice(0, 8); const vat = `ITSETUP${suffix.toUpperCase()}`; const slug = `restaurant-setup-${suffix}`;
let companyId = ""; let otherCompanyId = ""; let locationId = ""; let foreignLocationId = ""; let userId = ""; let membershipId = "";
const environment: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "test", RESTAURANT_SETUP_ALLOW_TEST_MODE: "true" };
const config = {
  company: { vatNumber: vat }, location: { slug },
  areas: [{ code: "sala", name: "Sala", description: "Interna", sortOrder: 1, active: true }, { code: "esterno", name: "Esterno", sortOrder: 2 }],
  tables: [{ areaCode: "sala", code: "t1", name: "Tavolo 1", seats: 4, minSeats: 2, maxSeats: 6, active: true }, { areaCode: "esterno", code: "t2", name: "Tavolo 2", seats: 2, status: "AVAILABLE" as const }],
  bookingSettings: { bookingEnabled: true, weeklyOpeningHours: { "0": [], "1": [["12:00", "14:00"]] as [string, string][], "2": [], "3": [], "4": [], "5": [], "6": [] }, slotIntervalMinutes: 30, defaultDurationMinutes: 120, minimumAdvanceMinutes: 60, maximumAdvanceDays: 90, maxCoversPerSlot: 40, internalNotificationEmail: "booking@example.test", confirmationMessage: "Richiesta ricevuta." },
};
async function clearRestaurant() { await prisma.restaurantBookingSettings.deleteMany({ where: { locationId } }); await prisma.restaurantTable.deleteMany({ where: { locationId } }); await prisma.restaurantArea.deleteMany({ where: { locationId } }); }
before(async () => {
  const company = await prisma.company.create({ data: { name: `Setup ${suffix}`, vatNumber: vat } }); const other = await prisma.company.create({ data: { name: `Other ${suffix}`, vatNumber: `ITOTHER${suffix.toUpperCase()}` } });
  const user = await prisma.user.create({ data: { email: `setup-${suffix}@example.test`, firstName: "Setup", lastName: "Test", password: "test-hash" } });
  const [location, foreign] = await Promise.all([prisma.location.create({ data: { companyId: company.id, slug, code: `S-${suffix}`, name: "Setup Location", isHeadquarters: true } }), prisma.location.create({ data: { companyId: other.id, slug: `foreign-${suffix}`, code: `F-${suffix}`, name: "Foreign" } })]);
  const membership = await prisma.membership.create({ data: { companyId: company.id, userId: user.id, active: true, isDefault: true, defaultLocationId: location.id } });
  companyId = company.id; otherCompanyId = other.id; locationId = location.id; foreignLocationId = foreign.id; userId = user.id; membershipId = membership.id;
});
beforeEach(clearRestaurant);
after(async () => { await clearRestaurant(); await prisma.membership.delete({ where: { id: membershipId } }); await prisma.location.deleteMany({ where: { id: { in: [locationId, foreignLocationId] } } }); await prisma.user.delete({ where: { id: userId } }); await prisma.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId] } } }); await prisma.$disconnect(); });
const run = (value: unknown = config, options = {}) => setupRestaurantProduction(prisma, value, environment, { allowTestMode: true, ...options });

test("1. setup iniziale completa la configurazione", async () => { const result = await run(); assert.equal(result.dryRun, false); assert.equal(result.actions.length, 5); });
test("2. crea le aree con i campi reali", async () => { await run(); const rows = await prisma.restaurantArea.findMany({ where: { companyId, locationId }, orderBy: { code: "asc" } }); assert.deepEqual(rows.map(({ code, name, sortOrder }) => ({ code, name, sortOrder })), [{ code: "ESTERNO", name: "Esterno", sortOrder: 2 }, { code: "SALA", name: "Sala", sortOrder: 1 }]); });
test("3. crea i tavoli e li collega alle aree", async () => { await run(); const row = await prisma.restaurantTable.findFirstOrThrow({ where: { companyId, locationId, code: "T1" }, include: { area: true } }); assert.deepEqual({ area: row.area.code, seats: row.seats, min: row.minSeats, max: row.maxSeats }, { area: "SALA", seats: 4, min: 2, max: 6 }); });
test("4. crea una sola Booking Settings", async () => { await run(); const row = await prisma.restaurantBookingSettings.findUniqueOrThrow({ where: { companyId_locationId: { companyId, locationId } } }); assert.equal(row.enabled, true); assert.equal(row.maxCoversPerSlot, 40); });
test("5. seconda esecuzione è idempotente", async () => { await run(); const before = await prisma.restaurantArea.findMany({ where: { locationId }, select: { id: true, updatedAt: true } }); const result = await run(); const afterRows = await prisma.restaurantArea.findMany({ where: { locationId }, select: { id: true, updatedAt: true } }); assert.deepEqual(result.actions.map((value) => value.action), ["unchanged", "unchanged", "unchanged", "unchanged", "unchanged"]); assert.deepEqual(afterRows, before); assert.deepEqual(await Promise.all([prisma.restaurantArea.count({ where: { locationId } }), prisma.restaurantTable.count({ where: { locationId } }), prisma.restaurantBookingSettings.count({ where: { locationId } })]), [2, 2, 1]); });
test("6. configurazione invalida non scrive", async () => { await assert.rejects(run({ ...config, tables: [{ ...config.tables[0], areaCode: "MISSING" }] }), RestaurantProductionSetupError); assert.deepEqual(await Promise.all([prisma.restaurantArea.count({ where: { locationId } }), prisma.restaurantTable.count({ where: { locationId } })]), [0, 0]); });
test("7. Location inesistente non scrive", async () => { await assert.rejects(run({ ...config, location: { slug: `missing-${suffix}` } }), /Location non trovata/); assert.equal(await prisma.restaurantArea.count({ where: { companyId } }), 0); });
test("8. errore transazionale esegue rollback completo", async () => { await assert.rejects(run(config, { failAfter: "areas" }), /simulato/); assert.deepEqual(await Promise.all([prisma.restaurantArea.count({ where: { locationId } }), prisma.restaurantTable.count({ where: { locationId } }), prisma.restaurantBookingSettings.count({ where: { locationId } })]), [0, 0, 0]); });
test("9. non crea dati demo o Widget", async () => { await run(); assert.deepEqual(await Promise.all([prisma.partner.count({ where: { companyId } }), prisma.item.count({ where: { companyId } }), prisma.restaurantReservation.count({ where: { companyId } }), prisma.restaurantOrder.count({ where: { companyId } }), prisma.restaurantBookingWidget.count({ where: { companyId } })]), [0, 0, 0, 0, 0]); });
test("10. non modifica Company, User o Membership e dry-run non scrive", async () => { const beforeRows = await Promise.all([prisma.company.findUnique({ where: { id: companyId } }), prisma.user.findUnique({ where: { id: userId } }), prisma.membership.findUnique({ where: { id: membershipId } })]); const result = await run(config, { dryRun: true }); const afterRows = await Promise.all([prisma.company.findUnique({ where: { id: companyId } }), prisma.user.findUnique({ where: { id: userId } }), prisma.membership.findUnique({ where: { id: membershipId } })]); assert.equal(result.dryRun, true); assert.deepEqual(afterRows, beforeRows); assert.equal(await prisma.restaurantArea.count({ where: { locationId } }), 0); });
test("11. rifiuta una Location appartenente a un'altra Company", async () => { await assert.rejects(run({ ...config, location: { slug: `foreign-${suffix}` } }), /altra Company/); assert.equal(await prisma.restaurantArea.count({ where: { locationId: foreignLocationId } }), 0); });
test("12. preserva i dati Restaurant esistenti assenti dalla configurazione", async () => {
  const area = await prisma.restaurantArea.create({ data: { companyId, locationId, code: "EXTRA", name: "Area esistente" } });
  const table = await prisma.restaurantTable.create({ data: { companyId, locationId, areaId: area.id, code: "EXTRA-1", name: "Tavolo esistente", seats: 4 } });
  await run();
  assert.ok(await prisma.restaurantArea.findUnique({ where: { id: area.id } }));
  assert.ok(await prisma.restaurantTable.findUnique({ where: { id: table.id } }));
});
