import "server-only";

import { auth } from "@/auth";
import { MODULE_CODES } from "@/lib/module-catalog";
import { requireModule } from "@/lib/modules";
import { redirect } from "next/navigation";

export const CRM_CAPABILITIES = {
  READ: "CRM_READ",
  WRITE: "CRM_WRITE",
  ASSIGN: "CRM_ASSIGN",
  PIPELINE_ADMIN: "CRM_PIPELINE_ADMIN",
  FINANCIAL_READ: "CRM_FINANCIAL_READ",
} as const;

export type CrmCapability = (typeof CRM_CAPABILITIES)[keyof typeof CRM_CAPABILITIES];
export type CrmActor = {
  companyId: string;
  membershipId: string;
  userId: string;
  roles: readonly string[];
};

const capabilityRoles: Record<CrmCapability, ReadonlySet<string>> = {
  CRM_READ: new Set(["SUPER_ADMIN", "ADMIN", "MANAGER", "SALES", "ACCOUNTANT"]),
  CRM_WRITE: new Set(["SUPER_ADMIN", "ADMIN", "MANAGER", "SALES"]),
  CRM_ASSIGN: new Set(["SUPER_ADMIN", "ADMIN", "MANAGER"]),
  CRM_PIPELINE_ADMIN: new Set(["SUPER_ADMIN", "ADMIN", "MANAGER"]),
  CRM_FINANCIAL_READ: new Set(["SUPER_ADMIN", "ADMIN", "MANAGER", "SALES", "ACCOUNTANT"]),
};

const allOpportunityRoles = new Set(["SUPER_ADMIN", "ADMIN", "MANAGER", "ACCOUNTANT"]);

export class CrmAccessDeniedError extends Error {
  constructor(public readonly capability: CrmCapability) {
    super(`Capability CRM richiesta: ${capability}.`);
    this.name = "CrmAccessDeniedError";
  }
}

export function hasCrmCapability(roles: readonly string[], capability: CrmCapability) {
  return roles.some((role) => capabilityRoles[capability].has(role));
}

export function assertCrmCapability(roles: readonly string[], capability: CrmCapability) {
  if (!hasCrmCapability(roles, capability)) throw new CrmAccessDeniedError(capability);
}

export function canReadAllCrmOpportunities(roles: readonly string[]) {
  return roles.some((role) => allOpportunityRoles.has(role));
}

export function canAssignCrmOwner(roles: readonly string[]) {
  return hasCrmCapability(roles, CRM_CAPABILITIES.ASSIGN);
}

export function canReadCrmOpportunity(
  roles: readonly string[],
  membershipId: string,
  ownerMembershipId: string,
) {
  return canReadAllCrmOpportunities(roles) || ownerMembershipId === membershipId;
}

export function resolveCrmOwner(
  roles: readonly string[],
  membershipId: string,
  requestedOwnerMembershipId?: string | null,
) {
  const ownerMembershipId = requestedOwnerMembershipId || membershipId;
  if (ownerMembershipId !== membershipId && !canAssignCrmOwner(roles)) {
    throw new CrmAccessDeniedError(CRM_CAPABILITIES.ASSIGN);
  }
  return ownerMembershipId;
}

export async function requireCrmContext(
  capability: CrmCapability = CRM_CAPABILITIES.READ,
) {
  const session = await auth();
  if (!session?.user?.companyId) redirect("/login");
  if (!hasCrmCapability(session.user.roles, capability)) redirect("/dashboard");
  try {
    await requireModule(session.user.companyId, MODULE_CODES.CORE_CRM);
  } catch {
    redirect("/dashboard");
  }
  return {
    companyId: session.user.companyId,
    membershipId: session.user.membershipId,
    userId: session.user.id,
    roles: session.user.roles,
  } satisfies CrmActor;
}
