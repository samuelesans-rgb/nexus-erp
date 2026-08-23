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
  [MODULE_CODES.CORE_LOCATIONS, "Sedi", "CORE", true, "AVAILABLE"],
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
    "AVAILABLE",
  ],
  [MODULE_CODES.CORE_AUDIT, "Audit minimo", "CORE", true, "PLANNED"],
  [
    MODULE_CODES.CORE_NOTIFICATIONS,
    "Notifiche di sistema",
    "CORE",
    true,
    "AVAILABLE",
  ],
  [MODULE_CODES.CORE_DASHBOARD, "Dashboard base", "CORE", true, "AVAILABLE"],
  [MODULE_CODES.CORE_PRODUCTS, "Prodotti e servizi", "SHARED", false, "AVAILABLE"],
  [MODULE_CODES.CORE_PRICE_LISTS, "Listini", "SHARED", false, "AVAILABLE"],
  [MODULE_CODES.CORE_SALES, "Vendite", "SHARED", false, "AVAILABLE"],
  [MODULE_CODES.CORE_PURCHASES, "Acquisti", "SHARED", false, "AVAILABLE"],
  [MODULE_CODES.CORE_INVENTORY, "Magazzino", "SHARED", false, "AVAILABLE"],
  [MODULE_CODES.CORE_PAYMENTS, "Pagamenti", "SHARED", false, "AVAILABLE"],
  [MODULE_CODES.CORE_TREASURY, "Tesoreria", "SHARED", false, "AVAILABLE"],
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
  [MODULE_CODES.CORE_CRM, "CRM", "SHARED", false, "AVAILABLE"],
  [
    MODULE_CODES.RESTAURANT_RESERVATIONS,
    "Prenotazioni ristorante",
    "RESTAURANT",
    false,
    "AVAILABLE",
  ],
  [MODULE_CODES.RESTAURANT_MENU, "Menu", "RESTAURANT", false, "AVAILABLE"],
  [
    MODULE_CODES.RESTAURANT_RECIPES,
    "Ricette e food cost",
    "RESTAURANT",
    false,
    "AVAILABLE",
  ],
  [
    MODULE_CODES.RESTAURANT_FLOOR,
    "Sala e comande",
    "RESTAURANT",
    false,
    "AVAILABLE",
  ],
  [MODULE_CODES.RESTAURANT_KITCHEN, "Cucina", "RESTAURANT", false, "AVAILABLE"],
  [MODULE_CODES.RESTAURANT_POS, "Cassa e POS", "RESTAURANT", false, "AVAILABLE"],
  [
    MODULE_CODES.RESTAURANT_FOOD_INVENTORY,
    "Magazzino alimentare",
    "RESTAURANT",
    false,
    "AVAILABLE",
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

  for (const [code, name] of [["ADMIN", "Administrator"], ["MANAGER", "Manager"], ["SALES", "Sales operator"], ["ACCOUNTANT", "Accountant"], ["WAREHOUSE", "Warehouse operator"]] as const) {
    await prisma.role.upsert({ where: { code }, update: { name }, create: { code, name } });
  }

  for (const [code, name, category, mandatory, status] of moduleDefinitions) {
    await prisma.moduleDefinition.upsert({
      where: { code },
      update: { name, category, mandatory, status },
      create: { code, name, category, mandatory, status },
    });
  }

  const defaultModules = await prisma.moduleDefinition.findMany({
    where: {
      OR: [
        { mandatory: true },
        { status: "AVAILABLE", category: "CORE" },
        { code: { in: [MODULE_CODES.CORE_PRODUCTS, MODULE_CODES.CORE_PRICE_LISTS, MODULE_CODES.CORE_PAYMENTS, MODULE_CODES.CORE_INVENTORY, MODULE_CODES.CORE_SALES, MODULE_CODES.CORE_PURCHASES, MODULE_CODES.CORE_TREASURY, MODULE_CODES.RESTAURANT_RESERVATIONS, MODULE_CODES.RESTAURANT_MENU, MODULE_CODES.RESTAURANT_RECIPES, MODULE_CODES.RESTAURANT_FLOOR, MODULE_CODES.RESTAURANT_KITCHEN, MODULE_CODES.RESTAURANT_POS, MODULE_CODES.RESTAURANT_FOOD_INVENTORY] } },
      ],
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

  const defaultPaymentMethod = await prisma.paymentMethod.upsert({
    where: { companyId_code: { companyId: company.id, code: "BONIFICO" } },
    update: { name: "Bonifico bancario", active: true, deletedAt: null, updatedById: user.id },
    create: { companyId: company.id, code: "BONIFICO", name: "Bonifico bancario", description: "Pagamento tramite bonifico bancario.", createdById: user.id, updatedById: user.id },
  });
  await prisma.paymentMethod.upsert({
    where: { companyId_code: { companyId: company.id, code: "CARTA" } },
    update: { name: "Carta", active: true, deletedAt: null, updatedById: user.id },
    create: { companyId: company.id, code: "CARTA", name: "Carta", createdById: user.id, updatedById: user.id },
  });
  const defaultPaymentTerm = await prisma.paymentTerm.upsert({
    where: { companyId_code: { companyId: company.id, code: "30DF" } },
    update: { name: "30 giorni data fattura", dueDays: 30, active: true, deletedAt: null, updatedById: user.id },
    create: { companyId: company.id, code: "30DF", name: "30 giorni data fattura", dueDays: 30, createdById: user.id, updatedById: user.id },
  });
  for (const [code, name, dueDays, endOfMonth] of [["IMMEDIATO", "Pagamento immediato", 0, false], ["60DF", "60 giorni data fattura", 60, false], ["90DF", "90 giorni data fattura", 90, false], ["30FM", "30 giorni fine mese", 30, true]] as const) {
    await prisma.paymentTerm.upsert({ where: { companyId_code: { companyId: company.id, code } }, update: { name, dueDays, endOfMonth, active: true, deletedAt: null, updatedById: user.id }, create: { companyId: company.id, code, name, dueDays, endOfMonth, createdById: user.id, updatedById: user.id } });
  }
  await prisma.paymentTerm.upsert({ where: { companyId_code: { companyId: company.id, code: "RATA-30-60-90" } }, update: { installments: [{ days: 30, percentage: 34 }, { days: 60, percentage: 33 }, { days: 90, percentage: 33 }], active: true, deletedAt: null, updatedById: user.id }, create: { companyId: company.id, code: "RATA-30-60-90", name: "Tre rate 30/60/90", installments: [{ days: 30, percentage: 34 }, { days: 60, percentage: 33 }, { days: 90, percentage: 33 }], createdById: user.id, updatedById: user.id } });
  const defaultPriceList = await prisma.priceList.upsert({
    where: { companyId_code: { companyId: company.id, code: "STANDARD" } },
    update: { name: "Listino standard", active: true, deletedAt: null, updatedById: user.id },
    create: { companyId: company.id, code: "STANDARD", name: "Listino standard", currency: "EUR", createdById: user.id, updatedById: user.id },
  });

  const demoCustomer = await prisma.partner.upsert({
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
      priceListId: defaultPriceList.id,
      paymentMethodId: defaultPaymentMethod.id,
      paymentTermId: defaultPaymentTerm.id,
      createdById: user.id,
      updatedById: user.id,
    },
  });

  const demoSupplier = await prisma.partner.upsert({
    where: { companyId_code: { companyId: company.id, code: "DEMO-SUP-001" } },
    update: { active: true, deletedAt: null, isSupplier: true, paymentMethodId: defaultPaymentMethod.id, paymentTermId: defaultPaymentTerm.id, updatedById: user.id },
    create: { companyId: company.id, code: "DEMO-SUP-001", type: "COMPANY", status: "ACTIVE", name: "Forniture Nexus Demo", legalName: "Forniture Nexus Demo S.r.l.", displayName: "Forniture Nexus Demo", vatNumber: "IT22222222222", email: "ordini@forniture-demo.local", isSupplier: true, paymentMethodId: defaultPaymentMethod.id, paymentTermId: defaultPaymentTerm.id, createdById: user.id, updatedById: user.id },
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
      update: { name, active: true, deletedAt: null, updatedById: user.id },
      create: { companyId: company.id, code, name, createdById: user.id, updatedById: user.id },
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
      update: { name, symbol, precision, active: true, deletedAt: null, updatedById: user.id },
      create: { companyId: company.id, code, name, symbol, precision, createdById: user.id, updatedById: user.id },
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
      update: { name, percentage, natureCode, active: true, deletedAt: null, updatedById: user.id },
      create: { companyId: company.id, code, name, percentage, natureCode, createdById: user.id, updatedById: user.id },
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
    update: { stockManaged: true, trackLots: true, trackExpiration: true },
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
      trackLots: true,
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

  for (const [itemId, price] of [[product.id, "3.00"], [service.id, "60.00"], [recipe.id, "8.00"], [beautyService.id, "55.00"], [hotelRoom.id, "140.00"], [packageItem.id, "150.00"], [giftCard.id, "50.00"]] as const) {
    await prisma.priceListItem.upsert({ where: { companyId_priceListId_itemId: { companyId: company.id, priceListId: defaultPriceList.id, itemId } }, update: { price, active: true, deletedAt: null, updatedById: user.id }, create: { companyId: company.id, priceListId: defaultPriceList.id, itemId, price, createdById: user.id, updatedById: user.id } });
  }

  const location = await prisma.location.upsert({
    where: { companyId_code: { companyId: company.id, code: "MAIN" } },
    update: { name: "Sede principale", email: "ristorante@nexuserp.local", phone: "+39 02 000000", city: "Milano", country: "IT", timezone: "Europe/Rome", currency: "EUR", isHeadquarters: true, active: true, deletedAt: null, createdById: user.id, updatedById: user.id },
    create: { companyId: company.id, slug: "sede-principale", code: "MAIN", name: "Sede principale", email: "ristorante@nexuserp.local", phone: "+39 02 000000", city: "Milano", country: "IT", timezone: "Europe/Rome", currency: "EUR", isHeadquarters: true, createdById: user.id, updatedById: user.id },
  });
  const memberships = await prisma.membership.findMany({ where: { companyId: company.id }, select: { id: true } });
  await prisma.membershipLocation.createMany({ data: memberships.map(({ id: membershipId }) => ({ companyId: company.id, membershipId, locationId: location.id })), skipDuplicates: true });
  await prisma.membership.updateMany({ where: { companyId: company.id, defaultLocationId: null }, data: { defaultLocationId: location.id } });
  const mainWarehouse = await prisma.warehouse.upsert({
    where: { companyId_code: { companyId: company.id, code: "MAIN" } },
    update: { name: "Magazzino principale", locationId: location.id, active: true, deletedAt: null, updatedById: user.id },
    create: { companyId: company.id, locationId: location.id, code: "MAIN", name: "Magazzino principale", createdById: user.id, updatedById: user.id },
  });
  const secondaryWarehouse = await prisma.warehouse.upsert({
    where: { companyId_code: { companyId: company.id, code: "SECONDARY" } },
    update: { name: "Magazzino secondario", locationId: location.id, active: true, deletedAt: null, updatedById: user.id },
    create: { companyId: company.id, locationId: location.id, code: "SECONDARY", name: "Magazzino secondario", createdById: user.id, updatedById: user.id },
  });
  const bins = new Map<string, string>();
  for (const [warehouseId, code, name] of [[mainWarehouse.id, "RECEIVING", "Ricevimento"], [mainWarehouse.id, "STORAGE", "Stoccaggio"], [mainWarehouse.id, "OUTBOUND", "Uscita"], [secondaryWarehouse.id, "STORAGE", "Stoccaggio"]] as const) {
    const bin = await prisma.warehouseBin.upsert({ where: { companyId_warehouseId_code: { companyId: company.id, warehouseId, code } }, update: { name, active: true, deletedAt: null }, create: { companyId: company.id, warehouseId, code, name } });
    bins.set(`${warehouseId}:${code}`, bin.id);
  }

  const sala = await prisma.restaurantArea.upsert({ where: { companyId_locationId_code: { companyId: company.id, locationId: location.id, code: "SALA" } }, update: { name: "Sala", active: true, deletedAt: null }, create: { companyId: company.id, locationId: location.id, code: "SALA", name: "Sala", createdById: user.id, updatedById: user.id } });
  const dehors = await prisma.restaurantArea.upsert({ where: { companyId_locationId_code: { companyId: company.id, locationId: location.id, code: "DEHORS" } }, update: { name: "Dehors", active: true, deletedAt: null }, create: { companyId: company.id, locationId: location.id, code: "DEHORS", name: "Dehors", sortOrder: 10, createdById: user.id, updatedById: user.id } });
  const restaurantTables = [];
  for (let index = 1; index <= 8; index++) restaurantTables.push(await prisma.restaurantTable.upsert({ where: { companyId_locationId_code: { companyId: company.id, locationId: location.id, code: `T${index}` } }, update: { name: `Tavolo ${index}`, active: true, deletedAt: null }, create: { companyId: company.id, locationId: location.id, areaId: index <= 6 ? sala.id : dehors.id, code: `T${index}`, name: `Tavolo ${index}`, seats: index % 3 === 0 ? 6 : 4 } }));
  const kitchen = await prisma.kitchenStation.upsert({ where: { companyId_locationId_code: { companyId: company.id, locationId: location.id, code: "CUCINA" } }, update: { name: "Cucina", active: true }, create: { companyId: company.id, locationId: location.id, code: "CUCINA", name: "Cucina" } });
  await prisma.kitchenStation.upsert({ where: { companyId_locationId_code: { companyId: company.id, locationId: location.id, code: "BAR" } }, update: { name: "Bar", active: true }, create: { companyId: company.id, locationId: location.id, code: "BAR", name: "Bar", sortOrder: 10 } });
  await prisma.kitchenStationAssignment.upsert({ where: { id: "demo-restaurant-station-recipe" }, update: { active: true }, create: { id: "demo-restaurant-station-recipe", companyId: company.id, kitchenStationId: kitchen.id, itemId: recipe.id, priority: 100 } });
  const menu = await prisma.restaurantMenu.upsert({ where: { companyId_code: { companyId: company.id, code: "PRINCIPALE" } }, update: { locationId: location.id, name: "Menu principale", active: true, deletedAt: null }, create: { companyId: company.id, locationId: location.id, code: "PRINCIPALE", name: "Menu principale" } });
  for (const [id, name, sortOrder] of [["demo-menu-antipasti", "Antipasti", 10], ["demo-menu-primi", "Primi", 20], ["demo-menu-secondi", "Secondi", 30], ["demo-menu-bevande", "Bevande", 40], ["demo-menu-dolci", "Dolci", 50]] as const) await prisma.restaurantMenuSection.upsert({ where: { id }, update: { name, sortOrder, active: true }, create: { id, companyId: company.id, menuId: menu.id, name, sortOrder } });
  await prisma.restaurantMenuItem.upsert({ where: { companyId_menuSectionId_itemId: { companyId: company.id, menuSectionId: "demo-menu-primi", itemId: recipe.id } }, update: { available: true, priceOverride: 8 }, create: { companyId: company.id, menuSectionId: "demo-menu-primi", itemId: recipe.id, priceOverride: 8 } });
  await prisma.restaurantBookingSettings.upsert({ where: { companyId_locationId: { companyId: company.id, locationId: location.id } }, update: { internalNotificationEmail: "booking@nexuserp.local" }, create: { companyId: company.id, locationId: location.id, openingHours: { "0": [["12:00", "23:00"]], "1": [["12:00", "15:00"], ["19:00", "23:00"]], "2": [["12:00", "15:00"], ["19:00", "23:00"]], "3": [["12:00", "15:00"], ["19:00", "23:00"]], "4": [["12:00", "15:00"], ["19:00", "23:00"]], "5": [["12:00", "15:00"], ["19:00", "23:00"]], "6": [["12:00", "23:00"]] }, minAdvanceMinutes: 0, defaultDurationMinutes: 120, slotIntervalMinutes: 30, internalNotificationEmail: "booking@nexuserp.local" } });
  await prisma.restaurantReservation.upsert({ where: { companyId_code: { companyId: company.id, code: "RES-DEMO-001" } }, update: {}, create: { companyId: company.id, locationId: location.id, code: "RES-DEMO-001", partnerId: demoCustomer.id, guestName: "Cliente Demo", reservationDate: new Date(), startTime: new Date(Date.now() + 3600000), durationMinutes: 120, partySize: 4, status: "CONFIRMED", source: "PHONE", createdById: user.id, updatedById: user.id, tables: { create: { tableId: restaurantTables[0].id } } } });
  await prisma.restaurantOrder.upsert({ where: { companyId_locationId_code: { companyId: company.id, locationId: location.id, code: "ORD-DEMO-REST" } }, update: {}, create: { companyId: company.id, locationId: location.id, code: "ORD-DEMO-REST", tableId: restaurantTables[1].id, partnerId: demoCustomer.id, guestCount: 2, createdById: user.id, updatedById: user.id, lines: { create: { locationId: location.id, itemId: recipe.id, quantity: 2, unitPrice: 8, vatRateId: vatRates.get("IVA10") ?? vatRates.get("IVA22")! } } } });
  const expirationDate = new Date(); expirationDate.setDate(expirationDate.getDate() + 20);
  const demoLot = await prisma.inventoryLot.upsert({
    where: { companyId_itemId_lotNumber: { companyId: company.id, itemId: ingredient.id, lotNumber: "DEMO-LOT-001" } },
    update: { locationId: location.id, expirationDate, active: true },
    create: { companyId: company.id, locationId: location.id, itemId: ingredient.id, lotNumber: "DEMO-LOT-001", expirationDate },
  });
  for (const entry of [
    { referenceId: "DEMO-OPEN-PRODUCT", itemId: product.id, unitOfMeasureId: units.get("PZ")!, binId: bins.get(`${mainWarehouse.id}:STORAGE`), quantity: 48, cost: 0.55, lotId: null },
    { referenceId: "DEMO-OPEN-INGREDIENT", itemId: ingredient.id, unitOfMeasureId: units.get("KG")!, binId: bins.get(`${mainWarehouse.id}:STORAGE`), quantity: 20, cost: 2.2, lotId: demoLot.id },
  ]) {
    const existing = await prisma.inventoryMovement.findFirst({ where: { companyId: company.id, referenceType: "SEED", referenceId: entry.referenceId }, select: { id: true } });
    if (!existing) {
      const postedAt = new Date();
      const movement = await prisma.inventoryMovement.create({ data: { companyId: company.id, locationId: location.id, warehouseId: mainWarehouse.id, binId: entry.binId, itemId: entry.itemId, movementType: "OPENING", quantity: entry.quantity, direction: 1, unitOfMeasureId: entry.unitOfMeasureId, lotId: entry.lotId, unitCost: entry.cost, totalCost: entry.quantity * entry.cost, referenceType: "SEED", referenceId: entry.referenceId, reason: "Apertura demo", occurredAt: postedAt, postedAt, postedById: user.id } });
      await prisma.stockBalance.upsert({ where: { companyId_warehouseId_itemId: { companyId: company.id, warehouseId: mainWarehouse.id, itemId: entry.itemId } }, update: { locationId: location.id, quantity: entry.quantity, averageCost: entry.cost, stockValue: entry.quantity * entry.cost }, create: { companyId: company.id, locationId: location.id, warehouseId: mainWarehouse.id, itemId: entry.itemId, quantity: entry.quantity, averageCost: entry.cost, stockValue: entry.quantity * entry.cost } });
      await prisma.domainEvent.create({ data: { companyId: company.id, eventType: "InventoryMovementPosted", aggregateType: "InventoryMovement", aggregateId: movement.id, payload: { source: "seed", movementId: movement.id }, occurredAt: new Date() } });
    }
  }

  const seriesSeeds = [
    ["DEMO", "Serie demo", "QUOTE", "DEMO-"],
    ["FATTURE", "Serie fatture", "SALES_INVOICE", "FT-"],
    ["RIST-CONTO", "Conto Restaurant non fiscale", "SALES_RECEIPT", "RC-"],
    ["ORDINI", "Serie ordini", "SALES_ORDER", "ORD-"],
    ["PREVENTIVI", "Serie preventivi", "QUOTE", "PREV-"],
    ["DDT", "Serie DDT", "DELIVERY_NOTE", "DDT-"],
    ["ORD-FORN", "Ordini fornitori", "PURCHASE_ORDER", "OF-"],
    ["RICEV", "Ricevimenti fornitori", "GOODS_RECEIPT", "RCV-"],
    ["FATT-PASS", "Fatture passive", "PURCHASE_INVOICE", "FP-"],
    ["RESI-FORN", "Resi fornitori", "RETURN", "RF-"],
    ["NC-FORN", "Note credito fornitori", "CREDIT_NOTE", "NCF-"],
  ] as const;
  const documentSeries = new Map<string, { id: string; nextNumber: number }>();
  for (const [code, name, documentType, prefix] of seriesSeeds) {
    const series = await prisma.documentSeries.upsert({ where: { companyId_code: { companyId: company.id, code } }, update: { locationId: location.id, name, documentType, prefix, active: true }, create: { companyId: company.id, locationId: location.id, code, name, documentType, prefix }, select: { id: true, nextNumber: true } });
    documentSeries.set(code, series);
  }
  const demoSeries = documentSeries.get("DEMO")!;
  const demoDocumentNumber = "DEMO-000001";
  const existingDocument = await prisma.businessDocument.findFirst({ where: { companyId: company.id, seriesId: demoSeries.id, documentNumber: demoDocumentNumber }, select: { id: true } });
  if (!existingDocument) {
    const document = await prisma.businessDocument.create({ data: { companyId: company.id, seriesId: demoSeries.id, documentNumber: demoDocumentNumber, documentType: "QUOTE", status: "DRAFT", partnerId: demoCustomer.id, documentDate: new Date(), currency: "EUR", exchangeRate: 1, warehouseId: mainWarehouse.id, locationId: location.id, paymentMethodId: defaultPaymentMethod.id, paymentTermId: defaultPaymentTerm.id, priceListId: defaultPriceList.id, subtotal: 30, discount: 0, tax: 6.6, total: 36.6, notes: "Documento Draft dimostrativo", createdById: user.id, updatedById: user.id, lines: { create: [{ lineNumber: 1, itemId: product.id, description: product.name, quantity: 10, unitOfMeasureId: units.get("PZ")!, unitPrice: 3, discount: 0, vatRateId: vatRates.get("IVA22")!, lineTotal: 30, warehouseId: mainWarehouse.id }] } }, select: { id: true } });
    await prisma.documentSeries.update({ where: { id: demoSeries.id }, data: { nextNumber: { set: Math.max(demoSeries.nextNumber, 2) } } });
    await prisma.documentEvent.create({ data: { companyId: company.id, documentId: document.id, eventType: "DocumentCreated", toStatus: "DRAFT", payload: { source: "seed" }, createdById: user.id } });
    await prisma.domainEvent.create({ data: { companyId: company.id, eventType: "DocumentCreated", aggregateType: "BusinessDocument", aggregateId: document.id, payload: { source: "seed", documentId: document.id }, occurredAt: new Date() } });
  }

  const salesDemo = async (seriesCode: string, documentNumber: string, documentType: "QUOTE" | "SALES_ORDER" | "DELIVERY_NOTE" | "SALES_INVOICE", status: "CONFIRMED" | "POSTED") => {
    const series = documentSeries.get(seriesCode)!;
    const existing = await prisma.businessDocument.findFirst({ where: { companyId: company.id, seriesId: series.id, documentNumber }, select: { id: true } });
    if (existing) return existing;
    const document = await prisma.businessDocument.create({ data: { companyId: company.id, seriesId: series.id, documentNumber, documentType, status, partnerId: demoCustomer.id, documentDate: new Date(), postingDate: status === "POSTED" ? new Date() : null, currency: "EUR", exchangeRate: 1, warehouseId: mainWarehouse.id, locationId: location.id, paymentMethodId: defaultPaymentMethod.id, paymentTermId: defaultPaymentTerm.id, priceListId: defaultPriceList.id, subtotal: 30, tax: 6.6, total: 36.6, notes: "Ciclo Sales demo", createdById: user.id, updatedById: user.id, lines: { create: [{ lineNumber: 1, itemId: product.id, description: product.name, quantity: 10, unitOfMeasureId: units.get("PZ")!, unitPrice: 3, vatRateId: vatRates.get("IVA22")!, lineTotal: 30, warehouseId: mainWarehouse.id }] } }, select: { id: true } });
    await prisma.domainEvent.create({ data: { companyId: company.id, eventType: documentType === "QUOTE" ? "QuoteCreated" : documentType === "SALES_ORDER" ? "OrderCreated" : documentType === "DELIVERY_NOTE" ? "DeliveryCreated" : "InvoiceCreated", aggregateType: "BusinessDocument", aggregateId: document.id, payload: { source: "seed", documentId: document.id }, occurredAt: new Date() } });
    return document;
  };
  const demoQuote = await salesDemo("PREVENTIVI", "PREV-DEMO-001", "QUOTE", "CONFIRMED");
  const demoOrder = await salesDemo("ORDINI", "ORD-DEMO-001", "SALES_ORDER", "CONFIRMED");
  const demoDelivery = await salesDemo("DDT", "DDT-DEMO-001", "DELIVERY_NOTE", "POSTED");
  const demoInvoice = await salesDemo("FATTURE", "FT-DEMO-001", "SALES_INVOICE", "POSTED");
  for (const [sourceDocumentId, targetDocumentId, linkType] of [[demoQuote.id, demoOrder.id, "QUOTE_TO_ORDER"], [demoOrder.id, demoDelivery.id, "ORDER_TO_DDT"], [demoDelivery.id, demoInvoice.id, "DDT_TO_INVOICE"]] as const) {
    await prisma.documentLink.upsert({ where: { companyId_sourceDocumentId_targetDocumentId_linkType: { companyId: company.id, sourceDocumentId, targetDocumentId, linkType } }, update: {}, create: { companyId: company.id, sourceDocumentId, targetDocumentId, linkType, createdById: user.id } });
  }

  const purchaseDemo = async (seriesCode: string, documentNumber: string, documentType: "PURCHASE_ORDER" | "GOODS_RECEIPT" | "PURCHASE_INVOICE", status: "CONFIRMED" | "POSTED") => {
    const series = documentSeries.get(seriesCode)!; const existing = await prisma.businessDocument.findFirst({ where: { companyId: company.id, seriesId: series.id, documentNumber }, select: { id: true } }); if (existing) return existing;
    const document = await prisma.businessDocument.create({ data: { companyId: company.id, seriesId: series.id, documentNumber, documentType, status, partnerId: demoSupplier.id, documentDate: new Date(), postingDate: status === "POSTED" ? new Date() : null, currency: "EUR", exchangeRate: 1, warehouseId: mainWarehouse.id, locationId: location.id, paymentMethodId: defaultPaymentMethod.id, paymentTermId: defaultPaymentTerm.id, subtotal: 5.5, tax: 1.21, total: 6.71, notes: "Ciclo Purchasing demo", createdById: user.id, updatedById: user.id, lines: { create: [{ lineNumber: 1, itemId: product.id, description: product.name, quantity: 10, unitOfMeasureId: units.get("PZ")!, unitPrice: 0.55, vatRateId: vatRates.get("IVA22")!, lineTotal: 5.5, warehouseId: mainWarehouse.id }] } }, select: { id: true } });
    await prisma.domainEvent.create({ data: { companyId: company.id, eventType: documentType === "PURCHASE_ORDER" ? "PurchaseOrderCreated" : documentType === "GOODS_RECEIPT" ? "GoodsReceiptCreated" : "PurchaseInvoiceCreated", aggregateType: "BusinessDocument", aggregateId: document.id, payload: { source: "seed", documentId: document.id }, occurredAt: new Date() } }); return document;
  };
  const demoPurchaseOrder = await purchaseDemo("ORD-FORN", "OF-DEMO-001", "PURCHASE_ORDER", "CONFIRMED");
  const demoReceipt = await purchaseDemo("RICEV", "RCV-DEMO-001", "GOODS_RECEIPT", "POSTED");
  const demoPurchaseInvoice = await purchaseDemo("FATT-PASS", "FP-DEMO-001", "PURCHASE_INVOICE", "POSTED");
  for (const [sourceDocumentId, targetDocumentId, linkType] of [[demoPurchaseOrder.id, demoReceipt.id, "PURCHASE_ORDER_TO_RECEIPT"], [demoReceipt.id, demoPurchaseInvoice.id, "RECEIPT_TO_PURCHASE_INVOICE"]] as const) await prisma.documentLink.upsert({ where: { companyId_sourceDocumentId_targetDocumentId_linkType: { companyId: company.id, sourceDocumentId, targetDocumentId, linkType } }, update: {}, create: { companyId: company.id, sourceDocumentId, targetDocumentId, linkType, createdById: user.id } });

  const bankAccount = await prisma.financialAccount.upsert({ where: { companyId_code: { companyId: company.id, code: "BANCA" } }, update: { locationId: location.id, name: "Banca principale", active: true, deletedAt: null, updatedById: user.id }, create: { companyId: company.id, locationId: location.id, code: "BANCA", name: "Banca principale", type: "BANK", currency: "EUR", bankName: "Banca Demo", iban: "IT60X0542811101000000123456", openingBalance: 10000, createdById: user.id, updatedById: user.id } });
  const cashAccount = await prisma.financialAccount.upsert({ where: { companyId_code: { companyId: company.id, code: "CASSA" } }, update: { locationId: location.id, name: "Cassa principale", active: true, deletedAt: null, updatedById: user.id }, create: { companyId: company.id, locationId: location.id, code: "CASSA", name: "Cassa principale", type: "CASH", currency: "EUR", openingBalance: 500, createdById: user.id, updatedById: user.id } });
  await prisma.financialAccount.upsert({ where: { companyId_code: { companyId: company.id, code: "CARTA" } }, update: { locationId: location.id, name: "Carta aziendale", active: true, deletedAt: null, updatedById: user.id }, create: { companyId: company.id, locationId: location.id, code: "CARTA", name: "Carta aziendale", type: "CARD", currency: "EUR", openingBalance: 0, allowOverdraft: true, createdById: user.id, updatedById: user.id } });
  const dueDate = new Date(); dueDate.setDate(dueDate.getDate() + 30);
  const receivable = await prisma.paymentSchedule.upsert({ where: { companyId_documentId_installmentNumber: { companyId: company.id, documentId: demoInvoice.id, installmentNumber: 1 } }, update: {}, create: { companyId: company.id, locationId: location.id, partnerId: demoCustomer.id, documentId: demoInvoice.id, installmentNumber: 1, documentType: "SALES_INVOICE", direction: "RECEIVABLE", dueDate, amount: 36.6, residualAmount: 16.6, status: "PARTIALLY_PAID", currency: "EUR", paymentMethodId: defaultPaymentMethod.id, paymentTermId: defaultPaymentTerm.id, createdById: user.id, updatedById: user.id } });
  const payable = await prisma.paymentSchedule.upsert({ where: { companyId_documentId_installmentNumber: { companyId: company.id, documentId: demoPurchaseInvoice.id, installmentNumber: 1 } }, update: {}, create: { companyId: company.id, locationId: location.id, partnerId: demoSupplier.id, documentId: demoPurchaseInvoice.id, installmentNumber: 1, documentType: "PURCHASE_INVOICE", direction: "PAYABLE", dueDate, amount: 6.71, residualAmount: 0, status: "PAID", currency: "EUR", paymentMethodId: defaultPaymentMethod.id, paymentTermId: defaultPaymentTerm.id, createdById: user.id, updatedById: user.id } });
  const receiptMovement = await prisma.financialMovement.upsert({ where: { id: "demo-treasury-customer-receipt" }, update: {}, create: { id: "demo-treasury-customer-receipt", companyId: company.id, locationId: location.id, financialAccountId: bankAccount.id, partnerId: demoCustomer.id, paymentScheduleId: receivable.id, documentId: demoInvoice.id, movementType: "CUSTOMER_RECEIPT", direction: "IN", amount: 20, currency: "EUR", occurredAt: new Date(), reference: "INC-DEMO-001", postedById: user.id } });
  await prisma.financialAllocation.upsert({ where: { companyId_movementId_scheduleId: { companyId: company.id, movementId: receiptMovement.id, scheduleId: receivable.id } }, update: {}, create: { companyId: company.id, locationId: location.id, movementId: receiptMovement.id, scheduleId: receivable.id, amount: 20 } });
  const supplierPayment = await prisma.financialMovement.upsert({ where: { id: "demo-treasury-supplier-payment" }, update: {}, create: { id: "demo-treasury-supplier-payment", companyId: company.id, locationId: location.id, financialAccountId: bankAccount.id, partnerId: demoSupplier.id, paymentScheduleId: payable.id, documentId: demoPurchaseInvoice.id, movementType: "SUPPLIER_PAYMENT", direction: "OUT", amount: 6.71, currency: "EUR", occurredAt: new Date(), reference: "PAG-DEMO-001", postedById: user.id } });
  await prisma.financialAllocation.upsert({ where: { companyId_movementId_scheduleId: { companyId: company.id, movementId: supplierPayment.id, scheduleId: payable.id } }, update: {}, create: { companyId: company.id, locationId: location.id, movementId: supplierPayment.id, scheduleId: payable.id, amount: 6.71 } });
  const transfer = await prisma.financialTransfer.upsert({ where: { id: "demo-treasury-transfer" }, update: {}, create: { id: "demo-treasury-transfer", companyId: company.id, locationId: location.id, sourceAccountId: bankAccount.id, destinationAccountId: cashAccount.id, amount: 100, currency: "EUR", transferDate: new Date(), status: "COMPLETED", createdById: user.id, completedById: user.id, completedAt: new Date() } });
  await prisma.financialMovement.upsert({ where: { id: "demo-treasury-transfer-out" }, update: {}, create: { id: "demo-treasury-transfer-out", companyId: company.id, locationId: location.id, financialAccountId: bankAccount.id, movementType: "TRANSFER_OUT", direction: "OUT", amount: transfer.amount, currency: "EUR", occurredAt: transfer.transferDate, reference: `Transfer:${transfer.id}`, postedById: user.id } });
  await prisma.financialMovement.upsert({ where: { id: "demo-treasury-transfer-in" }, update: {}, create: { id: "demo-treasury-transfer-in", companyId: company.id, locationId: location.id, financialAccountId: cashAccount.id, movementType: "TRANSFER_IN", direction: "IN", amount: transfer.amount, currency: "EUR", occurredAt: transfer.transferDate, reference: `Transfer:${transfer.id}`, postedById: user.id } });
  const statementDate = new Date(); statementDate.setHours(0, 0, 0, 0);
  const statement = await prisma.bankStatement.upsert({ where: { companyId_financialAccountId_statementDate: { companyId: company.id, financialAccountId: bankAccount.id, statementDate } }, update: {}, create: { companyId: company.id, locationId: location.id, financialAccountId: bankAccount.id, statementDate, openingBalance: 10000, closingBalance: 9913.29, status: "RECONCILED" } });
  await prisma.bankStatementLine.upsert({ where: { id: "demo-treasury-statement-line" }, update: {}, create: { id: "demo-treasury-statement-line", companyId: company.id, locationId: location.id, bankStatementId: statement.id, transactionDate: new Date(), amount: 20, description: "Incasso cliente demo", reference: "INC-DEMO-001", matchedMovementId: receiptMovement.id, reconciliationStatus: "MATCHED" } });

  console.log("✅ Seed completato");
  console.log("Email: admin@nexuserp.local");
  console.log("Password: Admin123!");
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(async () => {
    await prisma.$disconnect();
  });
