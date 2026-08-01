import { MODULE_CODES, type ModuleCode } from "@/lib/module-catalog";

export const CONFIGURATION_KEYS = [
  "item-categories",
  "units-of-measure",
  "vat-rates",
  "price-lists",
  "payment-methods",
  "payment-terms",
] as const;

export type ConfigurationKey = (typeof CONFIGURATION_KEYS)[number];

export type ConfigurationDefinition = {
  key: ConfigurationKey;
  label: string;
  singular: string;
  description: string;
  requiredModule: ModuleCode;
  kind: "category" | "unit" | "vat" | "price-list" | "payment-method" | "payment-term";
};

export const CONFIGURATION_CATALOG: readonly ConfigurationDefinition[] = [
  { key: "item-categories", label: "Categorie Item", singular: "Categoria", description: "Classificazione gerarchica condivisa del catalogo.", requiredModule: MODULE_CODES.CORE_PRODUCTS, kind: "category" },
  { key: "units-of-measure", label: "Unità di misura", singular: "Unità di misura", description: "Unità e precisioni utilizzate dagli Item.", requiredModule: MODULE_CODES.CORE_PRODUCTS, kind: "unit" },
  { key: "vat-rates", label: "Aliquote IVA", singular: "Aliquota IVA", description: "Aliquote e nature fiscali configurabili per Company.", requiredModule: MODULE_CODES.CORE_PRODUCTS, kind: "vat" },
  { key: "price-lists", label: "Listini prezzi", singular: "Listino", description: "Listini multi-Item con prezzi specifici.", requiredModule: MODULE_CODES.CORE_PRICE_LISTS, kind: "price-list" },
  { key: "payment-methods", label: "Metodi di pagamento", singular: "Metodo di pagamento", description: "Metodi selezionabili nelle anagrafiche e nei flussi futuri.", requiredModule: MODULE_CODES.CORE_PAYMENTS, kind: "payment-method" },
  { key: "payment-terms", label: "Condizioni di pagamento", singular: "Condizione di pagamento", description: "Scadenze immediate, differite, fine mese o personalizzate.", requiredModule: MODULE_CODES.CORE_PAYMENTS, kind: "payment-term" },
] as const;

export function getConfigurationDefinition(value: string) {
  return CONFIGURATION_CATALOG.find(({ key }) => key === value);
}
