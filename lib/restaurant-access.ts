import "server-only";
import { auth } from "@/auth";
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
  const session = await auth();
  if (!session?.user?.companyId) redirect("/login");
  if (!session.user.roles.some((role) => allowed[capability].has(role))) redirect("/dashboard");
  try { await requireModule(session.user.companyId, moduleCode); } catch { redirect("/dashboard"); }
  const location = await requireCurrentLocation(session.user.companyId, session.user.membershipId);
  return { companyId: session.user.companyId, locationId: location.id, userId: session.user.id, roles: session.user.roles };
}

export const requireRestaurant = (capability: RestaurantCapability = "read") => requireRestaurantContext(MODULE_CODES.RESTAURANT_FLOOR, capability);
