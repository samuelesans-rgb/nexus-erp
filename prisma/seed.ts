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
  [MODULE_CODES.CORE_PRODUCTS, "Prodotti e servizi", "SHARED", false, "AVAILABLE"],
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

  await prisma.partner.upsert({
    where: {
      companyId_code: {
        companyId: company.id,
        code: "DEMO-CUST-001",
      },
    },
    update: {},
    create: {
      companyId: company.id,
      code: "DEMO-CUST-001",
      type: "COMPANY",
      status: "ACTIVE",
      name: "Trattoria Demo",
      legalName: "Trattoria Demo S.r.l.",
      displayName: "Trattoria Demo",
      vatNumber: "IT11111111111",
      email: "amministrazione@trattoria-demo.local",
      phone: "+39 06 0000001",
      city: "Roma",
      country: "Italia",
      category: "Ristorazione",
      isCustomer: true,
      isProspect: true,
      paymentMethod: "Bonifico bancario",
      paymentTerms: "30 giorni data fattura",
      createdById: user.id,
      updatedById: user.id,
    },
  });

  await prisma.partner.upsert({
    where: {
      companyId_code: {
        companyId: company.id,
        code: "DEMO-PERS-001",
      },
    },
    update: {},
    create: {
      companyId: company.id,
      code: "DEMO-PERS-001",
      type: "PERSON",
      status: "ACTIVE",
      name: "Giulia Bianchi",
      firstName: "Giulia",
      lastName: "Bianchi",
      displayName: "Giulia Bianchi",
      email: "giulia.bianchi@example.local",
      mobile: "+39 333 0000001",
      city: "Milano",
      country: "Italia",
      category: "Professionisti",
      isProfessional: true,
      isLead: true,
      createdById: user.id,
      updatedById: user.id,
    },
  });

  const categorySeeds = [
    ["GENERALE", "Generale"],
    ["RISTORAZIONE", "Ristorazione"],
    ["SERVIZI", "Servizi"],
    ["OSPITALITA", "Ospitalità"],
  ] as const;
  const categories = new Map<string, string>();
  for (const [code, name] of categorySeeds) {
    const category = await prisma.itemCategory.upsert({
      where: { companyId_code: { companyId: company.id, code } },
      update: { name, active: true, deletedAt: null },
      create: { companyId: company.id, code, name },
      select: { id: true },
    });
    categories.set(code, category.id);
  }

  const unitSeeds = [
    ["PZ", "Pezzo", "pz", 0],
    ["KG", "Chilogrammo", "kg", 3],
    ["G", "Grammo", "g", 0],
    ["L", "Litro", "l", 3],
    ["ML", "Millilitro", "ml", 0],
    ["H", "Ora", "h", 2],
    ["MIN", "Minuto", "min", 0],
    ["NOTTE", "Notte", "notte", 0],
  ] as const;
  const units = new Map<string, string>();
  for (const [code, name, symbol, precision] of unitSeeds) {
    const unit = await prisma.unitOfMeasure.upsert({
      where: { companyId_code: { companyId: company.id, code } },
      update: { name, symbol, precision, active: true },
      create: { companyId: company.id, code, name, symbol, precision },
      select: { id: true },
    });
    units.set(code, unit.id);
  }

  const vatSeeds = [
    ["IVA22", "IVA ordinaria 22%", "22.00", null],
    ["IVA10", "IVA ridotta 10%", "10.00", null],
    ["IVA4", "IVA ridotta 4%", "4.00", null],
    ["N2.2", "Non soggetta", "0.00", "N2.2"],
  ] as const;
  const vatRates = new Map<string, string>();
  for (const [code, name, percentage, natureCode] of vatSeeds) {
    const vatRate = await prisma.vatRate.upsert({
      where: { companyId_code: { companyId: company.id, code } },
      update: { name, percentage, natureCode, active: true },
      create: { companyId: company.id, code, name, percentage, natureCode },
      select: { id: true },
    });
    vatRates.set(code, vatRate.id);
  }

  const product = await prisma.item.upsert({
    where: { companyId_code: { companyId: company.id, code: "DEMO-PROD-001" } },
    update: {},
    create: {
      companyId: company.id,
      code: "DEMO-PROD-001",
      type: "PRODUCT",
      name: "Acqua minerale 75 cl",
      categoryId: categories.get("GENERALE"),
      unitOfMeasureId: units.get("PZ"),
      vatRateId: vatRates.get("IVA22"),
      salePrice: "3.00",
      purchasePrice: "0.55",
      standardCost: "0.55",
      sellable: true,
      purchasable: true,
      stockManaged: true,
      createdById: user.id,
      updatedById: user.id,
    },
  });
  await prisma.productProfile.upsert({
    where: { itemId: product.id },
    update: {},
    create: {
      itemId: product.id,
      companyId: company.id,
      weight: "0.75",
      brand: "Nexus Demo",
      reorderPoint: "24",
      minimumStock: "12",
    },
  });

  const service = await prisma.item.upsert({
    where: { companyId_code: { companyId: company.id, code: "DEMO-SERV-001" } },
    update: {},
    create: {
      companyId: company.id,
      code: "DEMO-SERV-001",
      type: "SERVICE",
      name: "Consulenza iniziale",
      categoryId: categories.get("SERVIZI"),
      unitOfMeasureId: units.get("H"),
      vatRateId: vatRates.get("IVA22"),
      salePrice: "60.00",
      sellable: true,
      createdById: user.id,
      updatedById: user.id,
    },
  });
  await prisma.serviceProfile.upsert({
    where: { itemId: service.id },
    update: {},
    create: {
      itemId: service.id,
      companyId: company.id,
      durationMinutes: 60,
      requiresAppointment: true,
      defaultCapacity: 1,
    },
  });

  const ingredient = await prisma.item.upsert({
    where: { companyId_code: { companyId: company.id, code: "DEMO-ING-001" } },
    update: {},
    create: {
      companyId: company.id,
      code: "DEMO-ING-001",
      type: "INGREDIENT",
      name: "Pomodoro pelato",
      categoryId: categories.get("RISTORAZIONE"),
      unitOfMeasureId: units.get("KG"),
      vatRateId: vatRates.get("IVA4"),
      purchasePrice: "2.20",
      standardCost: "2.20",
      purchasable: true,
      stockManaged: true,
      trackExpiration: true,
      createdById: user.id,
      updatedById: user.id,
    },
  });
  await prisma.ingredientProfile.upsert({
    where: { itemId: ingredient.id },
    update: {},
    create: {
      itemId: ingredient.id,
      companyId: company.id,
      yieldPercentage: "95",
      storageInstructions: "Conservare in luogo fresco; refrigerare dopo l'apertura.",
      allergenNotes: "Nessun allergene dichiarato nell'esempio.",
      perishabilityDays: 3,
    },
  });

  const recipe = await prisma.item.upsert({
    where: { companyId_code: { companyId: company.id, code: "DEMO-RIC-001" } },
    update: {},
    create: {
      companyId: company.id,
      code: "DEMO-RIC-001",
      type: "RECIPE",
      name: "Salsa di pomodoro demo",
      categoryId: categories.get("RISTORAZIONE"),
      unitOfMeasureId: units.get("KG"),
      vatRateId: vatRates.get("IVA10"),
      salePrice: "8.00",
      sellable: true,
      createdById: user.id,
      updatedById: user.id,
    },
  });
  await prisma.recipeProfile.upsert({
    where: { itemId: recipe.id },
    update: {},
    create: {
      itemId: recipe.id,
      companyId: company.id,
      preparationMinutes: 30,
      portions: "10",
      yieldQuantity: "1",
      instructions: "Cuocere e ridurre il pomodoro.",
      foodCostTarget: "30",
    },
  });
  await prisma.recipeComponent.upsert({
    where: {
      companyId_recipeItemId_componentItemId: {
        companyId: company.id,
        recipeItemId: recipe.id,
        componentItemId: ingredient.id,
      },
    },
    update: { deletedAt: null },
    create: {
      companyId: company.id,
      recipeItemId: recipe.id,
      componentItemId: ingredient.id,
      unitOfMeasureId: units.get("KG")!,
      quantity: "1.05",
      wastePercentage: "5",
    },
  });

  const beautyService = await prisma.item.upsert({
    where: { companyId_code: { companyId: company.id, code: "DEMO-BEAUTY-001" } },
    update: {},
    create: {
      companyId: company.id,
      code: "DEMO-BEAUTY-001",
      type: "BEAUTY_SERVICE",
      name: "Trattamento viso demo",
      categoryId: categories.get("SERVIZI"),
      unitOfMeasureId: units.get("MIN"),
      vatRateId: vatRates.get("IVA22"),
      salePrice: "55.00",
      sellable: true,
      createdById: user.id,
      updatedById: user.id,
    },
  });
  await prisma.beautyServiceProfile.upsert({
    where: { itemId: beautyService.id },
    update: {},
    create: {
      itemId: beautyService.id,
      companyId: company.id,
      durationMinutes: 50,
      cleanupMinutes: 10,
      requiresCabin: true,
      requiresOperator: true,
      recommendedRepeatDays: 30,
      consentRequired: true,
    },
  });

  const hotelRoom = await prisma.item.upsert({
    where: { companyId_code: { companyId: company.id, code: "DEMO-ROOM-001" } },
    update: {},
    create: {
      companyId: company.id,
      code: "DEMO-ROOM-001",
      type: "HOTEL_ROOM",
      name: "Camera Deluxe 101",
      categoryId: categories.get("OSPITALITA"),
      unitOfMeasureId: units.get("NOTTE"),
      vatRateId: vatRates.get("IVA10"),
      salePrice: "140.00",
      sellable: true,
      createdById: user.id,
      updatedById: user.id,
    },
  });
  await prisma.hotelRoomProfile.upsert({
    where: { itemId: hotelRoom.id },
    update: {},
    create: {
      itemId: hotelRoom.id,
      companyId: company.id,
      capacityAdults: 2,
      capacityChildren: 1,
      roomTypeCode: "DELUXE",
      physicalRoomCode: "101",
      floor: "1",
      sellableUnit: true,
      housekeepingRequired: true,
    },
  });

  const packageItem = await prisma.item.upsert({
    where: { companyId_code: { companyId: company.id, code: "DEMO-PACK-001" } },
    update: {},
    create: {
      companyId: company.id,
      code: "DEMO-PACK-001",
      type: "PACKAGE",
      name: "Pacchetto consulenze demo",
      categoryId: categories.get("SERVIZI"),
      unitOfMeasureId: units.get("PZ"),
      vatRateId: vatRates.get("IVA22"),
      salePrice: "150.00",
      sellable: true,
      createdById: user.id,
      updatedById: user.id,
    },
  });
  await prisma.packageProfile.upsert({
    where: { itemId: packageItem.id },
    update: {},
    create: {
      itemId: packageItem.id,
      companyId: company.id,
      validityDays: 180,
      usageLimit: 3,
    },
  });
  await prisma.packageComponent.upsert({
    where: {
      companyId_packageItemId_componentItemId: {
        companyId: company.id,
        packageItemId: packageItem.id,
        componentItemId: service.id,
      },
    },
    update: { deletedAt: null },
    create: {
      companyId: company.id,
      packageItemId: packageItem.id,
      componentItemId: service.id,
      unitOfMeasureId: units.get("H")!,
      quantity: "3",
    },
  });

  const giftCard = await prisma.item.upsert({
    where: { companyId_code: { companyId: company.id, code: "DEMO-GIFT-001" } },
    update: {},
    create: {
      companyId: company.id,
      code: "DEMO-GIFT-001",
      type: "GIFT_CARD",
      name: "Gift card 50 euro",
      categoryId: categories.get("GENERALE"),
      unitOfMeasureId: units.get("PZ"),
      vatRateId: vatRates.get("N2.2"),
      salePrice: "50.00",
      sellable: true,
      createdById: user.id,
      updatedById: user.id,
    },
  });
  await prisma.giftCardProfile.upsert({
    where: { itemId: giftCard.id },
    update: {},
    create: {
      itemId: giftCard.id,
      companyId: company.id,
      defaultValidityDays: 365,
      fixedValue: "50.00",
      reusable: false,
      transferable: true,
    },
  });

  console.log("✅ Seed completato");
  console.log("Email: admin@nexuserp.local");
  console.log("Password: Admin123!");
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
