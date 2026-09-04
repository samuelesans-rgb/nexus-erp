import "server-only";

import bcrypt from "bcrypt";
import { Prisma } from "@/generated/prisma/client";
import { writeAuditLogTx } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export class UserManagementError extends Error {}

export type CompanyUserInput = {
  firstName: string;
  lastName: string;
  email: string;
  roleCodes: string[];
  locationIds: string[];
  defaultLocationId?: string | null;
  active: boolean;
};

const normalized = (values: string[]) => [...new Set(values.filter(Boolean))];

async function authorizedActor(
  tx: Prisma.TransactionClient,
  companyId: string,
  actorMembershipId: string,
) {
  const membership = await tx.membership.findFirst({
    where: {
      id: actorMembershipId,
      companyId,
      active: true,
      user: { active: true },
      company: { active: true },
      roles: {
        some: { role: { code: { in: ["SUPER_ADMIN", "ADMIN"] } } },
      },
    },
    select: {
      id: true,
      userId: true,
      roles: { select: { role: { select: { code: true } } } },
    },
  });
  if (!membership) throw new UserManagementError("Attore non autorizzato.");
  return {
    ...membership,
    roleCodes: membership.roles.map(({ role }) => role.code),
  };
}

function validateIdentity(input: CompanyUserInput) {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const email = input.email.trim().toLowerCase();
  if (!firstName || !lastName || !/^\S+@\S+\.\S+$/.test(email))
    throw new UserManagementError("Nome, cognome ed email sono obbligatori.");
  return { firstName, lastName, email };
}

async function validateAssignments(
  tx: Prisma.TransactionClient,
  companyId: string,
  actorRoleCodes: string[],
  input: CompanyUserInput,
) {
  const roleCodes = normalized(input.roleCodes);
  const locationIds = normalized(input.locationIds);
  if (!roleCodes.length || !locationIds.length)
    throw new UserManagementError("Seleziona almeno un ruolo e una sede.");
  if (
    !actorRoleCodes.includes("SUPER_ADMIN") &&
    roleCodes.includes("SUPER_ADMIN")
  )
    throw new UserManagementError(
      "Solo SUPER_ADMIN può assegnare SUPER_ADMIN.",
    );
  if (input.defaultLocationId && !locationIds.includes(input.defaultLocationId))
    throw new UserManagementError(
      "La sede predefinita deve essere autorizzata.",
    );
  const [roles, locations] = await Promise.all([
    tx.role.findMany({
      where: { code: { in: roleCodes } },
      select: { id: true, code: true },
    }),
    tx.location.findMany({
      where: {
        companyId,
        id: { in: locationIds },
        active: true,
        deletedAt: null,
      },
      select: { id: true },
    }),
  ]);
  if (
    roles.length !== roleCodes.length ||
    locations.length !== locationIds.length
  )
    throw new UserManagementError("Ruoli o sedi non validi.");
  return {
    roles,
    locationIds,
    defaultLocationId: input.defaultLocationId ?? locationIds[0],
  };
}

export async function getCompanyUsers(companyId: string) {
  return prisma.membership.findMany({
    where: { companyId },
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          active: true,
          lastLogin: true,
        },
      },
      company: { select: { name: true } },
      defaultLocation: { select: { id: true, name: true } },
      authorizedLocations: {
        include: { location: { select: { id: true, name: true } } },
        orderBy: { location: { name: "asc" } },
      },
      roles: {
        include: { role: { select: { code: true, name: true } } },
        orderBy: { role: { code: "asc" } },
      },
    },
    orderBy: [{ user: { lastName: "asc" } }, { user: { firstName: "asc" } }],
  });
}

export async function getCompanyUser(companyId: string, membershipId: string) {
  return prisma.membership.findFirst({
    where: { id: membershipId, companyId },
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          active: true,
          lastLogin: true,
          _count: { select: { memberships: true } },
        },
      },
      roles: { include: { role: true } },
      authorizedLocations: { include: { location: true } },
    },
  });
}

export async function getUserManagementOptions(
  companyId: string,
  roles: string[],
) {
  const [locations, availableRoles] = await Promise.all([
    prisma.location.findMany({
      where: { companyId, active: true, deletedAt: null },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
    prisma.role.findMany({
      where: roles.includes("SUPER_ADMIN")
        ? {}
        : { code: { not: "SUPER_ADMIN" } },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
  ]);
  return { locations, roles: availableRoles };
}

export async function createCompanyUser(
  companyId: string,
  actorMembershipId: string,
  input: CompanyUserInput & { password: string },
) {
  if (input.password.length < 12)
    throw new UserManagementError(
      "La password iniziale deve avere almeno 12 caratteri.",
    );
  const identity = validateIdentity(input);
  const passwordHash = await bcrypt.hash(input.password, 12);
  try {
    return await prisma.$transaction(async (tx) => {
      const actor = await authorizedActor(tx, companyId, actorMembershipId);
      const assignments = await validateAssignments(
        tx,
        companyId,
        actor.roleCodes,
        input,
      );
      const user = await tx.user.create({
        data: { ...identity, password: passwordHash, active: true },
      });
      const membership = await tx.membership.create({
        data: {
          companyId,
          userId: user.id,
          active: input.active,
          isDefault: true,
          defaultLocationId: assignments.defaultLocationId,
          roles: {
            create: assignments.roles.map(({ id: roleId }) => ({ roleId })),
          },
          authorizedLocations: {
            create: assignments.locationIds.map((locationId) => ({
              locationId,
            })),
          },
        },
      });
      await writeAuditLogTx(tx, {
        companyId,
        membershipId: actor.id,
        userId: actor.userId,
        locationId: assignments.defaultLocationId,
        action: "USER_MEMBERSHIP_CREATED",
        entityType: "Membership",
        entityId: membership.id,
        metadata: {
          roleCodes: assignments.roles.map(({ code }) => code),
          locationIds: assignments.locationIds,
          active: input.active,
        },
      });
      return membership;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      throw new UserManagementError(
        "Impossibile creare l’utente con i dati indicati.",
      );
    throw error;
  }
}

export async function updateCompanyUser(
  companyId: string,
  actorMembershipId: string,
  membershipId: string,
  input: CompanyUserInput,
) {
  const identity = validateIdentity(input);
  try {
    return await prisma.$transaction(async (tx) => {
      const actor = await authorizedActor(tx, companyId, actorMembershipId);
      const target = await tx.membership.findFirst({
        where: { id: membershipId, companyId },
        include: {
          user: { include: { _count: { select: { memberships: true } } } },
          roles: { include: { role: { select: { code: true } } } },
        },
      });
      if (!target) throw new UserManagementError("Utente non trovato.");
      const targetRoleCodes = target.roles.map(({ role }) => role.code);
      if (
        targetRoleCodes.includes("SUPER_ADMIN") &&
        !actor.roleCodes.includes("SUPER_ADMIN")
      )
        throw new UserManagementError(
          "Solo SUPER_ADMIN può modificare SUPER_ADMIN.",
        );
      const assignments = await validateAssignments(
        tx,
        companyId,
        actor.roleCodes,
        input,
      );
      if (
        actor.id === target.id &&
        (!input.active ||
          !assignments.roles.some(({ code }) =>
            ["SUPER_ADMIN", "ADMIN"].includes(code),
          ))
      )
        throw new UserManagementError(
          "Non puoi disattivare o rimuovere i tuoi privilegi amministrativi.",
        );
      const identityChanged =
        target.user.firstName !== identity.firstName ||
        target.user.lastName !== identity.lastName ||
        target.user.email !== identity.email;
      if (identityChanged && target.user._count.memberships > 1)
        throw new UserManagementError(
          "L’identità di un utente multi-azienda non è modificabile da questa pagina.",
        );
      if (identityChanged)
        await tx.user.update({ where: { id: target.userId }, data: identity });
      await tx.membership.update({
        where: { id: target.id },
        data: { active: input.active, defaultLocationId: null },
      });
      await tx.membershipRole.deleteMany({
        where: { membershipId: target.id },
      });
      await tx.membershipRole.createMany({
        data: assignments.roles.map(({ id: roleId }) => ({
          membershipId: target.id,
          roleId,
        })),
      });
      await tx.membershipLocation.deleteMany({
        where: { companyId, membershipId: target.id },
      });
      await tx.membershipLocation.createMany({
        data: assignments.locationIds.map((locationId) => ({
          companyId,
          membershipId: target.id,
          locationId,
        })),
      });
      await tx.membership.update({
        where: { id: target.id },
        data: { defaultLocationId: assignments.defaultLocationId },
      });
      await writeAuditLogTx(tx, {
        companyId,
        membershipId: actor.id,
        userId: actor.userId,
        locationId: assignments.defaultLocationId,
        action: "USER_MEMBERSHIP_UPDATED",
        entityType: "Membership",
        entityId: target.id,
        metadata: {
          roleCodes: assignments.roles.map(({ code }) => code),
          locationIds: assignments.locationIds,
          active: input.active,
          identityChanged,
        },
      });
      return target.id;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      throw new UserManagementError(
        "Impossibile salvare l’utente con i dati indicati.",
      );
    throw error;
  }
}

export async function setCompanyUserActive(
  companyId: string,
  actorMembershipId: string,
  membershipId: string,
  active: boolean,
) {
  return prisma.$transaction(async (tx) => {
    const actor = await authorizedActor(tx, companyId, actorMembershipId);
    const target = await tx.membership.findFirst({
      where: { id: membershipId, companyId },
      include: { roles: { include: { role: { select: { code: true } } } } },
    });
    if (!target) throw new UserManagementError("Utente non trovato.");
    if (target.id === actor.id && !active)
      throw new UserManagementError(
        "Non puoi disattivare la sessione corrente.",
      );
    if (
      target.roles.some(({ role }) => role.code === "SUPER_ADMIN") &&
      !actor.roleCodes.includes("SUPER_ADMIN")
    )
      throw new UserManagementError(
        "Solo SUPER_ADMIN può modificare SUPER_ADMIN.",
      );
    await tx.membership.update({ where: { id: target.id }, data: { active } });
    await writeAuditLogTx(tx, {
      companyId,
      membershipId: actor.id,
      userId: actor.userId,
      locationId: target.defaultLocationId,
      action: active ? "USER_MEMBERSHIP_ENABLED" : "USER_MEMBERSHIP_DISABLED",
      entityType: "Membership",
      entityId: target.id,
    });
  });
}
