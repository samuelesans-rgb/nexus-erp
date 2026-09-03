import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { prisma } from "../../lib/prisma";
import { configureFrisaFusionMenu } from "../../lib/restaurant-fusion-menu";
import { getRestaurantMenuManager, menuExclusionReason, moveRestaurantMenuItem, reorderRestaurantMenuItem, reorderRestaurantMenuSection, updateRestaurantMenuItemState } from "../../lib/restaurant-menu-manager";

const databaseName = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid").pathname.slice(1);
if (!databaseName.endsWith("_test")) throw new Error("Restaurant Menu Manager tests require a database ending in _test.");
const suffix = randomUUID().slice(0, 8);
let companyId = "", locationId = "", userId = "", menuId = "", firstSectionId = "", secondSectionId = "", primaryMenuItemId = "", secondMenuItemId = "";

before(async () => {
  const company = await prisma.company.create({ data: { name: `Menu Manager ${suffix}`, vatNumber: `MM${suffix}` } }); companyId = company.id;
  locationId = (await prisma.location.create({ data: { companyId, code: `MM-${suffix}`, slug: `mm-${suffix}`, name: "Frisà Bistrò" } })).id;
  userId = (await prisma.user.create({ data: { email: `menu-${suffix}@example.test`, firstName: "Menu", lastName: "Manager", password: "not-used-in-test" } })).id;
  const unitId = (await prisma.unitOfMeasure.create({ data: { companyId, code: "PZ", name: "Pezzo", symbol: "pz" } })).id;
  const menu = await prisma.restaurantMenu.create({ data: { companyId, locationId, code: "FRISA_BISTRO", name: "Frisà Bistrò" } }); menuId = menu.id;
  const first = await prisma.restaurantMenuSection.create({ data: { companyId, menuId, name: "ANTIPASTI", sortOrder: 0 } }); firstSectionId = first.id;
  const second = await prisma.restaurantMenuSection.create({ data: { companyId, menuId, name: "SECONDI", sortOrder: 1 } }); secondSectionId = second.id;
  const fixtures = [[179, "TARTARE DI MANZO", 2200], [142, "FILETTO DI ORATA", 2400], [900, "PLU 900", 100], [901, "MENU", 1200], [902, "ZERO", 0], [19, "TORRETTA", 400]] as const;
  for (const [plu, name, priceCents] of fixtures) {
    const item = await prisma.item.create({ data: { companyId, code: `FUSION_${plu}`, name, type: "PRODUCT", unitOfMeasureId: unitId, salePrice: priceCents / 100, sellable: true } });
    await prisma.fusionCatalogMapping.create({ data: { companyId, locationId, itemId: item.id, plu, synchronizedName: name, priceCents, fingerprint: String(plu).padStart(64, "0") } });
    if (plu === 179) primaryMenuItemId = (await prisma.restaurantMenuItem.create({ data: { companyId, menuSectionId: first.id, itemId: item.id, sortOrder: 0 } })).id;
    if (plu === 142) secondMenuItemId = (await prisma.restaurantMenuItem.create({ data: { companyId, menuSectionId: first.id, itemId: item.id, sortOrder: 1 } })).id;
  }
});

after(async () => {
  await prisma.auditLog.deleteMany({ where: { companyId } });
  await prisma.restaurantMenuItem.deleteMany({ where: { companyId } }); await prisma.restaurantMenuSection.deleteMany({ where: { companyId } }); await prisma.restaurantMenu.deleteMany({ where: { companyId } });
  await prisma.fusionCatalogMapping.deleteMany({ where: { companyId } }); await prisma.item.deleteMany({ where: { companyId } }); await prisma.unitOfMeasure.deleteMany({ where: { companyId } }); await prisma.location.deleteMany({ where: { companyId } }); await prisma.company.delete({ where: { id: companyId } }); await prisma.user.delete({ where: { id: userId } }); await prisma.$disconnect();
});

const actor = () => ({ companyId, locationId, userId });

test("dashboard exposes categories and immutable FUSION values", async () => {
  const data = await getRestaurantMenuManager(companyId, locationId, menuId);
  assert.equal(data.menu.name, "Frisà Bistrò"); assert.equal(data.sections.length, 2); assert.equal(data.configuredCount, 2);
  assert.deepEqual(data.sections[0].items.map(({ name, plu, price, source }) => ({ name, plu, price, source })), [
    { name: "TARTARE DI MANZO", plu: 179, price: 22, source: "FUSION" }, { name: "FILETTO DI ORATA", plu: 142, price: 24, source: "FUSION" },
  ]);
});

test("visibility and availability are independent, reversible and audited", async () => {
  await updateRestaurantMenuItemState(actor(), primaryMenuItemId, { visible: false });
  await updateRestaurantMenuItemState(actor(), primaryMenuItemId, { available: false });
  let row = await prisma.restaurantMenuItem.findUniqueOrThrow({ where: { id: primaryMenuItemId } }); assert.equal(row.visible, false); assert.equal(row.available, false);
  await updateRestaurantMenuItemState(actor(), primaryMenuItemId, { visible: true, available: true });
  row = await prisma.restaurantMenuItem.findUniqueOrThrow({ where: { id: primaryMenuItemId } }); assert.equal(row.visible, true); assert.equal(row.available, true);
  const audit = await prisma.auditLog.findMany({ where: { companyId, entityId: primaryMenuItemId, action: "RESTAURANT_MENU_ITEM_STATE_CHANGED" } }); assert.equal(audit.length, 3); assert.ok(audit.every((entry) => entry.userId === userId));
});

test("category and product order changes persist without duplicate Items", async () => {
  await reorderRestaurantMenuItem(actor(), secondMenuItemId, "up");
  const rows = await prisma.restaurantMenuItem.findMany({ where: { menuSectionId: firstSectionId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }); assert.equal(rows[0].id, secondMenuItemId);
  await moveRestaurantMenuItem(actor(), primaryMenuItemId, secondSectionId);
  assert.equal((await prisma.restaurantMenuItem.findUniqueOrThrow({ where: { id: primaryMenuItemId } })).menuSectionId, secondSectionId);
  await reorderRestaurantMenuSection(actor(), secondSectionId, "up");
  const sections = await prisma.restaurantMenuSection.findMany({ where: { menuId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }); assert.equal(sections[0].id, secondSectionId);
  assert.equal(await prisma.item.count({ where: { companyId } }), 6); assert.equal(await prisma.fusionCatalogMapping.count({ where: { companyId } }), 6);
});

test("all exclusion reasons are deterministic and excluded publication is blocked", async () => {
  assert.equal(menuExclusionReason({ plu: 900, name: "PLU 900", price: 1 }), "PLACEHOLDER_PLU");
  assert.equal(menuExclusionReason({ plu: 901, name: "MENU", price: 12 }), "TECHNICAL");
  assert.equal(menuExclusionReason({ plu: 902, name: "ZERO", price: 0 }), "ZERO_PRICE");
  assert.equal(menuExclusionReason({ plu: 19, name: "TORRETTA", price: 4 }), "LEGACY");
  const data = await getRestaurantMenuManager(companyId, locationId, menuId); assert.deepEqual(new Set(data.excluded.map((row) => row.reason)), new Set(["PLACEHOLDER_PLU", "TECHNICAL", "ZERO_PRICE", "LEGACY"]));
  const excluded = await prisma.fusionCatalogMapping.findFirstOrThrow({ where: { companyId, plu: 19 } });
  const forced = await prisma.restaurantMenuItem.create({ data: { companyId, menuSectionId: firstSectionId, itemId: excluded.itemId } });
  await assert.rejects(updateRestaurantMenuItemState(actor(), forced.id, { visible: true }), /escluso/); await prisma.restaurantMenuItem.delete({ where: { id: forced.id } });
});

test("a subsequent FUSION update and menu configuration preserve Nexus-managed state", async () => {
  await updateRestaurantMenuItemState(actor(), primaryMenuItemId, { visible: false, available: false });
  const row = await prisma.restaurantMenuItem.findUniqueOrThrow({ where: { id: primaryMenuItemId } });
  await prisma.item.update({ where: { id: row.itemId }, data: { name: "TARTARE PREMIUM", salePrice: 25 } });
  await prisma.fusionCatalogMapping.update({ where: { companyId_locationId_plu: { companyId, locationId, plu: 179 } }, data: { synchronizedName: "TARTARE PREMIUM", priceCents: 2500, fingerprint: "a".repeat(64) } });
  await configureFrisaFusionMenu(prisma, companyId, locationId);
  const after = await prisma.restaurantMenuItem.findUniqueOrThrow({ where: { id: primaryMenuItemId }, include: { item: true } });
  assert.equal(after.visible, false); assert.equal(after.available, false); assert.equal(after.item.name, "TARTARE PREMIUM"); assert.equal(after.item.salePrice?.toFixed(2), "25.00");
  assert.equal(after.menuSectionId, secondSectionId);
  assert.equal(await prisma.restaurantMenuItem.count({ where: { companyId, itemId: after.itemId } }), 1);
});

test("client manager includes responsive search, PLU search, filters and read-only FUSION messaging", async () => {
  const source = await readFile(new URL("../../app/(dashboard)/restaurant/menus/[id]/menu-manager.tsx", import.meta.url), "utf8");
  for (const marker of ["lg:grid-cols", "overflow-x-auto", "String(product.plu)", "Visibili", "Nascosti", "Disponibili", "Non disponibili", "Sincronizzato da FUSION", "Nome e prezzo vengono aggiornati automaticamente"]) assert.ok(source.includes(marker), marker);
  assert.equal(/name=["'](?:name|price|plu)["']/.test(source), false);
  const actions = await readFile(new URL("../../app/(dashboard)/restaurant/menus/[id]/manager-actions.ts", import.meta.url), "utf8"); assert.ok(actions.includes('RESTAURANT_MENU, "manage"'));
});
