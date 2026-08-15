import "server-only";

import { auth } from "@/auth";
import { requireCurrentLocation } from "@/lib/locations";
import { redirect } from "next/navigation";

const allowedRoles = new Set(["SUPER_ADMIN", "ADMIN", "MANAGER", "ACCOUNTANT"]);

export async function requireManagementContext() {
  const session = await auth();
  if (!session?.user?.companyId) redirect("/login");
  if (!session.user.roles.some((role) => allowedRoles.has(role))) redirect("/dashboard");
  const location = await requireCurrentLocation(session.user.companyId, session.user.membershipId);
  return { companyId: session.user.companyId, location };
}
