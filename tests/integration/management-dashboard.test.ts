import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { getManagementDashboard, marginInflationPoints, parseManagementPeriod } from "../../lib/management-dashboard";
import { prisma } from "../../lib/prisma";

if (!(process.env.DATABASE_URL ?? "").includes("_test")) throw new Error("I test Management richiedono DATABASE_URL con suffisso _test.");

let companyId = "";
let otherCompanyId = "";
let locationA = "";
let locationB = "";
const now = new Date("2026-08-15T12:00:00.000Z");

before(async () => {
  const suffix = randomUUID().slice(0, 8);
  const company = await prisma.company.create({ data: { name: `Management ${suffix}` } });
  const other = await prisma.company.create({ data: { name: `Management other ${suffix}` } });
  companyId = company.id; otherCompanyId = other.id;
  const [a, b] = await Promise.all([
    prisma.location.create({ data: { companyId, code: `MG-A-${suffix}`, name: "Management A" } }),
    prisma.location.create({ data: { companyId, code: `MG-B-${suffix}`, name: "Management B" } }),
  ]);
  locationA = a.id; locationB = b.id;
});

after(async () => {
  await prisma.location.deleteMany({ where: { id: { in: [locationA, locationB] } } });
  await prisma.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId] } } });
  await prisma.$disconnect();
});

test("Management 1: periodo oggi usa un intervallo semiaperto", () => { const p = parseManagementPeriod({ period: "today" }, now); assert.equal(p.to.getTime() - p.from.getTime(), 86_400_000); });
test("Management 2: ultimi sette giorni include sette giornate", () => { const p = parseManagementPeriod({ period: "last7" }, now); assert.equal(p.to.getTime() - p.from.getTime(), 7 * 86_400_000); });
test("Management 3: mese corrente ha confini mensili", () => { const p = parseManagementPeriod({ period: "currentMonth" }, now); assert.equal(p.from.getDate(), 1); assert.equal(p.to.getMonth(), p.from.getMonth() + 1); });
test("Management 4: mese precedente non sovrappone il corrente", () => { const p = parseManagementPeriod({ period: "previousMonth" }, now); assert.equal(p.to.toISOString().slice(0, 10), "2026-08-01"); });
test("Management 5: periodo custom valida i confini", () => { const p = parseManagementPeriod({ period: "custom", from: "2026-08-01", to: "2026-08-10" }, now); assert.equal(p.to.toISOString().slice(0, 10), "2026-08-11"); });
test("Management 6: periodo custom invalido è rifiutato", () => { assert.throws(() => parseManagementPeriod({ period: "custom", from: "2026-08-10", to: "2026-08-01" }, now)); });

test("Management 7: dashboard vuota non inventa ricavi", async () => { const d = await getManagementDashboard(companyId, locationA, parseManagementPeriod({ period: "currentMonth" }, now)); assert.equal(d.revenue.total, 0); });
test("Management 8: Treasury vuota non inventa flussi", async () => { const d = await getManagementDashboard(companyId, locationA, parseManagementPeriod({ period: "currentMonth" }, now)); assert.deepEqual([d.treasury.receipts, d.treasury.payments, d.treasury.net], [0, 0, 0]); });
test("Management 9: Restaurant resta isolato per Location", async () => { const d = await getManagementDashboard(companyId, locationB, parseManagementPeriod({ period: "currentMonth" }, now)); assert.deepEqual([d.restaurant.orders, d.restaurant.reservations], [0, 0]); });
test("Management 10: Sales e Purchasing restano isolati per Location", async () => { const d = await getManagementDashboard(companyId, locationB, parseManagementPeriod({ period: "currentMonth" }, now)); assert.deepEqual([d.sales.orders, d.purchasing.orders], [0, 0]); });
test("Management 11: Inventory resta isolato per Location", async () => { const d = await getManagementDashboard(companyId, locationB, parseManagementPeriod({ period: "currentMonth" }, now)); assert.deepEqual([d.inventory.stockValue, d.inventory.movements], [0, 0]); });
test("Management 12: tenant senza Location corrispondente non vede dati", async () => { const d = await getManagementDashboard(otherCompanyId, locationA, parseManagementPeriod({ period: "currentMonth" }, now)); assert.equal(d.revenue.total + d.costs.purchases + d.inventory.stockValue, 0); });

test("Management 13: il margine gonfiato si misura, non si stima", () => {
  // Ricavo lordo 110 con IVA 10% ⇒ netto 100. Costo 60, netto per definizione.
  // Margine dichiarato: (110-60)/110 = 45,45%. Reale: (100-60)/100 = 40%.
  const points = marginInflationPoints({ revenue: 110, netRevenue: 100, costOfGoods: 60 });
  assert.ok(Math.abs(points - 5.4545) < 0.01, `punti calcolati: ${points}`);
});

test("Management 14: senza costi il margine non è gonfiato", () => {
  // Entrambi i margini valgono 100%: non c'è nulla da dichiarare, e la nota
  // nella UI non deve comparire.
  assert.equal(marginInflationPoints({ revenue: 110, netRevenue: 100, costOfGoods: 0 }), 0);
  assert.equal(marginInflationPoints({ revenue: 0, netRevenue: 0, costOfGoods: 0 }), 0);
});

test("Management 15: ricavo del ristorante dalle comande, non dai documenti", async () => {
  const suffix = randomUUID().slice(0, 8);
  const [vat, uom] = await Promise.all([
    prisma.vatRate.create({ data: { companyId, code: `V${suffix}`, name: "IVA 10%", percentage: 10 } }),
    prisma.unitOfMeasure.create({ data: { companyId, code: `U${suffix}`, name: "Pezzo", symbol: "pz" } }),
  ]);
  const category = await prisma.itemCategory.create({ data: { companyId, code: `C${suffix}`, name: "Cat", purpose: "SELLABLE" } });
  const item = await prisma.item.create({ data: { companyId, code: `I${suffix}`, name: "Piatto", type: "PRODUCT", status: "ACTIVE", unitOfMeasureId: uom.id, categoryId: category.id, vatRateId: vat.id, salePrice: 10, sellable: true } });
  const closedAt = new Date("2026-08-14T20:00:00.000Z");
  const order = await prisma.restaurantOrder.create({
    data: { companyId, locationId: locationA, code: `ORD-${suffix}`, status: "CLOSED", serviceType: "DINE_IN", guestCount: 2, openedAt: closedAt, closedAt, createdById: null },
  });
  const line = (quantity: number, total: number) => prisma.restaurantOrderLine.create({
    data: { companyId, locationId: locationA, orderId: order.id, itemId: item.id, productName: "Piatto", baseUnitPrice: 10, quantity, unitPrice: 10, vatRateId: vat.id, vatName: "IVA 10%", vatPercentage: 10, lineTotal: total, status: "SERVED" },
  });
  await line(2, 20);
  const cancelled = await line(1, 10);
  await prisma.restaurantOrderLine.update({ where: { id: cancelled.id }, data: { status: "CANCELLED" } });

  const d = await getManagementDashboard(companyId, locationA, parseManagementPeriod({ period: "previousMonth" }, new Date("2026-09-15T12:00:00.000Z")));
  // Nessun documento esiste: prima questo valeva zero.
  assert.equal(d.revenue.restaurant, 20, "somma le righe, e non conta quelle annullate");
  assert.equal(d.revenue.total, 20);
  assert.equal(d.restaurant.averageCheck, 20, "lo scontrino medio smette di essere zero");
  // Il grafico giornaliero non resta piatto.
  const day = d.trend.find((row) => row.revenue > 0);
  assert.ok(day, "il ricavo deve comparire anche nell'andamento giornaliero");

  await prisma.restaurantOrderLine.deleteMany({ where: { orderId: order.id } });
  await prisma.restaurantOrder.delete({ where: { id: order.id } });
  await prisma.item.delete({ where: { id: item.id } });
  await prisma.itemCategory.delete({ where: { id: category.id } });
  await prisma.unitOfMeasure.delete({ where: { id: uom.id } });
  await prisma.vatRate.delete({ where: { id: vat.id } });
});
