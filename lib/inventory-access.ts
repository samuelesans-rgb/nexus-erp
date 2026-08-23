import "server-only";

import { requireAuthorizationContext } from "@/lib/authorization";
import { MODULE_CODES } from "@/lib/module-catalog";
import { requireModule } from "@/lib/modules";
import { redirect } from "next/navigation";

const inventoryRoles = new Set(["SUPER_ADMIN", "ADMIN", "MANAGER", "WAREHOUSE"]);

export async function requireInventoryContext() {
  const context = await requireAuthorizationContext();
  if (!context.roles.some((role) => inventoryRoles.has(role))) redirect("/dashboard");
  try { await requireModule(context.companyId, MODULE_CODES.CORE_INVENTORY); } catch { redirect("/dashboard"); }
  return { companyId: context.companyId, userId: context.userId, roles: context.roles };
}
