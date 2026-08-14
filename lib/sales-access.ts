import "server-only";

import { auth } from "@/auth";
import { MODULE_CODES } from "@/lib/module-catalog";
import { requireModule } from "@/lib/modules";
import { requireCurrentLocation } from "@/lib/locations";
import { redirect } from "next/navigation";

const readers = new Set(["SUPER_ADMIN", "ADMIN", "MANAGER", "SALES", "WAREHOUSE"]);
const writers = new Set(["SUPER_ADMIN", "ADMIN", "MANAGER", "SALES"]);

export async function requireSalesContext(write = false) {
  const session = await auth();
  if (!session?.user?.companyId) redirect("/login");
  const allowed = write ? writers : readers;
  if (!session.user.roles.some((role) => allowed.has(role))) redirect("/dashboard");
  try { await requireModule(session.user.companyId, MODULE_CODES.CORE_SALES); } catch { redirect("/dashboard"); }
  const location = await requireCurrentLocation(session.user.companyId, session.user.membershipId);
  return { companyId: session.user.companyId, locationId: location.id, userId: session.user.id, roles: session.user.roles };
}
