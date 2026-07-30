import "dotenv/config";

import bcrypt from "bcrypt";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding database...");

  const password = await bcrypt.hash("Admin123!", 12);

  const company = await prisma.company.upsert({
    where: {
      vatNumber: "IT00000000000",
    },
    update: {},
    create: {
      name: "Nexus ERP Demo",
      legalName: "Nexus ERP Demo S.r.l.",
      vatNumber: "IT00000000000",
      country: "Italia",
    },
  });

  const user = await prisma.user.upsert({
    where: {
      email: "admin@nexuserp.local",
    },
    update: {},
    create: {
      firstName: "Super",
      lastName: "Admin",
      email: "admin@nexuserp.local",
      password,
    },
  });

  const role = await prisma.role.upsert({
    where: {
      code: "SUPER_ADMIN",
    },
    update: {},
    create: {
      code: "SUPER_ADMIN",
      name: "Super Administrator",
    },
  });

  const membership = await prisma.membership.upsert({
    where: {
      userId_companyId: {
        userId: user.id,
        companyId: company.id,
      },
    },
    update: {},
    create: {
      userId: user.id,
      companyId: company.id,
      active: true,
      isDefault: true,
    },
  });

  await prisma.membershipRole.upsert({
    where: {
      membershipId_roleId: {
        membershipId: membership.id,
        roleId: role.id,
      },
    },
    update: {},
    create: {
      membershipId: membership.id,
      roleId: role.id,
    },
  });

  console.log("✅ Seed completato");
  console.log("Email: admin@nexuserp.local");
  console.log("Password: Admin123!");
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });