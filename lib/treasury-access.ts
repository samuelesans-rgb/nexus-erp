import "server-only";
import { requireAuthorizationContext } from "@/lib/authorization";
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
export async function requireTreasuryContext(capability: TreasuryCapability = "read") { const context = await requireAuthorizationContext(); if (!context.roles.some((role) => roles[capability].has(role))) redirect("/dashboard"); try { await requireModule(context.companyId, MODULE_CODES.CORE_TREASURY); } catch { redirect("/dashboard"); } const location = await requireCurrentLocation(context.companyId, context.membershipId); return { companyId: context.companyId, locationId: location.id, userId: context.userId, roles: context.roles }; }
