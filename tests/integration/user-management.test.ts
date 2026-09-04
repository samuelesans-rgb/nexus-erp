import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after, before } from "node:test";
import bcrypt from "bcrypt";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";
import { canManageUsers } from "../../lib/user-access";
import {
  createCompanyUser,
  getCompanyUser,
  getCompanyUsers,
  setCompanyUserActive,
  updateCompanyUser,
  UserManagementError,
} from "../../lib/user-management";

const databaseUrl = process.env.DATABASE_URL ?? "";
if (!databaseUrl.includes("_test"))
  throw new Error("User management integration requires a _test database.");
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

const suffix = randomUUID().slice(0, 8);
let companyA = "";
let companyB = "";
let locationA = "";
let locationA2 = "";
let locationB = "";
let superMembership = "";
let adminMembership = "";
let salaMembership = "";
const userIds: string[] = [];

async function actorFixture(
  companyId: string,
  locationId: string,
  roleCode: string,
  label: string,
) {
  const role = await prisma.role.upsert({
    where: { code: roleCode },
    update: {},
    create: { code: roleCode, name: roleCode },
  });
  const user = await prisma.user.create({
    data: {
      firstName: label,
      lastName: "Tester",
      email: `${label.toLowerCase()}-${suffix}@test.invalid`,
      password: await bcrypt.hash("UsersTest123!", 4),
    },
  });
  userIds.push(user.id);
  const membership = await prisma.membership.create({
    data: {
      companyId,
      userId: user.id,
      active: true,
      isDefault: true,
      defaultLocationId: locationId,
      roles: { create: { roleId: role.id } },
      authorizedLocations: { create: { locationId } },
    },
  });
  return membership.id;
}

before(async () => {
  const a = await prisma.company.create({
    data: { name: `Users A ${suffix}`, currency: "EUR" },
  });
  const b = await prisma.company.create({
    data: { name: `Users B ${suffix}`, currency: "EUR" },
  });
  companyA = a.id;
  companyB = b.id;
  const [a1, a2, b1] = await Promise.all([
    prisma.location.create({
      data: { companyId: a.id, code: `A1-${suffix}`, name: "Sede A1" },
    }),
    prisma.location.create({
      data: { companyId: a.id, code: `A2-${suffix}`, name: "Sede A2" },
    }),
    prisma.location.create({
      data: { companyId: b.id, code: `B1-${suffix}`, name: "Sede B1" },
    }),
  ]);
  locationA = a1.id;
  locationA2 = a2.id;
  locationB = b1.id;
  await Promise.all(
    ["ADMIN", "MANAGER", "SALA", "SUPER_ADMIN"].map((code) =>
      prisma.role.upsert({
        where: { code },
        update: {},
        create: { code, name: code },
      }),
    ),
  );
  superMembership = await actorFixture(a.id, a1.id, "SUPER_ADMIN", "Super");
  adminMembership = await actorFixture(a.id, a1.id, "ADMIN", "Admin");
  salaMembership = await actorFixture(a.id, a1.id, "SALA", "Sala");
});

after(async () => {
  await prisma.auditLog.deleteMany({
    where: { companyId: { in: [companyA, companyB] } },
  });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.company.deleteMany({
    where: { id: { in: [companyA, companyB] } },
  });
  await prisma.$disconnect();
});

test("capability utenti consente solo amministratori", () => {
  assert.equal(canManageUsers(["SUPER_ADMIN"]), true);
  assert.equal(canManageUsers(["ADMIN"]), true);
  assert.equal(canManageUsers(["SALA"]), false);
  assert.equal(canManageUsers(["MANAGER"]), false);
});

test("creazione SALA è atomica, hashed, tenant-safe e auditata", async () => {
  const password = "CameriereTest123!";
  const membership = await createCompanyUser(companyA, superMembership, {
    firstName: "Mario",
    lastName: "Sala",
    email: `cameriere-${suffix}@test.invalid`,
    password,
    roleCodes: ["SALA"],
    locationIds: [locationA],
    defaultLocationId: locationA,
    active: true,
  });
  userIds.push(
    (
      await prisma.membership.findUniqueOrThrow({
        where: { id: membership.id },
      })
    ).userId,
  );
  const saved = await getCompanyUser(companyA, membership.id);
  assert(saved);
  assert.deepEqual(
    saved.roles.map(({ role }) => role.code),
    ["SALA"],
  );
  assert.deepEqual(
    saved.authorizedLocations.map(({ locationId }) => locationId),
    [locationA],
  );
  const credentials = await prisma.user.findUniqueOrThrow({
    where: { id: saved.user.id },
  });
  assert.notEqual(credentials.password, password);
  assert.equal(await bcrypt.compare(password, credentials.password), true);
  assert.equal(await getCompanyUser(companyB, membership.id), null);
  assert.equal(
    await prisma.auditLog.count({
      where: {
        companyId: companyA,
        entityId: membership.id,
        action: "USER_MEMBERSHIP_CREATED",
      },
    }),
    1,
  );
});

test("modifica ruoli/sedi e attiva-disattiva restano nella company", async () => {
  const target = (await getCompanyUsers(companyA)).find(({ user }) =>
    user.email.startsWith(`cameriere-${suffix}`),
  );
  assert(target);
  await updateCompanyUser(companyA, superMembership, target.id, {
    firstName: "Mario",
    lastName: "Rossi",
    email: target.user.email,
    roleCodes: ["MANAGER"],
    locationIds: [locationA, locationA2],
    defaultLocationId: locationA2,
    active: true,
  });
  const updated = await getCompanyUser(companyA, target.id);
  assert(updated);
  assert.equal(updated.user.lastName, "Rossi");
  assert.deepEqual(
    updated.roles.map(({ role }) => role.code),
    ["MANAGER"],
  );
  assert.equal(updated.defaultLocationId, locationA2);
  await setCompanyUserActive(companyA, superMembership, target.id, false);
  assert.equal((await getCompanyUser(companyA, target.id))?.active, false);
  await setCompanyUserActive(companyA, superMembership, target.id, true);
  assert.equal((await getCompanyUser(companyA, target.id))?.active, true);
  await assert.rejects(
    updateCompanyUser(companyA, superMembership, target.id, {
      firstName: "Mario",
      lastName: "Rossi",
      email: target.user.email,
      roleCodes: ["SALA"],
      locationIds: [locationB],
      defaultLocationId: locationB,
      active: true,
    }),
    UserManagementError,
  );
  await assert.rejects(
    setCompanyUserActive(companyB, superMembership, target.id, false),
    UserManagementError,
  );
});

test("SALA è negato server-side e ADMIN non può elevare a SUPER_ADMIN", async () => {
  await assert.rejects(
    createCompanyUser(companyA, salaMembership, {
      firstName: "Denied",
      lastName: "Sala",
      email: `denied-${suffix}@test.invalid`,
      password: "DeniedUsers123!",
      roleCodes: ["SALA"],
      locationIds: [locationA],
      active: true,
    }),
    UserManagementError,
  );
  await assert.rejects(
    createCompanyUser(companyA, adminMembership, {
      firstName: "Escalation",
      lastName: "Denied",
      email: `escalation-${suffix}@test.invalid`,
      password: "Escalation123!",
      roleCodes: ["SUPER_ADMIN"],
      locationIds: [locationA],
      active: true,
    }),
    UserManagementError,
  );
});
