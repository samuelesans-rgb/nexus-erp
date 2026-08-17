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
  slug?: string | null;
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
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
    .replace(/-+$/g, "");
}

function requestedSlug(value?: string | null) {
  if (!value?.trim()) return undefined;
  const slug = value.trim();
  if (slug.length > 120 || !slugPattern.test(slug)) {
    throw new LocationDomainError("Lo slug deve essere minuscolo e contenere solo lettere, numeri e trattini.");
  }
  return slug;
}

async function initialSlug(tx: Prisma.TransactionClient, name: string, requested?: string | null) {
  const explicit = requestedSlug(requested);
  if (explicit) {
    if (await tx.location.findUnique({ where: { slug: explicit }, select: { id: true } })) throw new LocationDomainError("Lo slug pubblico è già utilizzato da un'altra sede.");
    return explicit;
  }
  const base = slugify(name) || "location";
  for (let suffix = 1; suffix <= 1000; suffix++) {
    const tail = suffix === 1 ? "" : `-${suffix}`;
    const candidate = `${base.slice(0, 120 - tail.length)}${tail}`;
    if (!(await tx.location.findUnique({ where: { slug: candidate }, select: { id: true } }))) return candidate;
  }
  throw new LocationDomainError("Impossibile generare uno slug pubblico univoco per la sede.");
}

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
  const country = (input.country?.trim() || "IT").toUpperCase();
  const currency = (input.currency?.trim() || "EUR").toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) throw new LocationDomainError("Il paese deve essere un codice ISO di 2 lettere.");
  if (!/^[A-Z]{3}$/.test(currency)) throw new LocationDomainError("La valuta deve essere un codice ISO di 3 lettere.");
  const email = input.email?.trim() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new LocationDomainError("L’indirizzo email non è valido.");
  return {
    code,
    name,
    description: input.description?.trim() || null,
    email,
    phone: input.phone?.trim() || null,
    address: input.address?.trim() || null,
    city: input.city?.trim() || null,
    province: input.province?.trim() || null,
    postalCode: input.postalCode?.trim() || null,
    country,
    timezone: input.timezone?.trim() || "Europe/Rome",
    currency,
    active: input.active ?? true,
  };
}

export async function createLocation(companyId: string, userId: string, input: LocationInput) {
  const data = normalized(input);
  try {
    return await prisma.$transaction(async (tx) => {
      const [activeLocations, slug] = await Promise.all([
        tx.location.count({ where: { companyId, ...live } }),
        initialSlug(tx, data.name, input.slug),
      ]);
      return tx.location.create({
        data: {
          companyId,
          slug,
          ...data,
          isHeadquarters: activeLocations === 0,
          createdById: userId,
          updatedById: userId,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof LocationDomainError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new LocationDomainError("Codice o slug già utilizzato. Scegli un valore diverso.");
    }
    throw error;
  }
}

export async function updateLocation(companyId: string, userId: string, id: string, input: LocationInput) {
  const data = normalized(input);
  const slug = requestedSlug(input.slug);
  try {
    await prisma.$transaction(async (tx) => {
      const current = await tx.location.findFirst({ where: { id, companyId }, select: { slug: true, active: true, isHeadquarters: true, deletedAt: true } });
      if (!current) throw new LocationDomainError("Sede non trovata nella Company corrente.");
      if (current.deletedAt) throw new LocationDomainError("Ripristina la sede prima di modificarla.");
      if (slug && slug !== current.slug) throw new LocationDomainError("Lo slug pubblico non può essere modificato dopo la creazione.");
      if (current.active && !data.active) {
        const activeCount = await tx.location.count({ where: { companyId, ...live } });
        if (activeCount <= 1) throw new LocationDomainError("Non è possibile disattivare l'unica sede attiva.");
        if (current.isHeadquarters) throw new LocationDomainError("Promuovi prima un'altra sede a headquarters.");
      }
      await tx.location.update({ where: { id }, data: { ...data, updatedById: userId } });
    });
  } catch (error) {
    if (error instanceof LocationDomainError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new LocationDomainError("Il codice sede è già utilizzato nella Company corrente.");
    throw error;
  }
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
