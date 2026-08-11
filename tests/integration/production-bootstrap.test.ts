import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";

import bcrypt from "bcrypt";

import { prisma } from "../../lib/prisma";
import { MODULE_CODES } from "../../lib/module-catalog";
import { bootstrapProduction, ProductionBootstrapError } from "../../lib/production-bootstrap";

const databaseUrl = process.env.DATABASE_URL ?? "";
if (!databaseUrl.includes("_test")) throw new Error("I test bootstrap richiedono un DATABASE_URL dedicato contenente _test.");

const validEnvironment: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: "test",
  BOOTSTRAP_ALLOW_TEST_MODE: "true",
  BOOTSTRAP_COMPANY_NAME: "Bootstrap Test Company",
  BOOTSTRAP_COMPANY_VAT_NUMBER: "ITBOOTSTRAPTEST001",
  BOOTSTRAP_ADMIN_NAME: "Ada Admin",
  BOOTSTRAP_ADMIN_EMAIL: "bootstrap-admin@example.test",
  BOOTSTRAP_ADMIN_PASSWORD: "Test-only-password-42!",
  BOOTSTRAP_LOCATION_NAME: "Test Headquarters",
  BOOTSTRAP_LOCATION_CODE: "HQ",
  BOOTSTRAP_LOCATION_SLUG: "test-headquarters",
};

async function cleanBootstrapData() {
  await prisma.company.deleteMany();
  await prisma.user.deleteMany();
  await prisma.moduleDefinition.deleteMany();
  await prisma.role.deleteMany();
}

beforeEach(cleanBootstrapData);
after(async () => { await cleanBootstrapData(); await prisma.$disconnect(); });

test("database vuoto: crea tenant, amministratore, sede e moduli minimi senza dati demo", async () => {
  const result = await bootstrapProduction(prisma, validEnvironment, { allowTestMode: true });
  const company = await prisma.company.findUniqueOrThrow({ where: { id: result.companyId } });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: result.userId } });
  const membership = await prisma.membership.findUniqueOrThrow({ where: { id: result.membershipId }, include: { roles: { include: { role: true } } } });
  const location = await prisma.location.findUniqueOrThrow({ where: { id: result.locationId } });
  const enabled = await prisma.companyModule.findMany({ where: { companyId: company.id, enabled: true }, select: { moduleDefinition: { select: { code: true } } } });
  const enabledCodes = new Set(enabled.map(({ moduleDefinition }) => moduleDefinition.code));

  assert.equal(company.name, validEnvironment.BOOTSTRAP_COMPANY_NAME);
  assert.equal(user.email, validEnvironment.BOOTSTRAP_ADMIN_EMAIL);
  assert.equal(await bcrypt.compare(validEnvironment.BOOTSTRAP_ADMIN_PASSWORD!, user.password), true);
  assert.deepEqual(membership.roles.map(({ role }) => role.code), ["SUPER_ADMIN"]);
  assert.equal(membership.defaultLocationId, location.id);
  assert.equal(location.isHeadquarters, true);
  for (const code of [MODULE_CODES.CORE_LOCATIONS, MODULE_CODES.RESTAURANT_RESERVATIONS, MODULE_CODES.RESTAURANT_FLOOR]) assert.equal(enabledCodes.has(code), true, `${code} non abilitato`);
  assert.deepEqual(await Promise.all([
    prisma.partner.count(), prisma.item.count(), prisma.restaurantArea.count(), prisma.restaurantTable.count(), prisma.restaurantReservation.count(),
    prisma.restaurantOrder.count(), prisma.businessDocument.count(), prisma.financialMovement.count(),
  ]), [0, 0, 0, 0, 0, 0, 0, 0]);
});

test("seconda esecuzione: rifiuta senza modificare dati", async () => {
  await bootstrapProduction(prisma, validEnvironment, { allowTestMode: true });
  const before = await Promise.all([prisma.company.count(), prisma.user.count(), prisma.location.count(), prisma.membership.count()]);
  await assert.rejects(bootstrapProduction(prisma, validEnvironment, { allowTestMode: true }), ProductionBootstrapError);
  assert.deepEqual(await Promise.all([prisma.company.count(), prisma.user.count(), prisma.location.count(), prisma.membership.count()]), before);
});

test("errore a metà: rollback completo", async () => {
  await assert.rejects(bootstrapProduction(prisma, validEnvironment, { allowTestMode: true, failAfter: "company" }), /simulato/);
  assert.deepEqual(await Promise.all([prisma.company.count(), prisma.user.count(), prisma.location.count(), prisma.membership.count(), prisma.role.count(), prisma.moduleDefinition.count()]), [0, 0, 0, 0, 0, 0]);
});

test("variabili mancanti: nessuna scrittura", async () => {
  const invalid = { ...validEnvironment };
  delete invalid.BOOTSTRAP_ADMIN_EMAIL;
  await assert.rejects(bootstrapProduction(prisma, invalid, { allowTestMode: true }), /BOOTSTRAP_ADMIN_EMAIL/);
  assert.equal(await prisma.company.count(), 0);
  assert.equal(await prisma.role.count(), 0);
});
