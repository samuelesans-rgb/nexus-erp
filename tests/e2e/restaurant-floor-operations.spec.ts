import "dotenv/config";

import { expect, test } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL ?? "";
if (!databaseUrl.includes("_test")) throw new Error("Restaurant Floor E2E requires a _test database.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
test.afterAll(() => prisma.$disconnect());

test("Sala touch: apertura, menu, comanda incrementale e invio incerto", async ({ page }) => {
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@nexuserp.local" } });
  const membership = await prisma.membership.findFirstOrThrow({ where: { userId: admin.id, active: true }, include: { authorizedLocations: true } });
  const locationId = membership.defaultLocationId ?? membership.authorizedLocations[0]?.locationId;
  if (!locationId) throw new Error("Sede E2E non disponibile.");
  const companyId = membership.companyId, suffix = Date.now().toString(36);
  const area = await prisma.restaurantArea.create({ data: { companyId, locationId, code: `E2E-${suffix}`, name: `Sala E2E ${suffix}` } });
  const table = await prisma.restaurantTable.create({ data: { companyId, locationId, areaId: area.id, code: `TE-${suffix}`, name: `TAVOLO E2E ${suffix}`, seats: 4 } });
  const uom = await prisma.unitOfMeasure.create({ data: { companyId, code: `UE${suffix}`, name: `Unità ${suffix}`, symbol: "pz" } });
  const vat = await prisma.vatRate.create({ data: { companyId, code: `VE${suffix}`, name: `IVA E2E ${suffix}`, percentage: 10 } });
  const category = await prisma.itemCategory.create({ data: { companyId, code: `CE${suffix}`, name: `Categoria E2E ${suffix}` } });
  const menu = await prisma.restaurantMenu.create({ data: { companyId, locationId, code: "FRISA_BISTRO", name: "Frisà Bistrò" } });
  const section = await prisma.restaurantMenuSection.create({ data: { companyId, menuId: menu.id, name: "SECONDI" } });
  const station = await prisma.kitchenStation.create({ data: { companyId, locationId, code: `KE${suffix}`, name: `Cucina E2E ${suffix}` } });
  const printer = await prisma.restaurantPrinter.create({ data: { companyId, locationId, stationId: station.id, code: `PE${suffix}`, name: `Printer E2E ${suffix}`, type: "MOCK", connectionType: "MOCK" } });
  const itemIds: string[] = [];
  let orderId = "";
  try {
    for (const fixture of [{ plu: 179, name: `TARTARE E2E ${suffix}`, price: 22 }, { plu: 142, name: `ORATA E2E ${suffix}`, price: 24 }]) {
      const item = await prisma.item.create({ data: { companyId, code: `FE${suffix}-${fixture.plu}`, name: fixture.name, type: "PRODUCT", categoryId: category.id, unitOfMeasureId: uom.id, vatRateId: vat.id, salePrice: fixture.price } });
      itemIds.push(item.id);
      await prisma.fusionCatalogMapping.create({ data: { companyId, locationId, itemId: item.id, plu: fixture.plu, synchronizedName: fixture.name, priceCents: fixture.price * 100, fingerprint: `${suffix}-${fixture.plu}` } });
      await prisma.restaurantMenuItem.create({ data: { companyId, menuSectionId: section.id, itemId: item.id } });
      await prisma.kitchenStationAssignment.create({ data: { companyId, kitchenStationId: station.id, itemId: item.id, priority: 100 } });
    }
    await page.goto("/login"); await page.getByLabel("Email").fill("admin@nexuserp.local"); await page.getByLabel("Password").fill("Admin123!"); await page.getByRole("button", { name: "Accedi" }).click(); await expect(page).toHaveURL(/\/dashboard/);
    await page.setViewportSize({ width: 1024, height: 768 }); await page.goto("/restaurant/floor");
    await expect(page.getByRole("heading", { name: "Sala", exact: true, level: 1 })).toBeVisible(); await page.getByRole("button", { name: new RegExp(`TAVOLO E2E ${suffix}`) }).click();
    await expect(page.getByLabel("Numero coperti")).toHaveValue("2"); await page.getByRole("button", { name: "Apri tavolo" }).click(); await expect(page.getByText("Comanda corrente")).toBeVisible();
    orderId = (await prisma.restaurantOrder.findFirstOrThrow({ where: { companyId, locationId, tables: { some: { tableId: table.id } }, status: "OPEN" } })).id;
    await page.getByPlaceholder("Cerca nome o PLU…").fill("179"); await expect(page.getByRole("button", { name: new RegExp(`TARTARE E2E ${suffix}`) })).toBeVisible(); await page.getByPlaceholder("Cerca nome o PLU…").fill("tartare");
    const product = page.getByRole("button", { name: new RegExp(`TARTARE E2E ${suffix}`) }); await product.click(); await product.click();
    await expect(page.getByText(new RegExp(`2 × TARTARE E2E ${suffix}`))).toBeVisible(); await page.getByLabel(new RegExp(`Aumenta TARTARE E2E`)).click(); await expect(page.getByText(new RegExp(`3 × TARTARE E2E`))).toBeVisible(); await page.getByLabel(new RegExp(`Riduci TARTARE E2E`)).click();
    const note = page.getByLabel(new RegExp(`Nota cucina TARTARE E2E`)); await note.fill("Cottura media"); await note.press("Tab"); await expect(page.getByText("Nota: Cottura media")).toBeVisible(); await expect(page.getByText("Totale").locator("..")).toContainText("44,00");
    await page.getByRole("button", { name: "INVIA IN CUCINA" }).click(); await expect(page.getByText("IN INVIO")).toBeVisible(); await expect(page.getByLabel(new RegExp(`Aumenta TARTARE E2E`))).toHaveCount(0);
    await page.getByPlaceholder("Cerca nome o PLU…").fill("142"); await page.getByRole("button", { name: new RegExp(`ORATA E2E ${suffix}`) }).click(); await page.getByRole("button", { name: "INVIA IN CUCINA" }).dblclick();
    await expect.poll(() => prisma.kitchenDispatch.count({ where: { orderId } })).toBe(2);
    const latestJob = await prisma.kitchenPrintJob.findFirstOrThrow({ where: { ticket: { orderId } }, orderBy: { createdAt: "desc" } }); await prisma.kitchenPrintJob.update({ where: { id: latestJob.id }, data: { status: "FAILED", lastError: "FUSION_UNCERTAIN_DELIVERY" } }); await page.reload();
    await expect(page.getByRole("button", { name: new RegExp(`TAVOLO E2E ${suffix}.*ERRORE CUCINA`) })).toBeVisible(); await page.getByRole("button", { name: new RegExp(`TAVOLO E2E ${suffix}.*ERRORE CUCINA`) }).click();
    await expect(page.getByText(/Invio incerto — verificare la comanda in cucina/)).toBeVisible(); await expect(page.getByRole("button", { name: /Riprova invio sicuro/ })).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 }); await expect(page.getByText("Categorie", { exact: true })).toBeVisible();
  } finally {
    const dispatches = orderId ? await prisma.kitchenDispatch.findMany({ where: { orderId }, select: { id: true } }) : [];
    const lines = orderId ? await prisma.restaurantOrderLine.findMany({ where: { orderId }, select: { id: true } }) : [];
    await prisma.auditLog.deleteMany({ where: { companyId, OR: [{ entityId: orderId || "none" }, { entityId: { in: dispatches.map(({ id }) => id) } }, { entityId: { in: lines.map(({ id }) => id) } }] } }); await prisma.domainEvent.deleteMany({ where: { companyId, aggregateId: { in: [orderId, ...dispatches.map(({ id }) => id)].filter(Boolean) } } });
    await prisma.kitchenPrintJob.deleteMany({ where: { companyId, printerId: printer.id } }); await prisma.kitchenTicketLine.deleteMany({ where: { companyId, orderLineId: { in: lines.map(({ id }) => id) } } }); await prisma.kitchenTicket.deleteMany({ where: { companyId, orderId: orderId || "none" } }); await prisma.kitchenDispatch.deleteMany({ where: { companyId, orderId: orderId || "none" } });
    await prisma.restaurantOrderLine.deleteMany({ where: { companyId, orderId: orderId || "none" } }); await prisma.restaurantOrderTable.deleteMany({ where: { companyId, orderId: orderId || "none" } }); await prisma.restaurantOrder.deleteMany({ where: { companyId, id: orderId || "none" } });
    await prisma.kitchenStationAssignment.deleteMany({ where: { companyId, kitchenStationId: station.id } }); await prisma.restaurantPrinter.delete({ where: { id: printer.id } }); await prisma.kitchenStation.delete({ where: { id: station.id } }); await prisma.restaurantMenu.delete({ where: { id: menu.id } }); await prisma.fusionCatalogMapping.deleteMany({ where: { companyId, itemId: { in: itemIds } } }); await prisma.item.deleteMany({ where: { companyId, id: { in: itemIds } } }); await prisma.itemCategory.delete({ where: { id: category.id } }); await prisma.vatRate.delete({ where: { id: vat.id } }); await prisma.unitOfMeasure.delete({ where: { id: uom.id } }); await prisma.restaurantTable.delete({ where: { id: table.id } }); await prisma.restaurantArea.delete({ where: { id: area.id } });
  }
});
