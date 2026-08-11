import bcrypt from "bcrypt";
import { z } from "zod";

import type { PrismaClient } from "@/generated/prisma/client";
import { MODULE_CODES, MODULE_DEPENDENCIES, type ModuleCode } from "@/lib/module-catalog";
import { SYSTEM_MODULE_DEFINITIONS, SYSTEM_ROLES } from "@/lib/system-catalog";

export class ProductionBootstrapError extends Error {
  constructor(message: string) { super(message); this.name = "ProductionBootstrapError"; }
}

const inputSchema = z.object({
  BOOTSTRAP_COMPANY_NAME: z.string().trim().min(2).max(200),
  BOOTSTRAP_COMPANY_VAT_NUMBER: z.string().trim().min(5).max(32),
  BOOTSTRAP_ADMIN_NAME: z.string().trim().min(3).max(200).refine((value) => value.split(/\s+/).length >= 2, "BOOTSTRAP_ADMIN_NAME deve contenere nome e cognome."),
  BOOTSTRAP_ADMIN_EMAIL: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().min(12).max(128),
  BOOTSTRAP_LOCATION_NAME: z.string().trim().min(2).max(200),
  BOOTSTRAP_LOCATION_CODE: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/).max(32).transform((value) => value.toUpperCase()),
  BOOTSTRAP_LOCATION_SLUG: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
});

type BootstrapOptions = { allowTestMode?: boolean; failAfter?: "company" };

const requestedModules: readonly ModuleCode[] = [
  MODULE_CODES.CORE_LOCATIONS, MODULE_CODES.CORE_MODULES, MODULE_CODES.CORE_DASHBOARD, MODULE_CODES.CORE_NOTIFICATIONS,
  MODULE_CODES.RESTAURANT_RESERVATIONS, MODULE_CODES.RESTAURANT_FLOOR,
];

function enabledModuleCodes() {
  const enabled = new Set<ModuleCode>();
  const visit = (code: ModuleCode) => {
    if (enabled.has(code)) return;
    for (const dependency of MODULE_DEPENDENCIES[code] ?? []) visit(dependency);
    enabled.add(code);
  };
  for (const code of requestedModules) visit(code);
  return enabled;
}

export function parseProductionBootstrapInput(environment: NodeJS.ProcessEnv) {
  const parsed = inputSchema.safeParse(environment);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? "input")))];
    throw new ProductionBootstrapError(`Variabili bootstrap non valide o mancanti: ${fields.join(", ")}.`);
  }
  return parsed.data;
}

export function assertBootstrapEnvironment(environment: NodeJS.ProcessEnv, allowTestMode = false) {
  if (environment.NODE_ENV === "production") return;
  const testDatabase = environment.DATABASE_URL?.includes("_test") ?? false;
  if (allowTestMode && environment.BOOTSTRAP_ALLOW_TEST_MODE === "true" && testDatabase) return;
  throw new ProductionBootstrapError("Bootstrap consentito solo con NODE_ENV=production; i test richiedono opt-in esplicito e DATABASE_URL _test.");
}

export async function bootstrapProduction(prisma: PrismaClient, environment: NodeJS.ProcessEnv, options: BootstrapOptions = {}) {
  assertBootstrapEnvironment(environment, options.allowTestMode);
  const input = parseProductionBootstrapInput(environment);
  const passwordHash = await bcrypt.hash(input.BOOTSTRAP_ADMIN_PASSWORD, 12);
  const [firstName, ...lastNameParts] = input.BOOTSTRAP_ADMIN_NAME.split(/\s+/);
  const activeModuleCodes = enabledModuleCodes();

  return prisma.$transaction(async (tx) => {
    if (await tx.company.count() > 0) throw new ProductionBootstrapError("Bootstrap rifiutato: esiste già almeno una Company.");
    for (const [code, name] of SYSTEM_ROLES) await tx.role.upsert({ where: { code }, update: { name }, create: { code, name } });
    for (const definition of SYSTEM_MODULE_DEFINITIONS) await tx.moduleDefinition.upsert({ where: { code: definition.code }, update: definition, create: definition });
    const company = await tx.company.create({ data: { name: input.BOOTSTRAP_COMPANY_NAME, vatNumber: input.BOOTSTRAP_COMPANY_VAT_NUMBER } });
    if (options.failAfter === "company") throw new ProductionBootstrapError("Errore bootstrap simulato.");
    const user = await tx.user.create({ data: { firstName, lastName: lastNameParts.join(" "), email: input.BOOTSTRAP_ADMIN_EMAIL, password: passwordHash } });
    const location = await tx.location.create({ data: { companyId: company.id, name: input.BOOTSTRAP_LOCATION_NAME, code: input.BOOTSTRAP_LOCATION_CODE, slug: input.BOOTSTRAP_LOCATION_SLUG, isHeadquarters: true, createdById: user.id, updatedById: user.id } });
    const membership = await tx.membership.create({ data: { companyId: company.id, userId: user.id, active: true, isDefault: true, defaultLocationId: location.id } });
    const superAdmin = await tx.role.findUniqueOrThrow({ where: { code: "SUPER_ADMIN" } });
    await tx.membershipRole.create({ data: { membershipId: membership.id, roleId: superAdmin.id } });
    const definitions = await tx.moduleDefinition.findMany({ where: { code: { in: [...activeModuleCodes] } }, select: { id: true } });
    const enabledAt = new Date();
    await tx.companyModule.createMany({ data: definitions.map(({ id }) => ({ companyId: company.id, moduleDefinitionId: id, enabled: true, enabledAt })) });
    return { companyId: company.id, userId: user.id, membershipId: membership.id, locationId: location.id, enabledModuleCount: definitions.length };
  }, { isolationLevel: "Serializable" });
}
