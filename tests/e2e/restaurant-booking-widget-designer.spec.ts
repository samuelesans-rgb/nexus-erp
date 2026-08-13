import { expect, test } from "@playwright/test";
import bcrypt from "bcrypt";
import { randomUUID } from "node:crypto";

import { prisma } from "../../lib/prisma";

if (!(process.env.DATABASE_URL ?? "").includes("_test")) throw new Error("L’E2E Widget Designer richiede DATABASE_URL _test.");

test.afterAll(async () => { await prisma.$disconnect(); });

test("Widget Designer: configurazione, preview responsive e snippet", async ({ page, context }) => {
  const company = await prisma.company.findUniqueOrThrow({ where: { vatNumber: "IT00000000000" } });
  const suffix = randomUUID().slice(0, 8).toUpperCase();
  const staffEmail = "widget-staff-" + suffix.toLowerCase() + "@example.test";
  const staffPassword = "WidgetE2E123!";
  const existingRole = await prisma.role.findUnique({ where: { code: "SUPER_ADMIN" } });
  const role = existingRole ?? await prisma.role.create({ data: { code: "SUPER_ADMIN", name: "Super Admin", system: true } });
  const existingDefinition = await prisma.moduleDefinition.findUnique({ where: { code: "RESTAURANT_FLOOR" } });
  const definition = existingDefinition ?? await prisma.moduleDefinition.create({ data: { code: "RESTAURANT_FLOOR", name: "Restaurant Floor", category: "RESTAURANT", status: "AVAILABLE" } });
  const existingActivation = await prisma.companyModule.findUnique({ where: { companyId_moduleDefinitionId: { companyId: company.id, moduleDefinitionId: definition.id } } });
  if (existingActivation) await prisma.companyModule.update({ where: { id: existingActivation.id }, data: { enabled: true, enabledAt: new Date(), disabledAt: null } });
  else await prisma.companyModule.create({ data: { companyId: company.id, moduleDefinitionId: definition.id, enabled: true, enabledAt: new Date() } });
  const existingLocationDefinition = await prisma.moduleDefinition.findUnique({ where: { code: "CORE_LOCATIONS" } });
  const locationDefinition = existingLocationDefinition ?? await prisma.moduleDefinition.create({ data: { code: "CORE_LOCATIONS", name: "Locations", category: "CORE", status: "AVAILABLE" } });
  const existingLocationActivation = await prisma.companyModule.findUnique({ where: { companyId_moduleDefinitionId: { companyId: company.id, moduleDefinitionId: locationDefinition.id } } });
  if (existingLocationActivation) await prisma.companyModule.update({ where: { id: existingLocationActivation.id }, data: { enabled: true, enabledAt: new Date(), disabledAt: null } });
  else await prisma.companyModule.create({ data: { companyId: company.id, moduleDefinitionId: locationDefinition.id, enabled: true, enabledAt: new Date() } });
  const existingReservationDefinition = await prisma.moduleDefinition.findUnique({ where: { code: "RESTAURANT_RESERVATIONS" } });
  const reservationDefinition = existingReservationDefinition ?? await prisma.moduleDefinition.create({ data: { code: "RESTAURANT_RESERVATIONS", name: "Restaurant Reservations", category: "RESTAURANT", status: "AVAILABLE" } });
  const existingReservationActivation = await prisma.companyModule.findUnique({ where: { companyId_moduleDefinitionId: { companyId: company.id, moduleDefinitionId: reservationDefinition.id } } });
  if (existingReservationActivation) await prisma.companyModule.update({ where: { id: existingReservationActivation.id }, data: { enabled: true, enabledAt: new Date(), disabledAt: null } });
  else await prisma.companyModule.create({ data: { companyId: company.id, moduleDefinitionId: reservationDefinition.id, enabled: true, enabledAt: new Date() } });
  const user = await prisma.user.create({ data: { firstName: "Widget", lastName: "E2E", email: staffEmail, password: await bcrypt.hash(staffPassword, 10) } });
  const location = await prisma.location.create({ data: { companyId: company.id, slug: `widget-e2e-${suffix.toLowerCase()}`, code: `WE-${suffix}`, name: `Widget E2E ${suffix}` } });
  const area = await prisma.restaurantArea.create({ data: { companyId: company.id, locationId: location.id, code: `WE-${suffix}`, name: "Sala E2E" } });
  const table = await prisma.restaurantTable.create({ data: { companyId: company.id, locationId: location.id, areaId: area.id, code: `WE-1-${suffix}`, name: "Tavolo E2E", seats: 4, minSeats: 1, maxSeats: 4 } });
  await prisma.restaurantBookingSettings.create({ data: { companyId: company.id, locationId: location.id, enabled: true, minAdvanceMinutes: 0, maxAdvanceDays: 365, openingHours: {}, confirmationMessage: "Prenotazione ricevuta." } });
  const membership = await prisma.membership.create({ data: { companyId: company.id, userId: user.id, active: true, isDefault: true, defaultLocationId: location.id, roles: { create: { roleId: role.id } } } });
  const locationId = location.id;
  const widget = await prisma.restaurantBookingWidget.create({ data: { companyId: company.id, locationId, enabled: true, publicKey: `nw_${randomUUID().replaceAll("-", "")}`, allowedDomains: [], mode: "INLINE" } });
  const reservationsBefore = await prisma.restaurantReservation.count({ where: { companyId: company.id, locationId } });

  try {
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:3100" });
    await page.goto("/login");
    await page.getByLabel("Email").fill(staffEmail);
    await page.getByLabel("Password").fill(staffPassword);
    await page.getByRole("button", { name: "Accedi" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto("/restaurant/widget");
    await expect(page.getByRole("heading", { name: "Widget prenotazioni" })).toBeVisible();
    await page.getByLabel("Modalità").selectOption("INLINE");
    await page.getByLabel("Colore primario").fill("#123456");
    await page.getByLabel("Colore sfondo").fill("#f1f5f9");
    await page.getByLabel("Colore testo").fill("#1e293b");
    await page.getByLabel("Titolo").fill("Prenota dal Designer E2E");
    await page.getByLabel("Etichetta pulsante").fill("Prenota E2E");
    await page.getByRole("button", { name: "Salva configurazione" }).click();
    await expect(page.getByText("Widget salvato")).toBeVisible();

    await expect(page.getByText("Modalità anteprima · INLINE")).toBeVisible();
    await expect(page.frameLocator('iframe[title="Preview widget desktop"]').getByText(/Modalità anteprima/)).toBeVisible();
    await page.getByRole("button", { name: "Desktop" }).click();
    await expect(page.locator('[data-preview-device="desktop"]')).toBeVisible();
    await page.getByRole("button", { name: "Mobile" }).click();
    await expect(page.locator('[data-preview-device="mobile"]')).toBeVisible();

    await page.getByRole("button", { name: "Copia snippet" }).click();
    await expect(page.getByText("Snippet copiato")).toBeVisible();
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toContain(`data-nexus-booking="${widget.publicKey}"`);
    expect(clipboard).toContain('data-mode="INLINE"');

    await page.getByLabel("Modalità").selectOption("MODAL");
    await page.getByLabel("Domini consentiti").fill("widget-host.test\n127.0.0.1");
    await page.getByRole("button", { name: "Salva configurazione" }).click();
    await expect(page.getByText("Modalità anteprima · MODAL")).toBeVisible();
    await expect(page.locator("code").filter({ hasText: 'data-mode="MODAL"' }).first()).toBeVisible();
    expect(await prisma.restaurantReservation.count({ where: { companyId: company.id, locationId } })).toBe(reservationsBefore);
    const host = "https://widget-host.test";
    const evilHost = "https://widget-denied.test";
    const erpHost = "https://erp-widget.test";
    const snippet = (key: string, allModes = false) => allModes
      ? `<script async src="https://erp-widget.test/widget/v1/widget.js" data-nexus-booking="${key}" data-mode="INLINE" data-title="Widget inline"></script><script async src="https://erp-widget.test/widget/v1/widget.js" data-nexus-booking="${key}" data-mode="MODAL"></script><script async src="https://erp-widget.test/widget/v1/widget.js" data-nexus-booking="${key}" data-mode="FLOATING_BUTTON"></script>`
      : `<script async src="https://erp-widget.test/widget/v1/widget.js" data-nexus-booking="${key}" data-mode="INLINE"></script>`;
    await page.route(`${erpHost}/**`, async (route) => {
      const requested = new URL(route.request().url());
      const headers = route.request().headers();
      if (headers.origin === erpHost) headers.origin = "http://127.0.0.1:3100";
      headers.host = "127.0.0.1:3100";
      const response = await route.fetch({ url: `http://127.0.0.1:3100${requested.pathname}${requested.search}`, headers });
      return route.fulfill({ response });
    });
    await page.route(`${host}/**`, (route) => {
      const key = new URL(route.request().url()).pathname.includes("invalid") ? "nw_invalid" : widget.publicKey;
      return route.fulfill({ contentType: "text/html", body: `<!doctype html><body>${snippet(key, key === widget.publicKey)}</body>` });
    });
    await page.route(`${evilHost}/**`, (route) => route.fulfill({ contentType: "text/html", body: `<!doctype html><body>${snippet(widget.publicKey)}</body>` }));
    await page.goto(`${host}/booking`);
    const frame = page.frameLocator('iframe[title="Widget inline"]');
    await expect(frame.locator("h1")).toHaveText("Prenota dal Designer E2E");
    const bookingDate = new Date();
    bookingDate.setDate(bookingDate.getDate() + 30);
    const dateValue = bookingDate.toISOString().slice(0, 10);
    await frame.locator("#date").fill(dateValue);
    await frame.locator("#party").fill("2");
    await frame.getByRole("button", { name: "Cerca disponibilità" }).click();
    await frame.locator(".slot").first().click();
    await frame.getByLabel("Nome e cognome").fill(`Cliente Widget ${suffix}`);
    await frame.getByLabel("Telefono").fill("+390212345678");
    await frame.getByLabel("Email").fill(`widget-e2e-${suffix.toLowerCase()}@example.test`);
    await frame.getByRole("checkbox").check();
    await frame.getByRole("button", { name: "Prenota E2E" }).click();
    await expect(frame.locator(".status")).toContainText("Prenotazione ricevuta.");
    const confirmation = await frame.locator(".status").textContent();
    const code = confirmation?.match(/RES-[A-F0-9]+/)?.[0];
    expect(code).toBeTruthy();
    await expect.poll(() => prisma.restaurantReservation.count({ where: { companyId: company.id, locationId, code } })).toBe(1);

    await expect(page.getByRole("button", { name: "Prenota E2E" })).toHaveCount(2);
    const launcher = page.getByRole("button", { name: "Prenota E2E" }).first();
    await launcher.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(launcher).toBeFocused();
    for (const width of [320, 375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      const floating = await page.getByRole("button", { name: "Prenota E2E" }).last().boundingBox();
      expect(floating).not.toBeNull();
      expect(floating!.x + floating!.width).toBeLessThanOrEqual(width);
    }

    const duplicateDate = new Date(bookingDate);
    duplicateDate.setDate(duplicateDate.getDate() + 1);
    const duplicateEmail = `widget-double-${suffix.toLowerCase()}@example.test`;
    const duplicate = await page.evaluate(async ({ key, date, email }) => {
      const api = `https://erp-widget.test/api/widget/v1/${encodeURIComponent(key)}`;
      const availability = await fetch(`${api}/availability?date=${date}&partySize=2`).then((response) => response.json());
      const payload = { idempotencyKey: crypto.randomUUID(), startTime: availability.slots[0], partySize: 2, guestName: "Double Submit", phone: "+390212345679", email, privacyConsent: true };
      const send = () => fetch(`${api}/reservation`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }).then((response) => response.json());
      return [await send(), await send()];
    }, { key: widget.publicKey, date: duplicateDate.toISOString().slice(0, 10), email: duplicateEmail });
    expect(duplicate[0].code).toMatch(/^RES-/);
    expect(duplicate[0].code).toBe(duplicate[1].code);
    await expect.poll(() => prisma.restaurantReservation.count({ where: { companyId: company.id, locationId, email: duplicateEmail } })).toBe(1);

    await page.goto(`http://127.0.0.1:3100/restaurant/reservations?date=${dateValue}&q=${code}`);
    await expect(page.getByText(code!, { exact: false })).toBeVisible();

    await page.goto(`${evilHost}/denied`);
    await expect(page.getByRole("alert")).toContainText("non è disponibile");
    await page.goto(`${host}/invalid`);
    await expect(page.getByRole("alert")).toContainText("non è disponibile");
    await prisma.restaurantBookingWidget.update({ where: { id: widget.id }, data: { enabled: false } });
    await page.goto(`${host}/disabled`);
    await expect(page.getByRole("alert").first()).toContainText("non è disponibile");
    await prisma.restaurantBookingWidget.update({ where: { id: widget.id }, data: { enabled: true } });
  } finally {
    const reservations = await prisma.restaurantReservation.findMany({ where: { companyId: company.id, locationId }, select: { id: true } });
    const reservationIds = reservations.map(({ id }) => id);
    await prisma.domainEvent.deleteMany({ where: { companyId: company.id, aggregateType: "RestaurantReservation", aggregateId: { in: reservationIds } } });
    await prisma.restaurantReservationTable.deleteMany({ where: { companyId: company.id, reservationId: { in: reservationIds } } });
    await prisma.restaurantReservation.deleteMany({ where: { companyId: company.id, id: { in: reservationIds } } });
    await prisma.idempotencyRecord.deleteMany({ where: { companyId: company.id, aggregateId: { in: reservationIds } } });
    await prisma.restaurantBookingWidget.deleteMany({ where: { id: widget.id, companyId: company.id } });
    await prisma.restaurantBookingSettings.deleteMany({ where: { companyId: company.id, locationId } });
    await prisma.restaurantTable.deleteMany({ where: { id: table.id, companyId: company.id } });
    await prisma.restaurantArea.deleteMany({ where: { id: area.id, companyId: company.id } });
    await prisma.membershipRole.deleteMany({ where: { membershipId: membership.id } });
    await prisma.membership.delete({ where: { id: membership.id } });
    await prisma.location.delete({ where: { id: location.id } });
    await prisma.user.delete({ where: { id: user.id } });
    if (existingReservationActivation) await prisma.companyModule.update({ where: { id: existingReservationActivation.id }, data: { enabled: existingReservationActivation.enabled, enabledAt: existingReservationActivation.enabledAt, disabledAt: existingReservationActivation.disabledAt } });
    else await prisma.companyModule.delete({ where: { companyId_moduleDefinitionId: { companyId: company.id, moduleDefinitionId: reservationDefinition.id } } });
    if (!existingReservationDefinition) await prisma.moduleDefinition.delete({ where: { id: reservationDefinition.id } });
    if (existingLocationActivation) await prisma.companyModule.update({ where: { id: existingLocationActivation.id }, data: { enabled: existingLocationActivation.enabled, enabledAt: existingLocationActivation.enabledAt, disabledAt: existingLocationActivation.disabledAt } });
    else await prisma.companyModule.delete({ where: { companyId_moduleDefinitionId: { companyId: company.id, moduleDefinitionId: locationDefinition.id } } });
    if (!existingLocationDefinition) await prisma.moduleDefinition.delete({ where: { id: locationDefinition.id } });
    if (existingActivation) await prisma.companyModule.update({ where: { id: existingActivation.id }, data: { enabled: existingActivation.enabled, enabledAt: existingActivation.enabledAt, disabledAt: existingActivation.disabledAt } });
    else await prisma.companyModule.delete({ where: { companyId_moduleDefinitionId: { companyId: company.id, moduleDefinitionId: definition.id } } });
    if (!existingDefinition) await prisma.moduleDefinition.delete({ where: { id: definition.id } });
    if (!existingRole) await prisma.role.delete({ where: { id: role.id } });
  }
});
