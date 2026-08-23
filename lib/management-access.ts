import "server-only";

import { requireAuthorizationContext } from "@/lib/authorization";
import { requireCurrentLocation } from "@/lib/locations";
import { redirect } from "next/navigation";

const allowedRoles = new Set(["SUPER_ADMIN", "ADMIN", "MANAGER", "ACCOUNTANT"]);

export async function requireManagementContext() {
  const context = await requireAuthorizationContext();
  if (!context.roles.some((role) => allowedRoles.has(role))) redirect("/dashboard");
  const location = await requireCurrentLocation(context.companyId, context.membershipId);
  return { companyId: context.companyId, location };
}
