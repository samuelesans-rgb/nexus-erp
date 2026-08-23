import "server-only";

import { requireAuthorizationContext } from "@/lib/authorization";
import { MODULE_CODES } from "@/lib/module-catalog";
import { requireModule } from "@/lib/modules";
import { redirect } from "next/navigation";

export type MasterDataCapability = "read" | "write";
const readers = new Set(["SUPER_ADMIN", "ADMIN", "MANAGER"]);
const writers = new Set(["SUPER_ADMIN", "ADMIN"]);

export function hasMasterDataCapability(roles: readonly string[], capability: MasterDataCapability) {
  const allowed = capability === "write" ? writers : readers;
  return roles.some((role) => allowed.has(role));
}

export async function requireCompanyContext(capability: MasterDataCapability = "read") {
  const context = await requireAuthorizationContext();
  if (!hasMasterDataCapability(context.roles, capability)) redirect("/dashboard");
  await requireModule(context.companyId, MODULE_CODES.CORE_COMPANIES);
  return { companyId: context.companyId, membershipId: context.membershipId, userId: context.userId, roles: context.roles };
}

export async function requireCompanyAdmin() {
  return requireCompanyContext("write");
}

export async function requireMasterDataContext(capability: MasterDataCapability = "read") {
  const context = await requireAuthorizationContext();
  if (!hasMasterDataCapability(context.roles, capability)) redirect("/dashboard");
  await requireModule(context.companyId, MODULE_CODES.CORE_PRODUCTS);
  return { companyId: context.companyId, membershipId: context.membershipId, userId: context.userId, roles: context.roles };
}
