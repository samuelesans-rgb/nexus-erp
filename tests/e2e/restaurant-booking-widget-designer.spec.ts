import { expect, test } from "@playwright/test";

import { prisma } from "../../lib/prisma";

if (!(process.env.DATABASE_URL ?? "").includes("_test")) throw new Error("L’E2E Widget Designer richiede DATABASE_URL _test.");

test.afterAll(async () => { await prisma.$disconnect(); });

test("Widget Designer: configurazione, preview responsive e snippet", async ({ page, context }) => {
  const company = await prisma.company.findUniqueOrThrow({ where: { vatNumber: "IT00000000000" } });
  const membership = await prisma.membership.findFirstOrThrow({ where: { companyId: company.id, active: true, user: { email: "admin@nexuserp.local" } }, select: { defaultLocationId: true } });
  const locationId = membership.defaultLocationId!;
  const original = await prisma.restaurantBookingWidget.findFirst({ where: { companyId: company.id, locationId } });
  const widget = original ?? await prisma.restaurantBookingWidget.create({ data: { companyId: company.id, locationId, enabled: true, publicKey: `nw_${crypto.randomUUID().replaceAll("-", "")}`, allowedDomains: [], mode: "INLINE" } });
  const reservationsBefore = await prisma.restaurantReservation.count({ where: { companyId: company.id, locationId } });

  try {
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:3100" });
    await page.goto("/login");
    await page.getByLabel("Email").fill("admin@nexuserp.local");
    await page.getByLabel("Password").fill("Admin123!");
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
    await page.getByRole("button", { name: "Salva configurazione" }).click();
    await expect(page.getByText("Modalità anteprima · MODAL")).toBeVisible();
    await expect(page.locator("code").filter({ hasText: 'data-mode="MODAL"' }).first()).toBeVisible();
    expect(await prisma.restaurantReservation.count({ where: { companyId: company.id, locationId } })).toBe(reservationsBefore);
  } finally {
    if (!original) await prisma.restaurantBookingWidget.deleteMany({ where: { id: widget.id, companyId: company.id } });
    else await prisma.restaurantBookingWidget.update({ where: { id: original.id }, data: {
      enabled: original.enabled, publicKey: original.publicKey, allowedDomains: original.allowedDomains, mode: original.mode, theme: original.theme,
      logoUrl: original.logoUrl, primaryColor: original.primaryColor, secondaryColor: original.secondaryColor, accentColor: original.accentColor,
      backgroundColor: original.backgroundColor, textColor: original.textColor, borderRadius: original.borderRadius, fontFamily: original.fontFamily,
      buttonLabel: original.buttonLabel, heading: original.heading, description: original.description, privacyUrl: original.privacyUrl,
      successMessage: original.successMessage, requirePhone: original.requirePhone, requireEmail: original.requireEmail, showNotes: original.showNotes, locale: original.locale,
    } });
  }
});
