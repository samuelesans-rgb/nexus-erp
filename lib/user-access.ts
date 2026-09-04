import "server-only";

import { requireAuthorizationContext } from "@/lib/authorization";
import { redirect } from "next/navigation";

const userAdministrators = new Set(["SUPER_ADMIN", "ADMIN"]);

export function canManageUsers(roles: readonly string[]) {
  return roles.some((role) => userAdministrators.has(role));
}

export async function requireUserAdminContext() {
  const context = await requireAuthorizationContext();
  if (!canManageUsers(context.roles)) redirect("/dashboard");
  return context;
}
