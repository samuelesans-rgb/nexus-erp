import "server-only";
import { auth } from "@/auth";
import { MODULE_CODES } from "@/lib/module-catalog";
import { requireModule } from "@/lib/modules";
import { requireCurrentLocation } from "@/lib/locations";
import { redirect } from "next/navigation";

export type TreasuryCapability = "read" | "operations" | "receipt" | "payment" | "transfer" | "reconcile" | "manage";
const roles: Record<TreasuryCapability, Set<string>> = {
  read: new Set(["SUPER_ADMIN", "ADMIN", "MANAGER", "ACCOUNTANT", "SALES"]),
  operations: new Set(["SUPER_ADMIN", "ADMIN", "MANAGER", "ACCOUNTANT"]),
  receipt: new Set(["SUPER_ADMIN", "ADMIN", "MANAGER", "ACCOUNTANT", "SALES"]),
  payment: new Set(["SUPER_ADMIN", "ADMIN", "MANAGER", "ACCOUNTANT"]),
  transfer: new Set(["SUPER_ADMIN", "ADMIN", "MANAGER", "ACCOUNTANT"]),
  reconcile: new Set(["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"]),
  manage: new Set(["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"]),
};
export async function requireTreasuryContext(capability: TreasuryCapability = "read") { const session = await auth(); if (!session?.user?.companyId) redirect("/login"); if (!session.user.roles.some((role) => roles[capability].has(role))) redirect("/dashboard"); try { await requireModule(session.user.companyId, MODULE_CODES.CORE_TREASURY); } catch { redirect("/dashboard"); } const location = await requireCurrentLocation(session.user.companyId, session.user.membershipId); return { companyId: session.user.companyId, locationId: location.id, userId: session.user.id, roles: session.user.roles }; }
