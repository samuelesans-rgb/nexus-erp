import "dotenv/config";

import bcrypt from "bcrypt";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { MODULE_CODES } from "../lib/module-catalog";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

const moduleDefinitions = [
  [MODULE_CODES.CORE_AUTH, "Autenticazione", "CORE", true, "AVAILABLE"],
  [MODULE_CODES.CORE_COMPANIES, "Company", "CORE", true, "AVAILABLE"],
  [MODULE_CODES.CORE_MEMBERSHIPS, "Membership", "CORE", true, "AVAILABLE"],
  [MODULE_CODES.CORE_LOCATIONS, "Sedi", "CORE", true, "PLANNED"],
  [
    MODULE_CODES.CORE_ROLES_PERMISSIONS,
    "Ruoli e permessi",
    "CORE",
    true,
    "AVAILABLE",
  ],
  [MODULE_CODES.CORE_MODULES, "Sistema moduli", "CORE", true, "AVAILABLE"],
  [MODULE_CODES.CORE_PARTNERS, "Partner", "CORE", true, "AVAILABLE"],
  [
    MODULE_CODES.CORE_DOCUMENTS,
    "Documenti e allegati",
    "CORE",
    true,
    "PLANNED",
  ],
  [MODULE_CODES.CORE_AUDIT, "Audit minimo", "CORE", true, "PLANNED"],
  [
    MODULE_CODES.CORE_NOTIFICATIONS,
    "Notifiche di sistema",
    "CORE",
    true,
    "PLANNED",
  ],
  [MODULE_CODES.CORE_DASHBOARD, "Dashboard base", "CORE", true, "AVAILABLE"],
  [MODULE_CODES.CORE_PRODUCTS, "Prodotti e servizi", "SHARED", false, "PLANNED"],
  [MODULE_CODES.CORE_PRICE_LISTS, "Listini", "SHARED", false, "PLANNED"],
  [MODULE_CODES.CORE_SALES, "Vendite", "SHARED", false, "PLANNED"],
  [MODULE_CODES.CORE_PURCHASES, "Acquisti", "SHARED", false, "PLANNED"],
  [MODULE_CODES.CORE_INVENTORY, "Magazzino", "SHARED", false, "PLANNED"],
  [MODULE_CODES.CORE_PAYMENTS, "Pagamenti", "SHARED", false, "PLANNED"],
  [MODULE_CODES.CORE_TREASURY, "Tesoreria", "SHARED", false, "FUTURE"],
  [MODULE_CODES.CORE_ACCOUNTING, "Contabilità V1", "SHARED", false, "PLANNED"],
  [MODULE_CODES.CORE_REPORTING, "Reporting avanzato", "SHARED", false, "PLANNED"],
  [MODULE_CODES.CORE_SEARCH, "Ricerca globale", "SHARED", false, "FUTURE"],
  [MODULE_CODES.CORE_IMPORT_EXPORT, "Import/export", "SHARED", false, "FUTURE"],
  [
    MODULE_CODES.CORE_FISCAL_ITALY,
    "Fiscalità italiana",
    "SHARED",
    false,
    "PLANNED",
  ],
  [MODULE_CODES.CORE_INTEGRATIONS, "API e integrazioni", "SHARED", false, "PLANNED"],
  [MODULE_CODES.CORE_CRM, "CRM", "SHARED", false, "FUTURE"],
  [
    MODULE_CODES.RESTAURANT_RESERVATIONS,
    "Prenotazioni ristorante",
    "RESTAURANT",
    false,
    "PLANNED",
  ],
  [MODULE_CODES.RESTAURANT_MENU, "Menu", "RESTAURANT", false, "PLANNED"],
  [
    MODULE_CODES.RESTAURANT_RECIPES,
    "Ricette e food cost",
    "RESTAURANT",
    false,
    "PLANNED",
  ],
  [
    MODULE_CODES.RESTAURANT_FLOOR,
    "Sala e comande",
    "RESTAURANT",
    false,
    "PLANNED",
  ],
  [MODULE_CODES.RESTAURANT_KITCHEN, "Cucina", "RESTAURANT", false, "PLANNED"],
  [MODULE_CODES.RESTAURANT_POS, "Cassa e POS", "RESTAURANT", false, "PLANNED"],
  [
    MODULE_CODES.RESTAURANT_FOOD_INVENTORY,
    "Magazzino alimentare",
    "RESTAURANT",
    false,
    "PLANNED",
  ],
  [
    MODULE_CODES.RESTAURANT_OMNICHANNEL,
    "Takeaway e delivery",
    "RESTAURANT",
    false,
    "FUTURE",
  ],
  [
    MODULE_CODES.RESTAURANT_LOYALTY,
    "Fidelity e gift card",
    "RESTAURANT",
    false,
    "FUTURE",
  ],
  [
    MODULE_CODES.RESTAURANT_ANALYTICS,
    "Analisi ristorante",
    "RESTAURANT",
    false,
    "FUTURE",
  ],
  [MODULE_CODES.BEAUTY_OPERATORS, "Operatori e risorse", "BEAUTY", false, "PLANNED"],
  [MODULE_CODES.BEAUTY_APPOINTMENTS, "Agenda e appuntamenti", "BEAUTY", false, "PLANNED"],
  [MODULE_CODES.BEAUTY_CLIENT_RECORDS, "Scheda cliente", "BEAUTY", false, "PLANNED"],
  [MODULE_CODES.BEAUTY_PACKAGES, "Pacchetti e abbonamenti", "BEAUTY", false, "PLANNED"],
  [MODULE_CODES.BEAUTY_INVENTORY, "Vendita e consumo prodotti", "BEAUTY", false, "PLANNED"],
  [MODULE_CODES.BEAUTY_REMINDERS, "Promemoria e richiami", "BEAUTY", false, "PLANNED"],
  [MODULE_CODES.BEAUTY_ONLINE_BOOKING, "Prenotazione online", "BEAUTY", false, "FUTURE"],
  [MODULE_CODES.BEAUTY_LOYALTY, "Fidelity e gift card", "BEAUTY", false, "FUTURE"],
  [MODULE_CODES.BEAUTY_COMMISSIONS, "Commissioni operatori", "BEAUTY", false, "FUTURE"],
  [MODULE_CODES.BEAUTY_CAMPAIGNS, "Campagne", "BEAUTY", false, "FUTURE"],
  [MODULE_CODES.HOTEL_ROOMS, "Strutture e camere", "HOTEL", false, "PLANNED"],
  [MODULE_CODES.HOTEL_RESERVATIONS, "Prenotazioni hotel", "HOTEL", false, "PLANNED"],
  [MODULE_CODES.HOTEL_FRONT_DESK, "Front desk", "HOTEL", false, "PLANNED"],
  [MODULE_CODES.HOTEL_HOUSEKEEPING, "Housekeeping", "HOTEL", false, "PLANNED"],
  [MODULE_CODES.HOTEL_MAINTENANCE, "Manutenzione", "HOTEL", false, "FUTURE"],
  [MODULE_CODES.HOTEL_EXTRAS, "Extra, minibar ed eventi", "HOTEL", false, "FUTURE"],
  [MODULE_CODES.HOTEL_DISTRIBUTION, "Distribuzione", "HOTEL", false, "FUTURE"],
  [MODULE_CODES.HOTEL_GUEST_PORTAL, "Portale ospite", "HOTEL", false, "FUTURE"],
  [MODULE_CODES.HOTEL_RESTAURANT_LINK, "Collegamento ristorante", "HOTEL", false, "FUTURE"],
] as const;

async function main() {
  console.log("🌱 Seeding database...");

  const password = await bcrypt.hash("Admin123!", 12);

  const company = await prisma.company.upsert({
    where: {
      vatNumber: "IT00000000000",
    },
    update: {},
    create: {
      name: "Nexus ERP Demo",
      legalName: "Nexus ERP Demo S.r.l.",
      vatNumber: "IT00000000000",
      country: "Italia",
    },
  });

  const user = await prisma.user.upsert({
    where: {
      email: "admin@nexuserp.local",
    },
    update: {},
    create: {
      firstName: "Super",
      lastName: "Admin",
      email: "admin@nexuserp.local",
      password,
    },
  });

  const role = await prisma.role.upsert({
    where: {
      code: "SUPER_ADMIN",
    },
    update: {},
    create: {
      code: "SUPER_ADMIN",
      name: "Super Administrator",
    },
  });

  const membership = await prisma.membership.upsert({
    where: {
      userId_companyId: {
        userId: user.id,
        companyId: company.id,
      },
    },
    update: {},
    create: {
      userId: user.id,
      companyId: company.id,
      active: true,
      isDefault: true,
    },
  });

  await prisma.membershipRole.upsert({
    where: {
      membershipId_roleId: {
        membershipId: membership.id,
        roleId: role.id,
      },
    },
    update: {},
    create: {
      membershipId: membership.id,
      roleId: role.id,
    },
  });

  for (const [code, name, category, mandatory, status] of moduleDefinitions) {
    await prisma.moduleDefinition.upsert({
      where: { code },
      update: { name, category, mandatory, status },
      create: { code, name, category, mandatory, status },
    });
  }

  const defaultModules = await prisma.moduleDefinition.findMany({
    where: {
      OR: [{ mandatory: true }, { status: "AVAILABLE", category: "CORE" }],
    },
    select: { id: true },
  });

  for (const moduleDefinition of defaultModules) {
    await prisma.companyModule.upsert({
      where: {
        companyId_moduleDefinitionId: {
          companyId: company.id,
          moduleDefinitionId: moduleDefinition.id,
        },
      },
      update: {
        enabled: true,
        disabledAt: null,
      },
      create: {
        companyId: company.id,
        moduleDefinitionId: moduleDefinition.id,
        enabled: true,
        enabledAt: new Date(),
      },
    });
  }

  console.log("✅ Seed completato");
  console.log("Email: admin@nexuserp.local");
  console.log("Password: Admin123!");
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
