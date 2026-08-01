import "server-only";

import { auth } from "@/auth";
import { MODULE_CODES } from "@/lib/module-catalog";
import { requireModule } from "@/lib/modules";
import { redirect } from "next/navigation";

const inventoryRoles = new Set(["SUPER_ADMIN", "ADMIN", "MANAGER", "WAREHOUSE"]);

export async function requireInventoryContext() {
  const session = await auth();
  if (!session?.user?.companyId) redirect("/login");
  if (!session.user.roles.some((role) => inventoryRoles.has(role))) redirect("/dashboard");
  try { await requireModule(session.user.companyId, MODULE_CODES.CORE_INVENTORY); } catch { redirect("/dashboard"); }
  return { companyId: session.user.companyId, userId: session.user.id, roles: session.user.roles };
}
