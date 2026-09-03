import "dotenv/config";

import { expect, test } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL ?? "";
if (!databaseUrl.includes("_test")) throw new Error("Menu Manager E2E requires a _test database.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
const categories = ["COLAZIONE E CAFFETTERIA", "PASTICCERIA", "ROSTICCERIA", "ANTIPASTI", "FRISE", "PRIMI", "SECONDI", "FRITTI", "CONTORNI E INSALATE", "DOLCI", "BEVANDE", "BIRRE", "VINI", "DRINK E APERITIVI", "DEGUSTAZIONI"];

test.afterAll(() => prisma.$disconnect());

test("Menu Manager: gestione Nexus, campi FUSION ed esperienza responsive", async ({ page }) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: "admin@nexuserp.local" } });
  const membership = await prisma.membership.findFirstOrThrow({ where: { userId: user.id, active: true }, include: { authorizedLocations: true } });
  const locationId = membership.defaultLocationId ?? membership.authorizedLocations[0]?.locationId;
  if (!locationId) throw new Error("La fixture E2E richiede una sede autorizzata.");
  const suffix = Date.now().toString(36);
  const menu = await prisma.restaurantMenu.create({ data: { companyId: membership.companyId, locationId, code: `E2E_MENU_${suffix}`, name: "Frisà Bistrò" } });
  const sectionIds: string[] = [];
  const itemIds: string[] = [];
  try {
    for (const [sortOrder, name] of categories.entries()) sectionIds.push((await prisma.restaurantMenuSection.create({ data: { companyId: membership.companyId, menuId: menu.id, name, sortOrder } })).id);
    const fixtures = [{ plu: 179, name: "TARTARE DI MANZO", price: 22 }, { plu: 142, name: "FILETTO DI ORATA", price: 24 }, { plu: 900, name: "PLU 900", price: 1 }, { plu: 901, name: "MENU", price: 12 }, { plu: 902, name: "ZERO", price: 0 }, { plu: 19, name: "TORRETTA", price: 4 }];
    for (const [index, fixture] of fixtures.entries()) {
      const item = await prisma.item.create({ data: { companyId: membership.companyId, code: `E2E_FUSION_${suffix}_${fixture.plu}`, name: fixture.name, type: "PRODUCT", salePrice: fixture.price } });
      itemIds.push(item.id);
      await prisma.fusionCatalogMapping.create({ data: { companyId: membership.companyId, locationId, itemId: item.id, plu: fixture.plu, synchronizedName: fixture.name, priceCents: fixture.price * 100, fingerprint: `${suffix}-${fixture.plu}` } });
      if (index < 2) await prisma.restaurantMenuItem.create({ data: { companyId: membership.companyId, menuSectionId: sectionIds[0], itemId: item.id, sortOrder: index } });
    }

    await page.goto("/login");
    await page.getByLabel("Email").fill("admin@nexuserp.local");
    await page.getByLabel("Password").fill("Admin123!");
    await page.getByRole("button", { name: "Accedi" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto(`/restaurant/menus/${menu.id}`);

    await expect(page.getByRole("heading", { name: "Frisà Bistrò" })).toBeVisible();
    await expect(page.getByText("2 prodotti attualmente configurati")).toBeVisible();
    await expect(page.getByText("Sincronizzato da FUSION").first()).toBeVisible();
    await expect(page.getByText("PLU 179")).toBeVisible();
    await page.getByPlaceholder("Cerca nome o PLU…").fill("179");
    await expect(page.getByRole("heading", { name: "TARTARE DI MANZO" })).toBeVisible();
    await page.getByPlaceholder("Cerca nome o PLU…").fill("");

    await page.getByRole("button", { name: "Visibile", exact: true }).first().click();
    await expect(page.getByRole("status")).toHaveText("Salvato");
    await page.getByRole("button", { name: "Nascosti", exact: true }).click();
    await expect(page.getByRole("button", { name: "Nascosto", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Tutti", exact: true }).click();
    await page.getByRole("button", { name: "Disponibile", exact: true }).first().click();
    await expect(page.getByRole("button", { name: "Non disponibile", exact: true })).toBeVisible();
    await page.getByLabel("Categoria di TARTARE DI MANZO").selectOption({ label: "SECONDI" });
    await page.getByRole("button", { name: /^SECONDI \d+ prodotti/ }).click();
    await expect(page.getByRole("heading", { name: "TARTARE DI MANZO" })).toBeVisible();

    await page.getByRole("button", { name: /Esclusi dal menu/ }).click();
    for (const reason of ["PLACEHOLDER_PLU", "TECHNICAL", "ZERO_PRICE", "LEGACY"]) await expect(page.getByText(reason)).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByText("Categorie", { exact: true })).toBeVisible();
  } finally {
    await prisma.auditLog.deleteMany({ where: { companyId: membership.companyId, entityId: { in: [menu.id, ...sectionIds] } } });
    await prisma.auditLog.deleteMany({ where: { companyId: membership.companyId, entityId: { in: await prisma.restaurantMenuItem.findMany({ where: { companyId: membership.companyId, section: { menuId: menu.id } }, select: { id: true } }).then((rows) => rows.map(({ id }) => id)) } } });
    await prisma.restaurantMenu.delete({ where: { id: menu.id } });
    await prisma.fusionCatalogMapping.deleteMany({ where: { companyId: membership.companyId, itemId: { in: itemIds } } });
    await prisma.item.deleteMany({ where: { companyId: membership.companyId, id: { in: itemIds } } });
  }
});
