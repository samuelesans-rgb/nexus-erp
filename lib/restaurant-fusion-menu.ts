import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { isRestaurantMenuItemEligible } from "@/lib/restaurant-menu-eligibility";

export const FRISA_MENU_SECTIONS = ["COLAZIONE E CAFFETTERIA", "PASTICCERIA", "ROSTICCERIA", "ANTIPASTI", "FRISE", "PRIMI", "SECONDI", "FRITTI", "CONTORNI E INSALATE", "DOLCI", "BEVANDE", "BIRRE", "VINI", "DRINK E APERITIVI", "DEGUSTAZIONI"] as const;
export type FrisaMenuSection = (typeof FRISA_MENU_SECTIONS)[number];
export const normalizeFusionName = (name: string) => name.trim().replace(/[’`]/g, "'").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").toLocaleUpperCase("it-IT");

const exactAssignments: Partial<Record<FrisaMenuSection, readonly string[]>> = {
  ANTIPASTI: ["ANTIPASTO DEL CONTADINO", "BURRATA", "DEGUSTAZIONE LATTICINI", "INSALATA DI MARE", "ANTIPASTO DI TERRA", "ANTIPASTO DI MARE", "CAPOCOLLO E PANCETTA", "SCAPECE ALLO ZAFFERANO"],
  FRISE: ["CRUMBLE VEGETALE", "CRUMBLE MARE", "MARE E FAVE"],
  PRIMI: ["ORECCHIETTE PUGLIESI", "TRIA NCANNULATA AL SUGO", "RAVIOLI CREMA DI ZUCCA", "BIGOLI CREMA BASILICO", "ORECCHIETTE ANDATICCHIA", "CICERI E TRIA", "TRIA MEDITERRANEA", "PRIMO DI MARE", "ORECCHIETTE DI MARE", "TAGLIOLINI ALLO SCOGLIO", "CACIO E PEPE CON TARTARE", "SAGNE AL BACCALA", "TAGLIOLINI AL NERO", "TAGLIOLINI DI MARE", "PACCHERI AL POLPO"],
  SECONDI: ["POLPO ALLA PIGNATA", "FILETTO DI ORATA", "PIGNATA DI MARE", "PARMIGIANA DI MELANZANE", "POLPETTE ALLA SALENTINA", "PEZZETTI ALLA SALENTINA", "BRACIOLE NEL SUO SUGO", "FAVE E CICORIE E BACCALA", "TRANCIO DI PESCE SPADA", "BRASATO CON POLENTA", "PARMIGIANA DI MARE", "FILETTO DI MAIALETTO", "POLPO IN PIGNATA", "TARTARE DI MANZO", "POLPETTE AL SUGO", "TAGLIATA CONTROFILETTO", "PEZZETTI AL SUGO", "BOMBETTE PUGLIESI", "FILETTO AL PEPE VERDE"],
  FRITTI: ["FRITTURA DI PARANZA", "COZZE FRITTE", "PITTULE", "CROCCHETTE DI PATATE", "POLPETTE DI VERDURE", "MUERSI FRITTI", "FRITTURA MISTA"],
};
const exactCategory = new Map(Object.entries(exactAssignments).flatMap(([category, names]) => (names ?? []).map((name) => [normalizeFusionName(name), category as FrisaMenuSection])));
const technicalNames = new Set(["MENU", "PRANZO", "MENU CENA", "COLAZIONE", "COPERTO", "ASPORTO", "SERVIZIO", "SENZA GLUTINE"]);
export const isFrisaTechnicalItem = (name: string) => technicalNames.has(normalizeFusionName(name));
const has = (name: string, values: readonly string[]) => values.some((value) => name.includes(value));

export function classifyFrisaMenuProduct(name: string): FrisaMenuSection | null {
  const value = normalizeFusionName(name), exact = exactCategory.get(value); if (exact) return exact;
  if (has(value, ["BIRRA", "SAN MIGUEL", "MAHOU", "ALHAMBRA"])) return "BIRRE";
  if (has(value, ["CALICE DI VINO", "VINO DELLA CASA", "BOTT.", "BOTTIGLIA DI VINO", "FALANGHINA", "BONSIGNORE", "CARMINIO", "AMARONE", "KRASI'", "METODO CLASSICO", "FERRARI", "PRIMITIVO", "VEUVE CLICQUOT", "NEGROAMARO", "CHAMPAGNE"])) return "VINI";
  if (has(value, ["DRINK", "APERITIVO", "SUPERALCOLICO", "AMARO"])) return "DRINK E APERITIVI";
  if (value.includes("DEGUSTAZIONE")) return "DEGUSTAZIONI";
  if (value.includes("FRISA") || value.includes("FRISE")) return "FRISE";
  if (has(value, ["CAPPUCCINO", "MAROCCHINO", "GINSENG", "ORZO", "LATTE", "CIOCCOLATA CALDA", "SHAKERATO", "CAFFE", "SOIA", "SPREMUTA", "SUCCO DI FRUTTA", "CENTRIFUGA", "TISANA"])) return "COLAZIONE E CAFFETTERIA";
  if (has(value, ["CROISSANT", "CORNETTO", "PASTICCIOTTO", "MIGNON", "CROSTATINA", "BISCOTTO", "FROLLA", "PASTICCERIA", "TORTA", "BRIOCHE", "CREMA E AMARENA", "CREMA E CIOCCOLATO", "CREMA E PISTACCHIO"])) return "PASTICCERIA";
  if (has(value, ["ROSTICCERIA", "RUSTICO LECCESE", "RUSTICO FARCITO", "SFOGLIA SALATA", "PANINO", "PITTA FRITTA"])) return "ROSTICCERIA";
  if (has(value, ["TAGLIOLINI", "ORECCHIETTE", "PACCHERI", "RAVIOLI", "BIGOLI", "CICERI E TRIA", "TRIA ", "SAGNE", "CACIO E PEPE"])) return "PRIMI";
  if (has(value, ["FILETTO", "POLPETTE", "PEZZETTI", "BRACIOLE", "BRASATO", "PARMIGIANA", "PIGNATA", "TARTARE", "TAGLIATA", "BOMBETTE", "TRANCIO DI PESCE", "FAVE E CICORIE"])) return "SECONDI";
  if (has(value, ["FRITTURA", "FRITTO", "FRITTI", "PITTULE", "CROCCHETTE"])) return "FRITTI";
  if (value === "CONTORNO" || has(value, ["INSALATA", "INSALATONA", "PATATE PREZZEMOLO"])) return "CONTORNI E INSALATE";
  if (value.includes("DESSERT")) return "DOLCI";
  if (has(value, ["ACQUA", "BIBITA"])) return "BEVANDE";
  if (value.startsWith("ANTIPASTO ")) return "ANTIPASTI";
  return null;
}

export async function configureFrisaFusionMenu(client: PrismaClient, companyId: string, locationId: string, options: { dryRun?: boolean; failAfterSections?: boolean } = {}) {
  return client.$transaction(async (tx) => {
    const location = await tx.location.findFirst({ where: { id: locationId, companyId, active: true, deletedAt: null }, select: { id: true } });
    if (!location) throw new Error("Location Restaurant non valida per la Company.");
    const mappingRows = await tx.fusionCatalogMapping.findMany({ where: { companyId, locationId, missingFromFusion: false }, orderBy: { plu: "asc" } });
    const items = await tx.item.findMany({ where: { companyId, id: { in: mappingRows.map(({ itemId }) => itemId) } } });
    const itemById = new Map(items.map((item) => [item.id, item]));
    const mappings = mappingRows.flatMap((mapping) => { const item = itemById.get(mapping.itemId); return item ? [{ ...mapping, item }] : []; });
    const eligible = mappings.filter(({ item }) => isRestaurantMenuItemEligible(item));
    const pluHidden = mappings.filter(({ item }) => /PLU/i.test(item.name));
    const technicalHidden = eligible.filter(({ item }) => isFrisaTechnicalItem(item.name));
    const zeroPriceReview = eligible.filter(({ item }) => Number(item.salePrice ?? 0) === 0);
    const assignable = eligible.filter(({ item }) => !isFrisaTechnicalItem(item.name) && Number(item.salePrice ?? 0) > 0);
    const assigned = assignable.flatMap((mapping) => { const section = classifyFrisaMenuProduct(mapping.item.name); return section ? [{ mapping, section }] : []; });
    const assignedIds = new Set(assigned.map(({ mapping }) => mapping.itemId));
    const unassigned = assignable.filter(({ itemId }) => !assignedIds.has(itemId));
    const unavailableIds = [...new Set([...pluHidden, ...technicalHidden, ...zeroPriceReview].map(({ itemId }) => itemId))];
    if (!options.dryRun) {
      const menu = await tx.restaurantMenu.upsert({ where: { companyId_code: { companyId, code: "FRISA_BISTRO" } }, create: { companyId, locationId, code: "FRISA_BISTRO", name: "Frisà Bistrò", active: true }, update: { locationId, name: "Frisà Bistrò", active: true, deletedAt: null } });
      const sections = new Map<string, string>();
      for (const [sortOrder, name] of FRISA_MENU_SECTIONS.entries()) { const section = await tx.restaurantMenuSection.upsert({ where: { companyId_menuId_name: { companyId, menuId: menu.id, name } }, create: { companyId, menuId: menu.id, name, sortOrder, active: true }, update: { sortOrder, active: true } }); sections.set(name, section.id); }
      if (options.failAfterSections) throw new Error("Errore configurazione menu simulato.");
      for (const [sortOrder, value] of assigned.entries()) await tx.restaurantMenuItem.upsert({ where: { companyId_menuSectionId_itemId: { companyId, menuSectionId: sections.get(value.section)!, itemId: value.mapping.itemId } }, create: { companyId, menuSectionId: sections.get(value.section)!, itemId: value.mapping.itemId, sortOrder, available: true, priceOverride: null }, update: { sortOrder, available: true, priceOverride: null, displayName: null } });
      if (unavailableIds.length) await tx.restaurantMenuItem.updateMany({ where: { companyId, section: { menuId: menu.id }, itemId: { in: unavailableIds } }, data: { available: false } });
    }
    const row = (value: (typeof mappings)[number]) => ({ plu: value.plu, name: value.item.name, price: value.item.salePrice?.toFixed(2) ?? null });
    const categoryCounts = Object.fromEntries(FRISA_MENU_SECTIONS.map((category) => [category, assigned.filter(({ section }) => section === category).length]));
    return { menuCategories: [...FRISA_MENU_SECTIONS], catalogItemsAnalyzed: mappings.length, eligibleRealProducts: eligible.length, pluHiddenCount: pluHidden.length, technicalHiddenCount: technicalHidden.length, technicalHidden: technicalHidden.map(row), zeroPriceReviewCount: zeroPriceReview.length, zeroPriceReview: zeroPriceReview.map(row), autoAssignedCount: assigned.length, autoAssignedProducts: assigned.map(({ mapping, section }) => ({ category: section, ...row(mapping) })), categoryCounts, unassignedCount: unassigned.length, unassignedProducts: unassigned.map(row), duplicateAssignments: assigned.length - new Set(assigned.map(({ mapping }) => mapping.itemId)).size, dryRun: options.dryRun ?? false };
  }, { isolationLevel: "Serializable" });
}
