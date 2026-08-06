import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { prisma } from "../../lib/prisma";
import { canManageLocations } from "../../lib/location-access";
import { LocationDomainError, archiveLocation, createLocation, getCurrentLocation, restoreLocation, setCurrentLocation, setHeadquarters, updateLocation } from "../../lib/locations";

const databaseUrl = process.env.DATABASE_URL ?? "";
if (!databaseUrl.includes("_test")) throw new Error("I test Locations richiedono un DATABASE_URL dedicato contenente _test.");

let companyId = "";
let otherCompanyId = "";
let userId = "";
let membershipId = "";
let headquartersId = "";
const createdLocationIds: string[] = [];

before(async () => {
  const company = await prisma.company.findUniqueOrThrow({ where: { vatNumber: "IT00000000000" } });
  const membership = await prisma.membership.findFirstOrThrow({ where: { companyId: company.id, active: true }, select: { id: true, userId: true } });
  const headquarters = await prisma.location.findFirstOrThrow({ where: { companyId: company.id, active: true, deletedAt: null, isHeadquarters: true } });
  const other = await prisma.company.create({ data: { name: `Location tenant ${randomUUID()}` } });
  companyId = company.id; otherCompanyId = other.id; userId = membership.userId; membershipId = membership.id; headquartersId = headquarters.id;
});

after(async () => {
  if (createdLocationIds.length) {
    await prisma.membership.updateMany({ where: { companyId, defaultLocationId: { in: createdLocationIds } }, data: { defaultLocationId: headquartersId } });
    await prisma.location.deleteMany({ where: { id: { in: createdLocationIds } } });
  }
  if (otherCompanyId) await prisma.company.delete({ where: { id: otherCompanyId } });
  await prisma.$disconnect();
});

async function create(code: string) {
  const location = await createLocation(companyId, userId, { code, name: `Sede ${code}`, city: "Milano" });
  createdLocationIds.push(location.id);
  return location;
}

test("Locations: creazione, modifica e unicità codice per Company", async () => {
  const location = await create(`LOC-${randomUUID().slice(0, 8)}`);
  assert.match(location.slug, /^sede-loc-[a-z0-9-]+$/);
  await updateLocation(companyId, userId, location.id, { slug: location.slug, code: location.code, name: "Sede aggiornata", country: "it" });
  const updated = await prisma.location.findUniqueOrThrow({ where: { id: location.id } });
  assert.equal(updated.name, "Sede aggiornata"); assert.equal(updated.country, "IT"); assert.equal(updated.slug, location.slug);
  await assert.rejects(updateLocation(companyId, userId, location.id, { slug: "slug-modificato", code: location.code, name: location.name }), LocationDomainError);
  await assert.rejects(createLocation(otherCompanyId, userId, { slug: location.slug, code: "SLUG-DUP", name: "Slug duplicato" }), LocationDomainError);
  await assert.rejects(createLocation(companyId, userId, { code: location.code, name: "Duplicata" }));
  const other = await createLocation(otherCompanyId, userId, { code: location.code, name: "Stesso codice, altro tenant" });
  assert.notEqual(other.slug, location.slug);
  await prisma.location.delete({ where: { id: other.id } });
});

test("Locations: headquarters unica e cambio atomico", async () => {
  const location = await create(`HQ-${randomUUID().slice(0, 8)}`);
  await setHeadquarters(companyId, userId, location.id);
  assert.equal(await prisma.location.count({ where: { companyId, active: true, deletedAt: null, isHeadquarters: true } }), 1);
  assert.equal((await prisma.location.findUniqueOrThrow({ where: { id: location.id } })).isHeadquarters, true);
  await setHeadquarters(companyId, userId, headquartersId);
});

test("Locations: archiviazione unica sede e soft delete/ripristino", async () => {
  const location = await create(`ARC-${randomUUID().slice(0, 8)}`);
  await archiveLocation(companyId, userId, location.id);
  let archived = await prisma.location.findUniqueOrThrow({ where: { id: location.id } });
  assert.equal(archived.active, false); assert.ok(archived.deletedAt);
  await restoreLocation(companyId, userId, location.id);
  archived = await prisma.location.findUniqueOrThrow({ where: { id: location.id } });
  assert.equal(archived.active, true); assert.equal(archived.deletedAt, null);
  await assert.rejects(archiveLocation(companyId, userId, headquartersId), LocationDomainError);
});

test("Locations: sede corrente tenant-safe e rifiuto sede inattiva o cross-tenant", async () => {
  const location = await create(`CTX-${randomUUID().slice(0, 8)}`);
  await setCurrentLocation(companyId, membershipId, location.id);
  assert.equal((await getCurrentLocation(companyId, membershipId))?.id, location.id);
  await archiveLocation(companyId, userId, location.id);
  await assert.rejects(setCurrentLocation(companyId, membershipId, location.id), LocationDomainError);
  const crossTenant = await createLocation(otherCompanyId, userId, { code: "CROSS", name: "Cross tenant" });
  await assert.rejects(setCurrentLocation(companyId, membershipId, crossTenant.id), LocationDomainError);
  await prisma.location.delete({ where: { id: crossTenant.id } });
  await restoreLocation(companyId, userId, location.id);
  await setCurrentLocation(companyId, membershipId, headquartersId);
});

test("Locations: policy CRUD solo amministratori", () => {
  assert.equal(canManageLocations(["ADMIN"]), true);
  assert.equal(canManageLocations(["SUPER_ADMIN"]), true);
  assert.equal(canManageLocations(["MANAGER", "SALES"]), false);
});
