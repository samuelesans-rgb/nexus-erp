import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import {
  assertPartnerCapability,
  canReadPartnersCompanyWide,
  getPartnerFinancialScope,
  hasPartnerCapability,
  PARTNER_CAPABILITIES,
  PartnerAccessDeniedError,
} from "../../lib/partner-access";
import {
  getPartnerOverview,
  validatePartnerOverviewScope,
} from "../../lib/partner-overview";
import { getPartnerDetail, isValidPartnerAgent } from "../../lib/partners";
import { prisma } from "../../lib/prisma";

if (!(process.env.DATABASE_URL ?? "").includes("_test")) {
  throw new Error("I test Partner/CRM richiedono DATABASE_URL con suffisso _test.");
}

const ids = {
  company: "",
  otherCompany: "",
  user: "",
  partner: "",
  foreignPartner: "",
  foreignAgent: "",
  locationA: "",
  locationB: "",
  accountA: "",
  accountB: "",
};
const documentIds: string[] = [];
const seriesIds: string[] = [];
const scheduleIds: string[] = [];
const movementIds: string[] = [];
const reservationIds: string[] = [];
const orderIds: string[] = [];

before(async () => {
  const suffix = randomUUID().slice(0, 8);
  const company = await prisma.company.findUniqueOrThrow({
    where: { vatNumber: "IT00000000000" },
  });
  ids.company = company.id;
  ids.user = (
    await prisma.user.findFirstOrThrow({
      where: { memberships: { some: { companyId: ids.company, active: true } } },
      select: { id: true },
    })
  ).id;
  ids.otherCompany = (
    await prisma.company.create({ data: { name: `Partner CRM tenant ${suffix}` } })
  ).id;

  const [locationA, locationB, partner, foreignPartner, foreignAgent] =
    await Promise.all([
      prisma.location.create({
        data: { companyId: ids.company, code: `CRM-A-${suffix}`, name: "CRM A" },
      }),
      prisma.location.create({
        data: { companyId: ids.company, code: `CRM-B-${suffix}`, name: "CRM B" },
      }),
      prisma.partner.create({
        data: {
          companyId: ids.company,
          code: `CRM-P-${suffix}`,
          name: "CRM Partner",
          isCustomer: true,
          isSupplier: true,
        },
      }),
      prisma.partner.create({
        data: {
          companyId: ids.otherCompany,
          code: `CRM-F-${suffix}`,
          name: "Foreign Partner",
        },
      }),
      prisma.partner.create({
        data: {
          companyId: ids.otherCompany,
          code: `CRM-AF-${suffix}`,
          name: "Foreign Agent",
          isAgent: true,
        },
      }),
    ]);
  ids.locationA = locationA.id;
  ids.locationB = locationB.id;
  ids.partner = partner.id;
  ids.foreignPartner = foreignPartner.id;
  ids.foreignAgent = foreignAgent.id;

  const accountRows = await Promise.all([
    prisma.financialAccount.create({
      data: {
        companyId: ids.company,
        locationId: ids.locationA,
        code: `CRM-FA-${suffix}`,
        name: "CRM Account A",
        type: "CASH",
        createdById: ids.user,
        updatedById: ids.user,
      },
    }),
    prisma.financialAccount.create({
      data: {
        companyId: ids.company,
        locationId: ids.locationB,
        code: `CRM-FB-${suffix}`,
        name: "CRM Account B",
        type: "CASH",
        createdById: ids.user,
        updatedById: ids.user,
      },
    }),
  ]);
  ids.accountA = accountRows[0].id;
  ids.accountB = accountRows[1].id;

  const documentSpecs = [
    ["SALES_INVOICE", ids.locationA, 100, "POSTED"],
    ["SALES_INVOICE", ids.locationB, 50, "POSTED"],
    ["SALES_ORDER", ids.locationA, 30, "CONFIRMED"],
    ["SALES_ORDER", ids.locationB, 20, "CONFIRMED"],
    ["PURCHASE_INVOICE", ids.locationA, 80, "POSTED"],
    ["PURCHASE_INVOICE", ids.locationB, 40, "POSTED"],
    ["PURCHASE_ORDER", ids.locationA, 25, "CONFIRMED"],
    ["PURCHASE_ORDER", ids.locationB, 15, "CONFIRMED"],
  ] as const;

  for (const [index, [documentType, locationId, total, status]] of documentSpecs.entries()) {
    const series = await prisma.documentSeries.create({
      data: {
        companyId: ids.company,
        locationId,
        code: `CRM-S-${index}-${suffix}`,
        name: `CRM ${documentType}`,
        documentType,
      },
    });
    seriesIds.push(series.id);
    const document = await prisma.businessDocument.create({
      data: {
        companyId: ids.company,
        locationId,
        seriesId: series.id,
        documentNumber: `CRM-${index}-${suffix}`,
        documentType,
        status,
        partnerId: ids.partner,
        documentDate: new Date(Date.UTC(2026, 6, index + 1)),
        subtotal: total,
        total,
        createdById: ids.user,
        updatedById: ids.user,
      },
    });
    documentIds.push(document.id);
  }

  const past = new Date(Date.now() - 86_400_000);
  const future = new Date(Date.now() + 86_400_000);
  for (const [direction, locationId, residualAmount, dueDate] of [
    ["RECEIVABLE", ids.locationA, 60, past],
    ["RECEIVABLE", ids.locationB, 20, future],
    ["PAYABLE", ids.locationA, 35, past],
    ["PAYABLE", ids.locationB, 10, future],
  ] as const) {
    const schedule = await prisma.paymentSchedule.create({
      data: {
        companyId: ids.company,
        locationId,
        partnerId: ids.partner,
        direction,
        dueDate,
        amount: residualAmount,
        residualAmount,
        createdById: ids.user,
        updatedById: ids.user,
      },
    });
    scheduleIds.push(schedule.id);
  }

  for (const [movementType, direction, locationId, accountId, amount] of [
    ["CUSTOMER_RECEIPT", "IN", ids.locationA, ids.accountA, 40],
    ["CUSTOMER_RECEIPT", "IN", ids.locationB, ids.accountB, 30],
    ["SUPPLIER_PAYMENT", "OUT", ids.locationA, ids.accountA, 45],
    ["SUPPLIER_PAYMENT", "OUT", ids.locationB, ids.accountB, 5],
  ] as const) {
    const movement = await prisma.financialMovement.create({
      data: {
        companyId: ids.company,
        locationId,
        financialAccountId: accountId,
        partnerId: ids.partner,
        movementType,
        direction,
        amount,
        occurredAt: new Date(),
        postedById: ids.user,
      },
    });
    movementIds.push(movement.id);
  }

  for (const [index, locationId] of [ids.locationA, ids.locationB].entries()) {
    const reservation = await prisma.restaurantReservation.create({
      data: {
        companyId: ids.company,
        locationId,
        code: `CRM-R-${index}-${suffix}`,
        partnerId: ids.partner,
        guestName: "CRM Guest",
        reservationDate: new Date(),
        startTime: new Date(),
        partySize: 2,
      },
    });
    reservationIds.push(reservation.id);
    const order = await prisma.restaurantOrder.create({
      data: {
        companyId: ids.company,
        locationId,
        code: `CRM-O-${index}-${suffix}`,
        partnerId: ids.partner,
        reservationId: reservation.id,
        documentId: documentIds[index],
        status: "CLOSED",
        closedAt: new Date(),
        paymentStatus: "PAID",
      },
    });
    orderIds.push(order.id);
  }
});

after(async () => {
  await prisma.restaurantOrder.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.restaurantReservation.deleteMany({ where: { id: { in: reservationIds } } });
  await prisma.financialMovement.deleteMany({ where: { id: { in: movementIds } } });
  await prisma.paymentSchedule.deleteMany({ where: { id: { in: scheduleIds } } });
  await prisma.businessDocument.deleteMany({ where: { id: { in: documentIds } } });
  await prisma.documentSeries.deleteMany({ where: { id: { in: seriesIds } } });
  await prisma.financialAccount.deleteMany({ where: { id: { in: [ids.accountA, ids.accountB] } } });
  await prisma.partner.deleteMany({ where: { id: { in: [ids.partner, ids.foreignPartner, ids.foreignAgent] } } });
  await prisma.location.deleteMany({ where: { id: { in: [ids.locationA, ids.locationB] } } });
  await prisma.company.delete({ where: { id: ids.otherCompany } });
  await prisma.$disconnect();
});

for (const role of ["SUPER_ADMIN", "ADMIN", "MANAGER"]) {
  test(`${role}: read/write/archive/financial consentiti`, () => {
    for (const capability of Object.values(PARTNER_CAPABILITIES)) {
      assert.equal(hasPartnerCapability([role], capability), true);
    }
  });
}

test("SALES: read/write e financial commercial consentiti, archive negato", () => {
  assert.equal(hasPartnerCapability(["SALES"], PARTNER_CAPABILITIES.READ), true);
  assert.equal(hasPartnerCapability(["SALES"], PARTNER_CAPABILITIES.WRITE), true);
  assert.equal(hasPartnerCapability(["SALES"], PARTNER_CAPABILITIES.ARCHIVE), false);
  assert.equal(getPartnerFinancialScope(["SALES"]), "COMMERCIAL");
  assert.equal(canReadPartnersCompanyWide(["SALES"]), false);
});

test("ACCOUNTANT: read e financial consentiti, write/archive negati", () => {
  assert.equal(hasPartnerCapability(["ACCOUNTANT"], PARTNER_CAPABILITIES.READ), true);
  assert.equal(hasPartnerCapability(["ACCOUNTANT"], PARTNER_CAPABILITIES.WRITE), false);
  assert.equal(hasPartnerCapability(["ACCOUNTANT"], PARTNER_CAPABILITIES.ARCHIVE), false);
  assert.equal(getPartnerFinancialScope(["ACCOUNTANT"]), "FULL");
});

test("WAREHOUSE: accesso Partner generale negato", () => {
  for (const capability of Object.values(PARTNER_CAPABILITIES)) {
    assert.equal(hasPartnerCapability(["WAREHOUSE"], capability), false);
  }
});

test("create non autorizzato rifiutato", () => {
  assert.throws(() => assertPartnerCapability(["WAREHOUSE"], PARTNER_CAPABILITIES.WRITE), PartnerAccessDeniedError);
});

test("update non autorizzato rifiutato", () => {
  assert.throws(() => assertPartnerCapability(["ACCOUNTANT"], PARTNER_CAPABILITIES.WRITE), PartnerAccessDeniedError);
});

test("archive e restore non autorizzati rifiutati", () => {
  assert.throws(() => assertPartnerCapability(["SALES"], PARTNER_CAPABILITIES.ARCHIVE), PartnerAccessDeniedError);
});

test("Partner cross-company invisibile", async () => {
  assert.equal(await getPartnerDetail(ids.company, ids.foreignPartner), null);
});

test("update cross-company non trova righe aggiornabili", async () => {
  const result = await prisma.partner.updateMany({
    where: { id: ids.foreignPartner, companyId: ids.company },
    data: { name: "Forbidden" },
  });
  assert.equal(result.count, 0);
});

test("agente cross-company rifiutato", async () => {
  assert.equal(await isValidPartnerAgent(ids.company, ids.foreignAgent), false);
});

test("Customer KPI correnti e affidabili", async () => {
  const result = await getPartnerOverview({
    companyId: ids.company,
    partnerId: ids.partner,
    locationId: ids.locationA,
    financialScope: "FULL",
  });
  assert.deepEqual(
    {
      revenue: result?.customer?.revenue,
      documents: result?.customer?.documentCount,
      orders: result?.customer?.orderValue,
      paid: result?.customer?.financial?.paid,
      residual: result?.customer?.financial?.residual,
      overdue: result?.customer?.financial?.overdue,
    },
    { revenue: 100, documents: 1, orders: 30, paid: 40, residual: 60, overdue: 60 },
  );
});

test("Supplier KPI correnti e affidabili", async () => {
  const result = await getPartnerOverview({
    companyId: ids.company,
    partnerId: ids.partner,
    locationId: ids.locationA,
    financialScope: "FULL",
  });
  assert.deepEqual(
    {
      purchases: result?.supplier?.purchases,
      documents: result?.supplier?.documentCount,
      orders: result?.supplier?.orderValue,
      paid: result?.supplier?.financial?.paid,
      residual: result?.supplier?.financial?.residual,
    },
    { purchases: 80, documents: 1, orders: 25, paid: 45, residual: 35 },
  );
});

test("Treasury commercial visibility esclude pagamenti fornitore", async () => {
  const result = await getPartnerOverview({
    companyId: ids.company,
    partnerId: ids.partner,
    locationId: ids.locationA,
    financialScope: "COMMERCIAL",
  });
  assert.equal(result?.treasury?.movements.every((row) => row.movementType === "CUSTOMER_RECEIPT"), true);
  assert.equal(result?.supplier?.financial, null);
});

test("current Location filtra tutti i dati ERP", async () => {
  const result = await getPartnerOverview({
    companyId: ids.company,
    partnerId: ids.partner,
    locationId: ids.locationA,
    financialScope: "FULL",
  });
  assert.equal(result?.documents.length, 4);
  assert.equal(result?.restaurant.reservations.length, 1);
  assert.equal(result?.restaurant.orders.length, 1);
  assert.equal(result?.documents.every((row) => row.location?.id === ids.locationA), true);
});

test("Company-wide aggrega senza duplicazioni", async () => {
  const result = await getPartnerOverview({
    companyId: ids.company,
    partnerId: ids.partner,
    locationId: null,
    financialScope: "FULL",
  });
  assert.equal(result?.customer?.revenue, 150);
  assert.equal(result?.customer?.documentCount, 2);
  assert.equal(result?.customer?.orderValue, 50);
  assert.equal(result?.supplier?.purchases, 120);
  assert.equal(result?.supplier?.orderValue, 40);
  assert.equal(result?.documents.length, 8);
});

test("Documents Partner sono corretti e classificati", async () => {
  const result = await getPartnerOverview({
    companyId: ids.company,
    partnerId: ids.partner,
    locationId: null,
    financialScope: "FULL",
  });
  assert.equal(result?.documents.filter((row) => row.section === "SALES").length, 4);
  assert.equal(result?.documents.filter((row) => row.section === "PURCHASING").length, 4);
});

test("Restaurant e Booking Partner sono corretti", async () => {
  const result = await getPartnerOverview({
    companyId: ids.company,
    partnerId: ids.partner,
    locationId: null,
    financialScope: "FULL",
  });
  assert.equal(result?.restaurant.reservations.length, 2);
  assert.equal(result?.restaurant.orders.length, 2);
  assert.equal(result?.customer?.restaurantValue, 150);
});

test("nessun dato finanziario nel risultato senza capability", async () => {
  const scheduleFindMany = prisma.paymentSchedule.findMany;
  const movementFindMany = prisma.financialMovement.findMany;
  const forbiddenQuery = () => {
    throw new Error("Una query Treasury non deve essere eseguita con financial scope NONE.");
  };
  Object.defineProperty(prisma.paymentSchedule, "findMany", { value: forbiddenQuery, configurable: true });
  Object.defineProperty(prisma.financialMovement, "findMany", { value: forbiddenQuery, configurable: true });
  try {
    const result = await getPartnerOverview({
      companyId: ids.company,
      partnerId: ids.partner,
      locationId: ids.locationA,
      financialScope: "NONE",
    });
    assert.equal(result?.treasury, null);
    assert.equal(result?.customer?.financial, null);
    assert.equal(result?.supplier?.financial, null);
    assert.equal(JSON.stringify(result).includes("CUSTOMER_RECEIPT"), false);
    assert.equal(JSON.stringify(result).includes("SUPPLIER_PAYMENT"), false);
  } finally {
    Object.defineProperty(prisma.paymentSchedule, "findMany", { value: scheduleFindMany, configurable: true });
    Object.defineProperty(prisma.financialMovement, "findMany", { value: movementFindMany, configurable: true });
  }
});

test("scope Location validato server-side e Company-wide autorizzato", async () => {
  assert.deepEqual(
    await validatePartnerOverviewScope(ids.company, ids.locationA, ids.locationB, true),
    { locationId: ids.locationA },
  );
  assert.deepEqual(
    await validatePartnerOverviewScope(ids.company, "company", ids.locationB, true),
    { locationId: null },
  );
  assert.deepEqual(
    await validatePartnerOverviewScope(ids.company, "company", ids.locationB, false),
    { locationId: ids.locationB },
  );
  await assert.rejects(
    validatePartnerOverviewScope(ids.company, ids.foreignPartner, ids.locationA, true),
  );
});
