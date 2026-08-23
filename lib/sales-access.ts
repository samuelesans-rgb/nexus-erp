import "server-only";

import { requireAuthorizationContext } from "@/lib/authorization";
import { MODULE_CODES } from "@/lib/module-catalog";
import { requireModule } from "@/lib/modules";
import { requireCurrentLocation } from "@/lib/locations";
import { redirect } from "next/navigation";

const readers = new Set(["SUPER_ADMIN", "ADMIN", "MANAGER", "SALES", "WAREHOUSE"]);
const writers = new Set(["SUPER_ADMIN", "ADMIN", "MANAGER", "SALES"]);

export async function requireSalesContext(write = false) {
  const context = await requireAuthorizationContext();
  const allowed = write ? writers : readers;
  if (!context.roles.some((role) => allowed.has(role))) redirect("/dashboard");
  try { await requireModule(context.companyId, MODULE_CODES.CORE_SALES); } catch { redirect("/dashboard"); }
  const location = await requireCurrentLocation(context.companyId, context.membershipId);
  return { companyId: context.companyId, locationId: location.id, userId: context.userId, roles: context.roles };
}
