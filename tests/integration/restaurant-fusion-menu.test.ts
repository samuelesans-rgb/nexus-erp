import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { prisma } from "../../lib/prisma";
import { classifyFrisaMenuProduct, configureFrisaFusionMenu, FRISA_MENU_SECTIONS, isFrisaTechnicalItem } from "../../lib/restaurant-fusion-menu";
import { isRestaurantMenuNameEligible, restaurantMenuPrice } from "../../lib/restaurant-menu-eligibility";

const databaseName = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid").pathname.slice(1);
if (!databaseName.endsWith("_test")) throw new Error("Restaurant Fusion Menu tests require a database ending in _test.");
const suffix = randomUUID().slice(0, 8); let companyId = ""; let locationId = ""; let unitId = "";
const products = [
  [1, "PLU 138", 1000], [2, "plu 138", 1000], [3, "Prodotto PLU 138", 1000],
  [4, "ORECCHIETTE PUGLIESI", 1200], [5, "PRODOTTO AMBIGUO", 900], [6, "FRITTI DELLA CASA", 0], [7, "PANNA", 100], [8, "PLACEHOLDER PLU 8", 0],
  [9, "MENU", 1200], [10, "CAPPUCCINO SOIA", 250], [11, "DESSERT", 700],
  [19, "TORRETTA", 400], [20, "TORRETTA", 800], [115, "ZUCCHINE, GAMBERETTI", 1400],
  [18, "PANNA", 20], [21, "PRIMO", 700], [41, "SECONDO", 900],
  [224, "Albicocca", 150], [234, "Cioccolato", 150], [244, "Vuota", 130], [264, "Crema", 180],
] as const;
before(async () => {
  const company = await prisma.company.create({ data: { name: `Frisa ${suffix}`, vatNumber: `FRISA${suffix}` } }); companyId = company.id;
  locationId = (await prisma.location.create({ data: { companyId, code: `F-${suffix}`, slug: `frisa-${suffix}`, name: "Frisà Bistrò" } })).id;
  unitId = (await prisma.unitOfMeasure.create({ data: { companyId, code: `PZ-${suffix}`, name: "Pezzo", symbol: "pz" } })).id;
  for (const [plu, name, priceCents] of products) {
    const item = await prisma.item.create({ data: { companyId, code: `FUSION_${plu}`, name: name || " ", type: "PRODUCT", unitOfMeasureId: unitId, salePrice: priceCents / 100, sellable: true } });
    await prisma.fusionCatalogMapping.create({ data: { companyId, locationId, itemId: item.id, plu, synchronizedName: name || " ", priceCents, fingerprint: String(plu).padStart(64, "0") } });
  }
});
after(async () => {
  await prisma.restaurantMenuItem.deleteMany({ where: { companyId } }); await prisma.restaurantMenuSection.deleteMany({ where: { companyId } }); await prisma.restaurantMenu.deleteMany({ where: { companyId } });
  await prisma.fusionCatalogMapping.deleteMany({ where: { companyId } }); await prisma.item.deleteMany({ where: { companyId } }); await prisma.unitOfMeasure.deleteMany({ where: { companyId } }); await prisma.location.deleteMany({ where: { companyId } }); await prisma.company.delete({ where: { id: companyId } }); await prisma.$disconnect();
});

test("PLU filter is case-insensitive, substring based and reversible", () => {
  assert.equal(isRestaurantMenuNameEligible("PLU 138"), false); assert.equal(isRestaurantMenuNameEligible("plu 138"), false); assert.equal(isRestaurantMenuNameEligible("Prodotto PLU 138"), false);
  assert.equal(isRestaurantMenuNameEligible("TARTARE DI MANZO"), true); assert.equal(isRestaurantMenuNameEligible(""), false);
  assert.equal(restaurantMenuPrice({ salePrice: 13.5, priceOverride: 99, fusionManaged: true }), 13.5); assert.equal(restaurantMenuPrice({ salePrice: 13.5, priceOverride: 15, fusionManaged: false }), 15);
});
test("deterministic classifier covers every menu category and keyword priority", () => {
  const cases: [string, string][] = [
    ["CAPPUCCINO SOIA", "COLAZIONE E CAFFETTERIA"], ["CORNETTO ARTIGIANALE", "PASTICCERIA"], ["RUSTICO LECCESE", "ROSTICCERIA"], ["ANTIPASTO DI MARE", "ANTIPASTI"],
    ["FRISA DI MARE", "FRISE"], ["PACCHERI AL POLPO", "PRIMI"], ["TARTARE DI MANZO", "SECONDI"], ["FRITTURA MISTA", "FRITTI"], ["INSALATONA", "CONTORNI E INSALATE"],
    ["DESSERT", "DOLCI"], ["ACQUA", "BEVANDE"], ["BIRRA MAHOU IPA", "BIRRE"], ["BOTT. FALANGHINA", "VINI"], ["AMARO", "DRINK E APERITIVI"], ["DEGUSTAZIONE MARE", "DEGUSTAZIONI"],
  ];
  assert.deepEqual(cases.map(([name]) => classifyFrisaMenuProduct(name)), cases.map(([, category]) => category));
  assert.deepEqual([...new Set(cases.map(([name]) => classifyFrisaMenuProduct(name)))].sort(), [...FRISA_MENU_SECTIONS].sort());
  assert.equal(classifyFrisaMenuProduct("DEGUSTAZIONE LATTICINI"), "ANTIPASTI"); assert.equal(classifyFrisaMenuProduct("FRISE ORZO"), "FRISE"); assert.equal(isFrisaTechnicalItem("menu cena"), true); assert.equal(isFrisaTechnicalItem("MENU DELLO CHEF"), false);
  assert.deepEqual([["PANNA", "COLAZIONE E CAFFETTERIA"], ["PRIMO", "PRIMI"], ["SECONDO", "SECONDI"], ["Albicocca", "PASTICCERIA"], ["Cioccolato", "PASTICCERIA"], ["Vuota", "PASTICCERIA"], ["Crema", "PASTICCERIA"]].map(([name, category]) => classifyFrisaMenuProduct(name) === category), Array(7).fill(true));
});
test("configuration preserves mappings/items, uses Fusion prices and reports ambiguous records", async () => {
  const beforeMappings = await prisma.fusionCatalogMapping.findMany({ where: { companyId }, select: { id: true, itemId: true, plu: true }, orderBy: { plu: "asc" } });
  const beforeItems = await prisma.item.count({ where: { companyId } }); const result = await configureFrisaFusionMenu(prisma, companyId, locationId);
  assert.deepEqual(result.menuCategories, [...FRISA_MENU_SECTIONS]); assert.equal(result.autoAssignedCount, 11); assert.equal(result.pluHiddenCount, 4); assert.equal(result.technicalHiddenCount, 1); assert.equal(result.legacyHiddenCount, 3); assert.equal(result.zeroPriceReviewCount, 1); assert.equal(result.duplicateAssignments, 0);
  assert.deepEqual(result.unassignedProducts.map(({ plu }) => plu), [5]); assert.deepEqual(result.zeroPriceReview.map(({ plu }) => plu), [6]); assert.deepEqual(result.technicalHidden.map(({ plu }) => plu), [9]);
  assert.deepEqual(result.legacyHidden.map(({ plu }) => plu), [19, 20, 115]); assert.ok([7, 18].every((plu) => result.autoAssignedProducts.some((row) => row.plu === plu && row.category === "COLAZIONE E CAFFETTERIA"))); assert.ok(result.autoAssignedProducts.some((row) => row.plu === 21 && row.category === "PRIMI")); assert.ok(result.autoAssignedProducts.some((row) => row.plu === 41 && row.category === "SECONDI")); assert.ok([224, 234, 244, 264].every((plu) => result.autoAssignedProducts.some((row) => row.plu === plu && row.category === "PASTICCERIA")));
  const menuItem = await prisma.restaurantMenuItem.findFirstOrThrow({ where: { companyId, item: { name: "ORECCHIETTE PUGLIESI" } }, include: { item: true } }); assert.equal(menuItem.priceOverride, null); assert.equal(menuItem.item.salePrice?.toFixed(2), "12.00");
  await prisma.item.update({ where: { id: menuItem.itemId }, data: { salePrice: 13.5 } }); const refreshed = await prisma.restaurantMenuItem.findUniqueOrThrow({ where: { id: menuItem.id }, include: { item: true } }); assert.equal(refreshed.item.salePrice?.toFixed(2), "13.50");
  assert.deepEqual(await prisma.fusionCatalogMapping.findMany({ where: { companyId }, select: { id: true, itemId: true, plu: true }, orderBy: { plu: "asc" } }), beforeMappings); assert.equal(await prisma.item.count({ where: { companyId } }), beforeItems);
});
test("renaming a mapped PLU product makes it eligible without replacing mapping", async () => {
  const mapping = await prisma.fusionCatalogMapping.findFirstOrThrow({ where: { companyId, plu: 1 } }); await prisma.item.update({ where: { id: mapping.itemId }, data: { name: "TARTARE DI MANZO" } });
  const result = await configureFrisaFusionMenu(prisma, companyId, locationId, { dryRun: true }); assert.ok(result.autoAssignedProducts.some(({ plu, category }) => plu === 1 && category === "SECONDI")); assert.equal((await prisma.fusionCatalogMapping.findUniqueOrThrow({ where: { id: mapping.id } })).itemId, mapping.itemId);
});
test("configuration is idempotent and transactional", async () => {
  await configureFrisaFusionMenu(prisma, companyId, locationId); await configureFrisaFusionMenu(prisma, companyId, locationId);
  assert.equal(await prisma.restaurantMenu.count({ where: { companyId } }), 1); assert.equal(await prisma.restaurantMenuSection.count({ where: { companyId } }), 15); assert.equal(await prisma.restaurantMenuItem.count({ where: { companyId } }), 12);
  await assert.rejects(configureFrisaFusionMenu(prisma, companyId, locationId, { failAfterSections: true }), /simulato/); assert.equal(await prisma.restaurantMenuSection.count({ where: { companyId } }), 15);
});
