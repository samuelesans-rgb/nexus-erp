import "server-only";

import { auth } from "@/auth";
import { MODULE_CODES } from "@/lib/module-catalog";
import { requireModule } from "@/lib/modules";
import { redirect } from "next/navigation";

const administrators = new Set(["SUPER_ADMIN", "ADMIN"]);

export function canManageLocations(roles: readonly string[]) {
  return roles.some((role) => administrators.has(role));
}

export async function requireLocationContext() {
  const session = await auth();
  if (!session?.user?.companyId) redirect("/login");
  await requireModule(session.user.companyId, MODULE_CODES.CORE_LOCATIONS);
  return { companyId: session.user.companyId, membershipId: session.user.membershipId, userId: session.user.id, roles: session.user.roles };
}

export async function requireLocationAdmin() {
  const context = await requireLocationContext();
  if (!canManageLocations(context.roles)) redirect("/dashboard");
  return context;
}
