import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { GET as renderEmbed } from "../../app/embed/booking/[publicKey]/route";
import { GET as renderLoader } from "../../app/widget/v1/widget.js/route";
import { prisma } from "../../lib/prisma";
import { buildWidgetSnippet, getWidgetAdminConfig, regenerateWidgetPublicKey, saveWidgetAdminConfig, WIDGET_MODES } from "../../lib/restaurant-booking-widget";

if (!(process.env.DATABASE_URL ?? "").includes("_test")) throw new Error("I test Widget Designer richiedono DATABASE_URL _test.");

const suffix = randomUUID().slice(0, 8).toUpperCase();
let companyId = "";
let locationId = "";
let publicKey = "";

function settings(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true, allowedDomains: ["example.test"], mode: "INLINE", theme: "LIGHT", logoUrl: "https://example.test/logo.png",
    primaryColor: "#112233", secondaryColor: "#ffffff", accentColor: "#00aa77", backgroundColor: "#f8fafc", textColor: "#172033",
    borderRadius: 14, fontFamily: "system-ui", buttonLabel: "Prenota", heading: "Prenota il tuo tavolo", description: "Descrizione designer",
    privacyUrl: "https://example.test/privacy", successMessage: "Richiesta ricevuta", requirePhone: true, requireEmail: true, showNotes: true, locale: "it-IT",
    ...overrides,
  };
}

before(async () => {
  const company = await prisma.company.findUniqueOrThrow({ where: { vatNumber: "IT00000000000" } });
  const location = await prisma.location.create({ data: { companyId: company.id, slug: `designer-${suffix.toLowerCase()}`, code: `DES-${suffix}`, name: "Widget Designer" } });
  await prisma.restaurantBookingSettings.create({ data: { companyId: company.id, locationId: location.id, enabled: true, minAdvanceMinutes: 0, maxAdvanceDays: 365 } });
  companyId = company.id; locationId = location.id;
  publicKey = (await saveWidgetAdminConfig(companyId, locationId, settings())).publicKey;
});

after(async () => {
  await prisma.restaurantBookingWidget.deleteMany({ where: { companyId, locationId } });
  await prisma.restaurantBookingSettings.deleteMany({ where: { companyId, locationId } });
  await prisma.location.deleteMany({ where: { id: locationId, companyId } });
  await prisma.$disconnect();
});

test("Widget Designer: salva tema e campi visuali", async () => {
  const saved = await saveWidgetAdminConfig(companyId, locationId, settings({ theme: "DARK", backgroundColor: "#101827", textColor: "#f8fafc", fontFamily: "Georgia" }));
  assert.equal(saved.theme, "DARK"); assert.equal(saved.backgroundColor, "#101827"); assert.equal(saved.textColor, "#f8fafc"); assert.equal(saved.fontFamily, "Georgia");
});

test("Widget Designer: rifiuta colori non hex", async () => {
  await assert.rejects(saveWidgetAdminConfig(companyId, locationId, settings({ primaryColor: "red" })), /Colore non valido/);
});

test("Widget Designer: rifiuta font fuori allowlist", async () => {
  await assert.rejects(saveWidgetAdminConfig(companyId, locationId, settings({ fontFamily: "Comic Sans MS" })), /Font non ammesso/);
});

test("Widget Designer: rifiuta URL privacy non HTTP", async () => {
  await assert.rejects(saveWidgetAdminConfig(companyId, locationId, settings({ privacyUrl: "javascript:alert(1)" })), /URL non valido/);
});

test("Widget Designer: normalizza i domini", async () => {
  await saveWidgetAdminConfig(companyId, locationId, settings({ allowedDomains: ["HTTPS://Sub.Example.TEST", "example.test"] }));
  const stored = await getWidgetAdminConfig(companyId, locationId);
  assert.deepEqual(stored?.allowedDomains, ["sub.example.test", "example.test"]);
});

test("Widget Designer: supporta tutte le modalità", async () => {
  for (const mode of WIDGET_MODES) assert.equal((await saveWidgetAdminConfig(companyId, locationId, settings({ mode }))).mode, mode);
});

test("Widget Designer: rigenerazione chiave aggiorna lo snippet", async () => {
  const before = buildWidgetSnippet("https://erp.example.test", publicKey, "INLINE");
  await regenerateWidgetPublicKey(companyId, locationId);
  const stored = await getWidgetAdminConfig(companyId, locationId);
  assert.ok(stored); publicKey = stored.publicKey;
  const afterSnippet = buildWidgetSnippet("https://erp.example.test", publicKey, stored.mode);
  assert.notEqual(afterSnippet, before); assert.match(afterSnippet, /data-mode="FLOATING_BUTTON"/);
});

test("Widget Designer: loader v1 è framework-free, async-safe e cache controllata", async () => {
  const response = renderLoader();
  const source = await response.text();
  assert.match(source, /document\.currentScript/);
  assert.match(source, /script\[data-nexus-booking\]/);
  assert.match(source, /AbortController/);
  assert.match(source, /role","alert/);
  assert.doesNotThrow(() => new Function(source));
  assert.equal(response.headers.get("cache-control"), "public, max-age=300, stale-while-revalidate=3600");
});

test("Widget Designer: preview non crea prenotazioni", async () => {
  const before = await prisma.restaurantReservation.count({ where: { companyId, locationId } });
  const response = await renderEmbed(new Request(`http://localhost:3000/embed/booking/${publicKey}?preview=1`), { params: Promise.resolve({ publicKey }) });
  assert.equal(response.status, 200); assert.match(await response.text(), /Modalità anteprima/);
  assert.equal(await prisma.restaurantReservation.count({ where: { companyId, locationId } }), before);
});
