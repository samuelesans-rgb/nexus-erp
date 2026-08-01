import { MODULE_CODES, type ModuleCode } from "@/lib/module-catalog";

export const ITEM_TYPES = [
  "PRODUCT",
  "SERVICE",
  "INGREDIENT",
  "RECIPE",
  "BEAUTY_SERVICE",
  "HOTEL_ROOM",
  "PACKAGE",
  "GIFT_CARD",
] as const;

export type CatalogItemType = (typeof ITEM_TYPES)[number];

export const ITEM_TYPE_LABELS: Record<CatalogItemType, string> = {
  PRODUCT: "Prodotto",
  SERVICE: "Servizio",
  INGREDIENT: "Ingrediente",
  RECIPE: "Ricetta",
  BEAUTY_SERVICE: "Trattamento Beauty",
  HOTEL_ROOM: "Camera Hotel",
  PACKAGE: "Pacchetto",
  GIFT_CARD: "Gift card",
};

export const ITEM_TYPE_REQUIRED_MODULES: Record<
  CatalogItemType,
  readonly ModuleCode[]
> = {
  PRODUCT: [MODULE_CODES.CORE_PRODUCTS],
  SERVICE: [MODULE_CODES.CORE_PRODUCTS],
  INGREDIENT: [
    MODULE_CODES.CORE_PRODUCTS,
    MODULE_CODES.RESTAURANT_RECIPES,
  ],
  RECIPE: [
    MODULE_CODES.CORE_PRODUCTS,
    MODULE_CODES.RESTAURANT_RECIPES,
  ],
  BEAUTY_SERVICE: [
    MODULE_CODES.CORE_PRODUCTS,
    MODULE_CODES.BEAUTY_APPOINTMENTS,
  ],
  HOTEL_ROOM: [MODULE_CODES.CORE_PRODUCTS, MODULE_CODES.HOTEL_ROOMS],
  PACKAGE: [MODULE_CODES.CORE_PRODUCTS, MODULE_CODES.BEAUTY_PACKAGES],
  GIFT_CARD: [MODULE_CODES.CORE_PRODUCTS],
};

export const GIFT_CARD_MODULES = [
  MODULE_CODES.RESTAURANT_LOYALTY,
  MODULE_CODES.BEAUTY_LOYALTY,
] as const;

export function isCatalogItemType(value: string): value is CatalogItemType {
  return ITEM_TYPES.includes(value as CatalogItemType);
}

export function itemTypeSupportsStock(type: CatalogItemType) {
  return type === "PRODUCT" || type === "INGREDIENT";
}
