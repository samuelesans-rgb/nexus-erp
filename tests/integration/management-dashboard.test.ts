import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { getManagementDashboard, parseManagementPeriod } from "../../lib/management-dashboard";
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
