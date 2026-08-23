import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { writeAuditLogTx } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export class MembershipDomainError extends Error {}

async function actor(tx: Prisma.TransactionClient, companyId: string, actorMembershipId: string) {
  const row = await tx.membership.findFirst({ where: { id: actorMembershipId, companyId, active: true, user: { active: true }, company: { active: true }, roles: { some: { role: { code: { in: ["SUPER_ADMIN", "ADMIN"] } } } } }, select: { id: true, userId: true } });
  if (!row) throw new MembershipDomainError("Attore non autorizzato.");
  return row;
}

export async function createMembership(companyId: string, actorMembershipId: string, input: { userId: string; roleCodes?: string[]; locationIds: string[]; defaultLocationId?: string | null }) {
  const locationIds = [...new Set(input.locationIds)];
  const roleCodes = [...new Set(input.roleCodes ?? [])];
  return prisma.$transaction(async (tx) => {
    const currentActor = await actor(tx, companyId, actorMembershipId);
    const [user, roles, validLocations] = await Promise.all([
      tx.user.findFirst({ where: { id: input.userId, active: true }, select: { id: true } }),
      tx.role.findMany({ where: { code: { in: roleCodes } }, select: { id: true, code: true } }),
      tx.location.count({ where: { companyId, id: { in: locationIds }, active: true, deletedAt: null } }),
    ]);
    if (!user || roles.length !== roleCodes.length || validLocations !== locationIds.length || (input.defaultLocationId && !locationIds.includes(input.defaultLocationId))) throw new MembershipDomainError("Dati Membership non validi.");
    const membership = await tx.membership.create({ data: { companyId, userId: user.id, active: true } });
    if (roles.length) await tx.membershipRole.createMany({ data: roles.map(({ id: roleId }) => ({ membershipId: membership.id, roleId })) });
    if (locationIds.length) await tx.membershipLocation.createMany({ data: locationIds.map((locationId) => ({ companyId, membershipId: membership.id, locationId })) });
    await tx.membership.update({ where: { id: membership.id }, data: { defaultLocationId: input.defaultLocationId ?? locationIds[0] ?? null } });
    await writeAuditLogTx(tx, { companyId, membershipId: currentActor.id, userId: currentActor.userId, locationId: input.defaultLocationId, action: "MEMBERSHIP_CREATED", entityType: "Membership", entityId: membership.id, metadata: { roleCodes: roles.map(({ code }) => code), locationIds } });
    return membership;
  });
}

export async function setMembershipActive(companyId: string, actorMembershipId: string, membershipId: string, active: boolean) {
  return prisma.$transaction(async (tx) => {
    const currentActor = await actor(tx, companyId, actorMembershipId);
    const target = await tx.membership.findFirst({ where: { id: membershipId, companyId }, select: { id: true, userId: true } });
    if (!target) throw new MembershipDomainError("Membership non trovata.");
    if (!active && target.id === currentActor.id) throw new MembershipDomainError("Non puoi disattivare la Membership corrente.");
    await tx.membership.update({ where: { id: target.id }, data: { active } });
    await writeAuditLogTx(tx, { companyId, membershipId: currentActor.id, userId: currentActor.userId, action: active ? "MEMBERSHIP_ENABLED" : "MEMBERSHIP_DISABLED", entityType: "Membership", entityId: target.id });
  });
}

export async function setMembershipRoles(companyId: string, actorMembershipId: string, membershipId: string, roleCodes: string[]) {
  return prisma.$transaction(async (tx) => {
    const currentActor = await actor(tx, companyId, actorMembershipId);
    const target = await tx.membership.findFirst({ where: { id: membershipId, companyId }, select: { id: true } });
    const roles = await tx.role.findMany({ where: { code: { in: [...new Set(roleCodes)] } }, select: { id: true, code: true } });
    if (!target || roles.length !== new Set(roleCodes).size) throw new MembershipDomainError("Membership o ruoli non validi.");
    await tx.membershipRole.deleteMany({ where: { membershipId: target.id } });
    await tx.membershipRole.createMany({ data: roles.map(({ id: roleId }) => ({ membershipId: target.id, roleId })) });
    await writeAuditLogTx(tx, { companyId, membershipId: currentActor.id, userId: currentActor.userId, action: "MEMBERSHIP_ROLES_CHANGED", entityType: "Membership", entityId: target.id, metadata: { roleCodes: roles.map(({ code }) => code) } });
  });
}

export async function setMembershipLocations(companyId: string, actorMembershipId: string, membershipId: string, locationIds: string[], defaultLocationId?: string | null) {
  const uniqueLocations = [...new Set(locationIds)];
  return prisma.$transaction(async (tx) => {
    const currentActor = await actor(tx, companyId, actorMembershipId);
    const target = await tx.membership.findFirst({ where: { id: membershipId, companyId }, select: { id: true } });
    const valid = await tx.location.count({ where: { companyId, id: { in: uniqueLocations }, active: true, deletedAt: null } });
    if (!target || valid !== uniqueLocations.length || (defaultLocationId && !uniqueLocations.includes(defaultLocationId))) throw new MembershipDomainError("ACL Location non valida.");
    await tx.membership.update({ where: { id: target.id }, data: { defaultLocationId: null } });
    await tx.membershipLocation.deleteMany({ where: { companyId, membershipId: target.id } });
    await tx.membershipLocation.createMany({ data: uniqueLocations.map((locationId) => ({ companyId, membershipId: target.id, locationId })) });
    await tx.membership.update({ where: { id: target.id }, data: { defaultLocationId: defaultLocationId ?? uniqueLocations[0] ?? null } });
    await writeAuditLogTx(tx, { companyId, membershipId: currentActor.id, userId: currentActor.userId, locationId: defaultLocationId, action: "MEMBERSHIP_LOCATIONS_CHANGED", entityType: "Membership", entityId: target.id, metadata: { locationIds: uniqueLocations } });
  });
}
