import "server-only";

import { auth } from "@/auth";
import { MODULE_CODES } from "@/lib/module-catalog";
import { requireModule } from "@/lib/modules";
import { requireCurrentLocation } from "@/lib/locations";
import { redirect } from "next/navigation";

export const PARTNER_CAPABILITIES = {
  READ: "PARTNER_READ",
  WRITE: "PARTNER_WRITE",
  ARCHIVE: "PARTNER_ARCHIVE",
  FINANCIAL_READ: "PARTNER_FINANCIAL_READ",
} as const;

export type PartnerCapability =
  (typeof PARTNER_CAPABILITIES)[keyof typeof PARTNER_CAPABILITIES];
export type PartnerFinancialScope = "NONE" | "COMMERCIAL" | "FULL";

const capabilityRoles: Record<PartnerCapability, ReadonlySet<string>> = {
  PARTNER_READ: new Set(["SUPER_ADMIN", "ADMIN", "MANAGER", "SALES", "ACCOUNTANT"]),
  PARTNER_WRITE: new Set(["SUPER_ADMIN", "ADMIN", "MANAGER", "SALES"]),
  PARTNER_ARCHIVE: new Set(["SUPER_ADMIN", "ADMIN", "MANAGER"]),
  PARTNER_FINANCIAL_READ: new Set(["SUPER_ADMIN", "ADMIN", "MANAGER", "SALES", "ACCOUNTANT"]),
};

const companyWideRoles = new Set(["SUPER_ADMIN", "ADMIN", "MANAGER", "ACCOUNTANT"]);

export function hasPartnerCapability(
  roles: readonly string[],
  capability: PartnerCapability,
) {
  return roles.some((role) => capabilityRoles[capability].has(role));
}

export function getPartnerFinancialScope(
  roles: readonly string[],
): PartnerFinancialScope {
  if (!hasPartnerCapability(roles, PARTNER_CAPABILITIES.FINANCIAL_READ)) return "NONE";
  return roles.some((role) => role === "SALES") &&
    !roles.some((role) => companyWideRoles.has(role))
    ? "COMMERCIAL"
    : "FULL";
}

export function canReadPartnersCompanyWide(roles: readonly string[]) {
  return roles.some((role) => companyWideRoles.has(role));
}

export class PartnerAccessDeniedError extends Error {
  constructor(public readonly capability: PartnerCapability) {
    super(`Capability Partner richiesta: ${capability}.`);
    this.name = "PartnerAccessDeniedError";
  }
}

export function assertPartnerCapability(
  roles: readonly string[],
  capability: PartnerCapability,
) {
  if (!hasPartnerCapability(roles, capability)) {
    throw new PartnerAccessDeniedError(capability);
  }
}

export async function requirePartnerContext(
  capability: PartnerCapability = PARTNER_CAPABILITIES.READ,
) {
  const session = await auth();
  if (!session?.user?.companyId) redirect("/login");
  if (!hasPartnerCapability(session.user.roles, capability)) redirect("/dashboard");

  try {
    await requireModule(session.user.companyId, MODULE_CODES.CORE_PARTNERS);
  } catch {
    redirect("/dashboard");
  }

  const location = await requireCurrentLocation(
    session.user.companyId,
    session.user.membershipId,
  );

  return {
    companyId: session.user.companyId,
    companyName: session.user.companyName,
    membershipId: session.user.membershipId,
    userId: session.user.id,
    roles: session.user.roles,
    location,
    financialScope: getPartnerFinancialScope(session.user.roles),
    canReadCompanyWide: canReadPartnersCompanyWide(session.user.roles),
  };
}
