import "server-only";

import { auth } from "@/auth";
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
  const session = await auth();
  if (!session?.user?.companyId) redirect("/login");
  if (!hasMasterDataCapability(session.user.roles, capability)) redirect("/dashboard");
  await requireModule(session.user.companyId, MODULE_CODES.CORE_COMPANIES);
  return { companyId: session.user.companyId, userId: session.user.id, roles: session.user.roles };
}

export async function requireCompanyAdmin() {
  return requireCompanyContext("write");
}

export async function requireMasterDataContext(capability: MasterDataCapability = "read") {
  const session = await auth();
  if (!session?.user?.companyId) redirect("/login");
  if (!hasMasterDataCapability(session.user.roles, capability)) redirect("/dashboard");
  await requireModule(session.user.companyId, MODULE_CODES.CORE_PRODUCTS);
  return { companyId: session.user.companyId, userId: session.user.id, roles: session.user.roles };
}
