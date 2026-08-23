import "server-only";
import { requireAuthorizationContext } from "@/lib/authorization";
import { MODULE_CODES, type ModuleCode } from "@/lib/module-catalog";
import { requireModule } from "@/lib/modules";
import { requireCurrentLocation } from "@/lib/locations";
import { redirect } from "next/navigation";

export type RestaurantCapability = "read" | "operate" | "manage" | "kitchen" | "inventory" | "accounting";
const allowed: Record<RestaurantCapability, Set<string>> = {
  read: new Set(["SUPER_ADMIN", "ADMIN", "MANAGER", "SALES", "WAREHOUSE", "ACCOUNTANT"]),
  operate: new Set(["SUPER_ADMIN", "ADMIN", "MANAGER", "SALES"]),
  manage: new Set(["SUPER_ADMIN", "ADMIN", "MANAGER"]),
  kitchen: new Set(["SUPER_ADMIN", "ADMIN", "MANAGER", "WAREHOUSE"]),
  inventory: new Set(["SUPER_ADMIN", "ADMIN", "MANAGER", "WAREHOUSE"]),
  accounting: new Set(["SUPER_ADMIN", "ADMIN", "MANAGER", "ACCOUNTANT"]),
};

export async function requireRestaurantContext(moduleCode: ModuleCode, capability: RestaurantCapability = "read") {
  const context = await requireAuthorizationContext();
  if (!context.roles.some((role) => allowed[capability].has(role))) redirect("/dashboard");
  try { await requireModule(context.companyId, moduleCode); } catch { redirect("/dashboard"); }
  const location = await requireCurrentLocation(context.companyId, context.membershipId);
  return { companyId: context.companyId, locationId: location.id, userId: context.userId, roles: context.roles };
}

export const requireRestaurant = (capability: RestaurantCapability = "read") => requireRestaurantContext(MODULE_CODES.RESTAURANT_FLOOR, capability);
