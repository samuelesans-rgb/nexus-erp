import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { MODULE_CODES, MODULE_DEPENDENCIES } from "../../lib/module-catalog";
import { ModuleConfigurationError, setCompanyModuleEnabled } from "../../lib/modules";
import { SYSTEM_MODULE_DEFINITIONS } from "../../lib/system-catalog";
import { prisma } from "../../lib/prisma";

const databaseName = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid").pathname.slice(1);
if (!databaseName.endsWith("_test")) throw new Error("I test moduli richiedono un database con suffisso _test.");

let companyId = "";

const definition = (code: string) => SYSTEM_MODULE_DEFINITIONS.find((row) => row.code === code);

before(async () => {
  const company = await prisma.company.create({ data: { name: `Module Test ${randomUUID().slice(0, 8)}` } });
  companyId = company.id;
  for (const code of [MODULE_CODES.CORE_CRM, MODULE_CODES.CORE_PARTNERS, MODULE_CODES.CORE_NOTIFICATIONS, MODULE_CODES.CORE_SEARCH]) {
    const row = definition(code);
    assert.ok(row, `${code} assente dal catalogo`);
    await prisma.moduleDefinition.upsert({ where: { code }, update: row, create: row });
  }
});

after(async () => {
  if (companyId) await prisma.company.delete({ where: { id: companyId } });
  await prisma.$disconnect();
});

test("CORE_CRM è disponibile, opzionale e mantiene le dipendenze ufficiali", () => {
  const crm = definition(MODULE_CODES.CORE_CRM);
  assert.ok(crm);
  assert.equal(crm.status, "AVAILABLE");
  assert.equal(crm.mandatory, false);
  assert.deepEqual(MODULE_DEPENDENCIES[MODULE_CODES.CORE_CRM], [
    MODULE_CODES.CORE_PARTNERS,
    MODULE_CODES.CORE_NOTIFICATIONS,
  ]);
});

test("CORE_CRM rifiuta l'attivazione finché manca una dipendenza", async () => {
  await assert.rejects(
    setCompanyModuleEnabled(companyId, MODULE_CODES.CORE_CRM, true),
    (error: unknown) => error instanceof ModuleConfigurationError && /CORE_PARTNERS, CORE_NOTIFICATIONS/.test(error.message),
  );
});

test("CORE_CRM si attiva e si disattiva tramite il service ufficiale", async () => {
  for (const code of [MODULE_CODES.CORE_PARTNERS, MODULE_CODES.CORE_NOTIFICATIONS]) {
    const moduleDefinitionId = (await prisma.moduleDefinition.findUniqueOrThrow({ where: { code } })).id;
    await prisma.companyModule.create({ data: { companyId, moduleDefinitionId, enabled: true, enabledAt: new Date() } });
  }

  await setCompanyModuleEnabled(companyId, MODULE_CODES.CORE_CRM, true);
  const enabled = await prisma.companyModule.findFirstOrThrow({
    where: { companyId, moduleDefinition: { code: MODULE_CODES.CORE_CRM } },
  });
  assert.equal(enabled.enabled, true);
  assert.ok(enabled.enabledAt);
  assert.equal(enabled.disabledAt, null);

  await setCompanyModuleEnabled(companyId, MODULE_CODES.CORE_CRM, false);
  const disabled = await prisma.companyModule.findUniqueOrThrow({ where: { id: enabled.id } });
  assert.equal(disabled.enabled, false);
  assert.ok(disabled.disabledAt);
});

test("gli altri moduli FUTURE restano non attivabili", async () => {
  assert.equal(definition(MODULE_CODES.CORE_SEARCH)?.status, "FUTURE");
  await assert.rejects(
    setCompanyModuleEnabled(companyId, MODULE_CODES.CORE_SEARCH, true),
    (error: unknown) => error instanceof ModuleConfigurationError && /futuri/.test(error.message),
  );
});

test("il catalogo contiene una definizione univoca per ogni codice modulo", () => {
  assert.equal(SYSTEM_MODULE_DEFINITIONS.length, Object.values(MODULE_CODES).length);
  assert.equal(new Set(SYSTEM_MODULE_DEFINITIONS.map((row) => row.code)).size, SYSTEM_MODULE_DEFINITIONS.length);
});
