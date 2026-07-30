import "server-only";

import { prisma } from "@/lib/prisma";
import {
  MODULE_DEPENDENCIES,
  type ModuleCode,
} from "@/lib/module-catalog";

export class ModuleNotEnabledError extends Error {
  constructor(public readonly moduleCode: ModuleCode) {
    super(`Il modulo ${moduleCode} non è attivo per questa azienda.`);
    this.name = "ModuleNotEnabledError";
  }
}

export class ModuleConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModuleConfigurationError";
  }
}

export async function getCompanyModules(companyId: string) {
  return prisma.companyModule.findMany({
    where: {
      companyId,
      enabled: true,
    },
    select: {
      enabledAt: true,
      configuration: true,
      moduleDefinition: {
        select: {
          code: true,
          name: true,
          category: true,
          mandatory: true,
          status: true,
        },
      },
    },
    orderBy: {
      moduleDefinition: {
        code: "asc",
      },
    },
  });
}

export async function isModuleEnabled(
  companyId: string,
  moduleCode: ModuleCode
) {
  const companyModule = await prisma.companyModule.findFirst({
    where: {
      companyId,
      enabled: true,
      moduleDefinition: {
        code: moduleCode,
      },
    },
    select: {
      id: true,
    },
  });

  return companyModule !== null;
}

export async function requireModule(
  companyId: string,
  moduleCode: ModuleCode
) {
  if (!(await isModuleEnabled(companyId, moduleCode))) {
    throw new ModuleNotEnabledError(moduleCode);
  }
}

export async function getCompanyModuleSettings(companyId: string) {
  const [definitions, activations] = await Promise.all([
    prisma.moduleDefinition.findMany({
      orderBy: [{ category: "asc" }, { code: "asc" }],
    }),
    prisma.companyModule.findMany({
      where: { companyId },
      select: {
        moduleDefinitionId: true,
        enabled: true,
        enabledAt: true,
        disabledAt: true,
      },
    }),
  ]);
  const activationByDefinition = new Map(
    activations.map((activation) => [
      activation.moduleDefinitionId,
      activation,
    ])
  );

  return definitions.map((definition) => ({
    ...definition,
    activation: activationByDefinition.get(definition.id) ?? null,
  }));
}

export async function setCompanyModuleEnabled(
  companyId: string,
  moduleCode: ModuleCode,
  enabled: boolean
) {
  await prisma.$transaction(async (tx) => {
    const definition = await tx.moduleDefinition.findUnique({
      where: { code: moduleCode },
    });

    if (!definition) {
      throw new ModuleConfigurationError("Il modulo richiesto non esiste.");
    }
    if (!enabled && definition.mandatory) {
      throw new ModuleConfigurationError(
        "I moduli obbligatori non possono essere disattivati."
      );
    }
    if (enabled && definition.status === "FUTURE") {
      throw new ModuleConfigurationError(
        "I moduli futuri non possono ancora essere attivati."
      );
    }

    if (enabled) {
      const dependencies = MODULE_DEPENDENCIES[moduleCode] ?? [];
      const activeDependencies = await tx.companyModule.findMany({
        where: {
          companyId,
          enabled: true,
          moduleDefinition: {
            code: { in: [...dependencies] },
          },
        },
        select: {
          moduleDefinition: { select: { code: true } },
        },
      });
      const activeCodes = new Set(
        activeDependencies.map(({ moduleDefinition }) => moduleDefinition.code)
      );
      const missing = dependencies.filter((code) => !activeCodes.has(code));

      if (missing.length > 0) {
        throw new ModuleConfigurationError(
          `Attiva prima i moduli richiesti: ${missing.join(", ")}.`
        );
      }
    } else {
      const dependentCodes = Object.entries(MODULE_DEPENDENCIES)
        .filter(([, dependencies]) => dependencies?.includes(moduleCode))
        .map(([code]) => code);
      const activeDependent = await tx.companyModule.findFirst({
        where: {
          companyId,
          enabled: true,
          moduleDefinition: {
            code: { in: dependentCodes },
          },
        },
        select: {
          moduleDefinition: { select: { code: true } },
        },
      });

      if (activeDependent) {
        throw new ModuleConfigurationError(
          `Disattiva prima il modulo dipendente ${activeDependent.moduleDefinition.code}.`
        );
      }
    }

    const now = new Date();
    await tx.companyModule.upsert({
      where: {
        companyId_moduleDefinitionId: {
          companyId,
          moduleDefinitionId: definition.id,
        },
      },
      update: {
        enabled,
        enabledAt: enabled ? now : undefined,
        disabledAt: enabled ? null : now,
      },
      create: {
        companyId,
        moduleDefinitionId: definition.id,
        enabled,
        enabledAt: enabled ? now : null,
        disabledAt: enabled ? null : now,
      },
    });
  });
}
