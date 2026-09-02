import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { isRestaurantMenuItemEligible } from "@/lib/restaurant-menu-eligibility";

export const FRISA_MENU_SECTIONS = ["ANTIPASTI", "FRISE", "PRIMI", "SECONDI", "FRITTI", "CONTORNI", "DOLCI", "BEVANDE"] as const;
export type FrisaMenuSection = (typeof FRISA_MENU_SECTIONS)[number];
const assignments: Record<FrisaMenuSection, readonly string[]> = {
  ANTIPASTI: ["ANTIPASTO DEL CONTADINO", "BURRATA", "DEGUSTAZIONE LATTICINI", "INSALATA DI MARE"],
  FRISE: ["FRISA TRADIZIONALE", "FRISA RUSTICA", "FRISA CONTADINA", "FRISA DEL BISTRO'", "FRISA ULTIMA DELLO CHEF", "FRISA DI MARE", "CRUMBLE VEGETALE", "CRUMBLE MARE", "MARE E FAVE"],
  PRIMI: ["ORECCHIETTE PUGLIESI", "TRIA NCANNULATA AL SUGO", "RAVIOLI CREMA DI ZUCCA", "BIGOLI CREMA BASILICO", "ORECCHIETTE ANDATICCHIA", "CICERI E TRIA", "TRIA MEDITERRANEA"],
  SECONDI: ["POLPO ALLA PIGNATA", "FILETTO DI ORATA", "PIGNATA DI MARE", "PARMIGIANA DI MELANZANE"],
  FRITTI: ["FRITTURA DI PARANZA", "COZZE FRITTE", "PITTULE", "CROCCHETTE DI PATATE", "POLPETTE DI VERDURE", "MUERSI FRITTI"],
  CONTORNI: [], DOLCI: [], BEVANDE: [],
};
export const normalizeFusionName = (name: string) => name.trim().replace(/[’`]/g, "'").replace(/\s+/g, " ").toLocaleUpperCase("it-IT");
const classified = new Map(Object.entries(assignments).flatMap(([section, names]) => names.map((name) => [normalizeFusionName(name), section as FrisaMenuSection])));
export const classifyFrisaMenuProduct = (name: string) => classified.get(normalizeFusionName(name)) ?? null;

export async function configureFrisaFusionMenu(client: PrismaClient, companyId: string, locationId: string, options: { dryRun?: boolean; failAfterSections?: boolean } = {}) {
  return client.$transaction(async (tx) => {
    const location = await tx.location.findFirst({ where: { id: locationId, companyId, active: true, deletedAt: null }, select: { id: true } });
    if (!location) throw new Error("Location Restaurant non valida per la Company.");
    const mappingRows = await tx.fusionCatalogMapping.findMany({ where: { companyId, locationId, missingFromFusion: false }, orderBy: { plu: "asc" } });
    const items = await tx.item.findMany({ where: { companyId, id: { in: mappingRows.map(({ itemId }) => itemId) } } });
    const itemById = new Map(items.map((item) => [item.id, item]));
    const mappings = mappingRows.flatMap((mapping) => { const item = itemById.get(mapping.itemId); return item ? [{ ...mapping, item }] : []; });
    const candidates = mappings.filter(({ item }) => isRestaurantMenuItemEligible(item));
    const hidden = mappings.filter(({ item }) => !isRestaurantMenuItemEligible(item));
    const pluHidden = hidden.filter(({ item }) => /PLU/i.test(item.name));
    const zeroPrice = candidates.filter(({ item }) => Number(item.salePrice ?? 0) === 0);
    const assigned = candidates.flatMap((mapping) => { const section = classifyFrisaMenuProduct(mapping.item.name); return section ? [{ mapping, section }] : []; });
    const assignedIds = new Set(assigned.map(({ mapping }) => mapping.itemId));
    const unassigned = candidates.filter(({ itemId }) => !assignedIds.has(itemId));
    if (!options.dryRun) {
      const menu = await tx.restaurantMenu.upsert({ where: { companyId_code: { companyId, code: "FRISA_BISTRO" } }, create: { companyId, locationId, code: "FRISA_BISTRO", name: "Frisà Bistrò", active: true }, update: { locationId, name: "Frisà Bistrò", active: true, deletedAt: null } });
      const sections = new Map<string, string>();
      for (const [sortOrder, name] of FRISA_MENU_SECTIONS.entries()) { const section = await tx.restaurantMenuSection.upsert({ where: { companyId_menuId_name: { companyId, menuId: menu.id, name } }, create: { companyId, menuId: menu.id, name, sortOrder, active: true }, update: { sortOrder, active: true } }); sections.set(name, section.id); }
      if (options.failAfterSections) throw new Error("Errore configurazione menu simulato.");
      for (const [sortOrder, value] of assigned.entries()) await tx.restaurantMenuItem.upsert({ where: { companyId_menuSectionId_itemId: { companyId, menuSectionId: sections.get(value.section)!, itemId: value.mapping.itemId } }, create: { companyId, menuSectionId: sections.get(value.section)!, itemId: value.mapping.itemId, sortOrder, available: true, priceOverride: null }, update: { sortOrder, available: true, priceOverride: null, displayName: null } });
      if (hidden.length) await tx.restaurantMenuItem.updateMany({ where: { companyId, section: { menuId: menu.id }, itemId: { in: hidden.map((value) => value.itemId) } }, data: { available: false } });
    }
    const row = (value: (typeof mappings)[number]) => ({ plu: value.plu, name: value.item.name, price: value.item.salePrice?.toFixed(2) ?? null });
    return { menuCategories: [...FRISA_MENU_SECTIONS], autoAssignedCount: assigned.length, unassignedCount: unassigned.length, unassignedProducts: unassigned.map(row), zeroPriceRealProducts: zeroPrice.map(row), pluContainingProductsHidden: pluHidden.length, fusionItemCount: mappings.length, dryRun: options.dryRun ?? false };
  }, { isolationLevel: "Serializable" });
}
