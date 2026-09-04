import { MODULE_CODES, type ModuleCode } from "@/lib/module-catalog";

export const SYSTEM_ROLES = [
  ["SUPER_ADMIN", "Super Administrator"],
  ["ADMIN", "Administrator"],
  ["MANAGER", "Manager"],
  ["SALES", "Sales operator"],
  ["ACCOUNTANT", "Accountant"],
  ["WAREHOUSE", "Warehouse operator"],
  ["SALA", "Operatore sala"],
] as const;

type ModuleMetadata = { name: string; mandatory?: boolean; status?: "AVAILABLE" | "PLANNED" | "FUTURE" };

const moduleMetadata: Record<ModuleCode, ModuleMetadata> = {
  CORE_AUTH: { name: "Autenticazione", mandatory: true },
  CORE_COMPANIES: { name: "Company", mandatory: true },
  CORE_MEMBERSHIPS: { name: "Membership", mandatory: true },
  CORE_LOCATIONS: { name: "Sedi", mandatory: true },
  CORE_ROLES_PERMISSIONS: { name: "Ruoli e permessi", mandatory: true },
  CORE_MODULES: { name: "Sistema moduli", mandatory: true },
  CORE_PARTNERS: { name: "Partner", mandatory: true },
  CORE_DOCUMENTS: { name: "Documenti e allegati", mandatory: true },
  CORE_AUDIT: { name: "Audit minimo", mandatory: true, status: "PLANNED" },
  CORE_NOTIFICATIONS: { name: "Notifiche di sistema", mandatory: true },
  CORE_DASHBOARD: { name: "Dashboard base", mandatory: true },
  CORE_PRODUCTS: { name: "Prodotti e servizi" }, CORE_PRICE_LISTS: { name: "Listini" }, CORE_SALES: { name: "Vendite" }, CORE_PURCHASES: { name: "Acquisti" },
  CORE_INVENTORY: { name: "Magazzino" }, CORE_PAYMENTS: { name: "Pagamenti" }, CORE_TREASURY: { name: "Tesoreria" },
  CORE_ACCOUNTING: { name: "Contabilità V1", status: "PLANNED" }, CORE_REPORTING: { name: "Reporting avanzato", status: "PLANNED" },
  CORE_SEARCH: { name: "Ricerca globale", status: "FUTURE" }, CORE_IMPORT_EXPORT: { name: "Import/export", status: "FUTURE" },
  CORE_FISCAL_ITALY: { name: "Fiscalità italiana", status: "PLANNED" }, CORE_INTEGRATIONS: { name: "API e integrazioni", status: "PLANNED" }, CORE_CRM: { name: "CRM", status: "AVAILABLE" },
  RESTAURANT_RESERVATIONS: { name: "Prenotazioni ristorante" }, RESTAURANT_MENU: { name: "Menu" }, RESTAURANT_RECIPES: { name: "Ricette e food cost" },
  RESTAURANT_FLOOR: { name: "Sala e comande" }, RESTAURANT_KITCHEN: { name: "Cucina" }, RESTAURANT_POS: { name: "Cassa e POS" },
  RESTAURANT_FOOD_INVENTORY: { name: "Magazzino alimentare" }, RESTAURANT_OMNICHANNEL: { name: "Takeaway e delivery", status: "FUTURE" },
  RESTAURANT_LOYALTY: { name: "Fidelity e gift card", status: "FUTURE" }, RESTAURANT_ANALYTICS: { name: "Analisi ristorante", status: "FUTURE" },
  HOTEL_ROOMS: { name: "Strutture e camere", status: "PLANNED" }, HOTEL_RESERVATIONS: { name: "Prenotazioni hotel", status: "PLANNED" },
  HOTEL_FRONT_DESK: { name: "Front desk", status: "PLANNED" }, HOTEL_HOUSEKEEPING: { name: "Housekeeping", status: "PLANNED" },
  HOTEL_MAINTENANCE: { name: "Manutenzione", status: "FUTURE" }, HOTEL_EXTRAS: { name: "Extra, minibar ed eventi", status: "FUTURE" },
  HOTEL_DISTRIBUTION: { name: "Distribuzione", status: "FUTURE" }, HOTEL_GUEST_PORTAL: { name: "Portale ospite", status: "FUTURE" }, HOTEL_RESTAURANT_LINK: { name: "Collegamento ristorante", status: "FUTURE" },
  BEAUTY_OPERATORS: { name: "Operatori e risorse", status: "PLANNED" }, BEAUTY_APPOINTMENTS: { name: "Agenda e appuntamenti", status: "PLANNED" },
  BEAUTY_CLIENT_RECORDS: { name: "Scheda cliente", status: "PLANNED" }, BEAUTY_PACKAGES: { name: "Pacchetti e abbonamenti", status: "PLANNED" },
  BEAUTY_INVENTORY: { name: "Vendita e consumo prodotti", status: "PLANNED" }, BEAUTY_REMINDERS: { name: "Promemoria e richiami", status: "PLANNED" },
  BEAUTY_ONLINE_BOOKING: { name: "Prenotazione online", status: "FUTURE" }, BEAUTY_LOYALTY: { name: "Fidelity e gift card", status: "FUTURE" },
  BEAUTY_COMMISSIONS: { name: "Commissioni", status: "FUTURE" }, BEAUTY_CAMPAIGNS: { name: "Campagne", status: "FUTURE" },
};

export const SYSTEM_MODULE_DEFINITIONS = Object.values(MODULE_CODES).map((code) => {
  const metadata = moduleMetadata[code];
  return {
    code,
    name: metadata.name,
    category: code.startsWith("CORE_") ? "CORE" as const : code.startsWith("RESTAURANT_") ? "RESTAURANT" as const : code.startsWith("HOTEL_") ? "HOTEL" as const : "BEAUTY" as const,
    mandatory: metadata.mandatory ?? false,
    status: metadata.status ?? "AVAILABLE" as const,
  };
});
