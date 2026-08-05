import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export class LocationDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LocationDomainError";
  }
}

export type LocationInput = {
  code: string;
  name: string;
  description?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  country?: string;
  timezone?: string;
  currency?: string;
  active?: boolean;
};

const live = { active: true, deletedAt: null } as const;

export async function getLocations(
  companyId: string,
  options: { q?: string; lifecycle?: "current" | "archived" | "all" } = {},
) {
  const lifecycle = options.lifecycle ?? "current";
  return prisma.location.findMany({
    where: {
      companyId,
      ...(lifecycle === "current" ? { deletedAt: null } : lifecycle === "archived" ? { deletedAt: { not: null } } : {}),
      ...(options.q
        ? {
            OR: [
              { code: { contains: options.q, mode: "insensitive" } },
              { name: { contains: options.q, mode: "insensitive" } },
              { city: { contains: options.q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ isHeadquarters: "desc" }, { code: "asc" }],
  });
}

export async function getLocation(companyId: string, id: string) {
  return prisma.location.findFirst({ where: { id, companyId } });
}

function normalized(input: LocationInput) {
  const code = input.code.trim().toUpperCase();
  const name = input.name.trim();
  if (!code || !/^[A-Z0-9][A-Z0-9_-]*$/.test(code)) {
    throw new LocationDomainError("Il codice sede non è valido.");
  }
  if (!name) throw new LocationDomainError("Il nome della sede è obbligatorio.");
  return {
    code,
    name,
    description: input.description?.trim() || null,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    address: input.address?.trim() || null,
    city: input.city?.trim() || null,
    province: input.province?.trim() || null,
    postalCode: input.postalCode?.trim() || null,
    country: (input.country?.trim() || "IT").toUpperCase(),
    timezone: input.timezone?.trim() || "Europe/Rome",
    currency: (input.currency?.trim() || "EUR").toUpperCase(),
    active: input.active ?? true,
  };
}

export async function createLocation(companyId: string, userId: string, input: LocationInput) {
  const data = normalized(input);
  return prisma.$transaction(async (tx) => {
    const activeLocations = await tx.location.count({ where: { companyId, ...live } });
    return tx.location.create({
      data: {
        companyId,
        ...data,
        isHeadquarters: activeLocations === 0,
        createdById: userId,
        updatedById: userId,
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function updateLocation(companyId: string, userId: string, id: string, input: LocationInput) {
  const data = normalized(input);
  const updated = await prisma.location.updateMany({
    where: { id, companyId },
    data: { ...data, updatedById: userId },
  });
  if (!updated.count) throw new LocationDomainError("Sede non trovata nella Company corrente.");
}

export async function archiveLocation(companyId: string, userId: string, id: string) {
  await prisma.$transaction(async (tx) => {
    const location = await tx.location.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!location) throw new LocationDomainError("Sede non trovata nella Company corrente.");
    if (location.active) {
      const activeCount = await tx.location.count({ where: { companyId, ...live } });
      if (activeCount <= 1) throw new LocationDomainError("Non è possibile archiviare l'unica sede attiva.");
      if (location.isHeadquarters) {
        const otherHeadquarters = await tx.location.count({ where: { companyId, ...live, isHeadquarters: true, id: { not: id } } });
        if (!otherHeadquarters) throw new LocationDomainError("Promuovi prima un'altra sede a headquarters.");
      }
    }
    await tx.location.update({ where: { id: location.id }, data: { active: false, deletedAt: new Date(), updatedById: userId } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function restoreLocation(companyId: string, userId: string, id: string) {
  const updated = await prisma.location.updateMany({
    where: { id, companyId, deletedAt: { not: null } },
    data: { active: true, deletedAt: null, updatedById: userId },
  });
  if (!updated.count) throw new LocationDomainError("Sede archiviata non trovata nella Company corrente.");
}

export async function setHeadquarters(companyId: string, userId: string, id: string) {
  await prisma.$transaction(async (tx) => {
    const location = await tx.location.findFirst({ where: { id, companyId, ...live }, select: { id: true } });
    if (!location) throw new LocationDomainError("La sede headquarters deve essere attiva.");
    await tx.location.updateMany({ where: { companyId, ...live, isHeadquarters: true }, data: { isHeadquarters: false, updatedById: userId } });
    await tx.location.update({ where: { id: location.id }, data: { isHeadquarters: true, updatedById: userId } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function getCurrentLocation(companyId: string, membershipId: string) {
  const membership = await prisma.membership.findFirst({
    where: { id: membershipId, companyId, active: true },
    select: { defaultLocation: true },
  });
  if (!membership) throw new LocationDomainError("Membership non attiva nella Company corrente.");
  if (membership.defaultLocation && membership.defaultLocation.active && !membership.defaultLocation.deletedAt) return membership.defaultLocation;
  return prisma.location.findFirst({ where: { companyId, ...live, isHeadquarters: true } });
}

export async function setCurrentLocation(companyId: string, membershipId: string, locationId: string) {
  const location = await prisma.location.findFirst({ where: { id: locationId, companyId, ...live }, select: { id: true } });
  if (!location) throw new LocationDomainError("La sede selezionata non è attiva nella Company corrente.");
  const updated = await prisma.membership.updateMany({ where: { id: membershipId, companyId, active: true }, data: { defaultLocationId: location.id } });
  if (!updated.count) throw new LocationDomainError("Membership non attiva nella Company corrente.");
  return location;
}

export async function requireCurrentLocation(companyId: string, membershipId: string) {
  const location = await getCurrentLocation(companyId, membershipId);
  if (!location) throw new LocationDomainError("Nessuna sede attiva configurata per la Company corrente.");
  return location;
}
