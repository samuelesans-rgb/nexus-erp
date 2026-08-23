import "server-only";

import { requireAuthorizationContext } from "@/lib/authorization";
import { MODULE_CODES } from "@/lib/module-catalog";
import { requireModule } from "@/lib/modules";
import { getCurrentLocation as getMembershipCurrentLocation, requireCurrentLocation as requireMembershipCurrentLocation } from "@/lib/locations";
import { redirect } from "next/navigation";

const administrators = new Set(["SUPER_ADMIN", "ADMIN"]);
const readers = new Set(["SUPER_ADMIN", "ADMIN", "MANAGER"]);

export function canReadLocations(roles: readonly string[]) {
  return roles.some((role) => readers.has(role));
}

export function canManageLocations(roles: readonly string[]) {
  return roles.some((role) => administrators.has(role));
}

export async function requireLocationContext() {
  const context = await requireAuthorizationContext();
  await requireModule(context.companyId, MODULE_CODES.CORE_LOCATIONS);
  return { companyId: context.companyId, membershipId: context.membershipId, userId: context.userId, roles: context.roles };
}

export async function getCurrentLocation() {
  const context = await requireLocationContext();
  return getMembershipCurrentLocation(context.companyId, context.membershipId);
}

export async function requireCurrentLocation() {
  const context = await requireLocationContext();
  return requireMembershipCurrentLocation(context.companyId, context.membershipId);
}

export async function requireLocationAdmin() {
  const context = await requireLocationContext();
  if (!canManageLocations(context.roles)) redirect("/dashboard");
  return context;
}

export async function requireLocationReader() {
  const context = await requireLocationContext();
  if (!canReadLocations(context.roles)) redirect("/dashboard");
  return context;
}
