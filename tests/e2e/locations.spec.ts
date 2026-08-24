import "dotenv/config";

import { expect, test } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcrypt";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "../../generated/prisma/client";

const sourceUrl = process.env.DATABASE_URL ?? "";
const databaseUrl = sourceUrl.includes("_test") ? sourceUrl : sourceUrl.replace("nexus_erp", "nexus_erp_test");
if (!databaseUrl.includes("_test")) throw new Error("Gli E2E Locations richiedono un DATABASE_URL _test.");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

test.afterAll(async () => { await prisma.$disconnect(); });

test("Locations: CRUD amministrativo, switcher persistente e accesso negato", async ({ browser, page }) => {
  const company = await prisma.company.findUniqueOrThrow({ where: { vatNumber: "IT00000000000" } });
  const adminMembership = await prisma.membership.findFirstOrThrow({ where: { companyId: company.id, active: true, roles: { some: { role: { code: "SUPER_ADMIN" } } } } });
  const originalLocationId = adminMembership.defaultLocationId;
  if (!originalLocationId) throw new Error("La fixture Locations E2E richiede una default Location autorizzata.");
  const salesRole = await prisma.role.findUniqueOrThrow({ where: { code: "SALES" } });
  const suffix = randomUUID().slice(0, 8).toUpperCase();
  const locationCode = `E2E-LOC-${suffix}`;
  const locationName = `Sede E2E ${suffix}`;
  const limitedEmail = `locations-${suffix.toLowerCase()}@nexuserp.local`;
  let locationId: string | undefined;
  let limitedUserId: string | undefined;

  try {
    await page.goto("/login");
    await page.getByLabel("Email").fill("admin@nexuserp.local");
    await page.getByLabel("Password").fill("Admin123!");
    await page.getByRole("button", { name: "Accedi" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto("/settings/locations");
    await page.getByRole("link", { name: "Nuova sede" }).click();
    await page.getByLabel("Codice").fill(locationCode);
    await page.getByLabel("Nome").fill(locationName);
    await page.getByRole("button", { name: "Crea sede" }).click();
    await expect(page.getByText("Sede salvata")).toBeVisible();
    locationId = (await prisma.location.findFirstOrThrow({ where: { companyId: company.id, code: locationCode }, select: { id: true } })).id;
    expect(await prisma.membershipLocation.count({ where: { companyId: company.id, membershipId: adminMembership.id, locationId: { in: [originalLocationId, locationId] } } })).toBe(2);

    await page.locator('select[name="locationId"]').selectOption(locationId);
    await page.getByRole("button", { name: "Cambia sede" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto("/settings/locations");
    await expect(page.locator('select[name="locationId"]')).toHaveValue(locationId);
    expect((await prisma.membership.findUniqueOrThrow({ where: { id: adminMembership.id } })).defaultLocationId).toBe(locationId);

    const password = await bcrypt.hash("Locations123!", 10);
    const limitedUser = await prisma.user.create({ data: { firstName: "E2E", lastName: "Locations", email: limitedEmail, password } });
    limitedUserId = limitedUser.id;
    const limitedMembership = await prisma.$transaction(async (tx) => {
      const row = await tx.membership.create({ data: { userId: limitedUser.id, companyId: company.id, isDefault: true, defaultLocationId: originalLocationId } });
      if (originalLocationId) await tx.membershipLocation.create({ data: { companyId: company.id, membershipId: row.id, locationId: originalLocationId } });
      await tx.membershipRole.create({ data: { membershipId: row.id, roleId: salesRole.id } });
      return row;
    });

    const persisted = await prisma.membership.findUniqueOrThrow({ where: { id: limitedMembership.id }, include: { authorizedLocations: true } });
    expect(persisted.active).toBe(true);
    expect(persisted.defaultLocationId).toBe(originalLocationId);
    expect(persisted.authorizedLocations.map((row) => row.locationId)).toEqual([originalLocationId]);

    const limitedContext = await browser.newContext();
    try {
      const limitedPage = await limitedContext.newPage();
      await limitedPage.goto("/login");
      await limitedPage.getByLabel("Email").fill(limitedEmail);
      await limitedPage.getByLabel("Password").fill("Locations123!");
      await limitedPage.getByRole("button", { name: "Accedi" }).click();
      await expect(limitedPage).toHaveURL(/\/dashboard/);
      const locationSelect = limitedPage.locator('select[name="locationId"]');
      await expect(locationSelect).toHaveValue(originalLocationId ?? "");
      await expect(locationSelect.locator("option")).toHaveCount(1);
      await expect(locationSelect.locator(`option[value="${locationId}"]`)).toHaveCount(0);
      const denied = await limitedContext.request.get("/settings/locations", { maxRedirects: 0 });
      expect(denied.status()).toBe(307);
      expect(denied.headers().location).toBe("/dashboard");
    } finally {
      await limitedContext.close();
    }
  } finally {
    await prisma.membership.update({ where: { id: adminMembership.id }, data: { defaultLocationId: originalLocationId } });
    if (locationId) await prisma.auditLog.deleteMany({ where: { companyId: company.id, locationId } });
    if (locationId) await prisma.location.deleteMany({ where: { id: locationId, companyId: company.id } });
    if (limitedUserId) await prisma.auditLog.deleteMany({ where: { companyId: company.id, userId: limitedUserId } });
    if (limitedUserId) await prisma.user.delete({ where: { id: limitedUserId } });
  }
});
