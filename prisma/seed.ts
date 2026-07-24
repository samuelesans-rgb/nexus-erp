import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({
  adapter,
});

async function main() {
  const password = await bcrypt.hash("Admin123!", 10);

  const company = await prisma.company.upsert({
    where: { vatNumber: "00000000000" },
    update: {},
    create: {
      name: "Nexus ERP",
      vatNumber: "00000000000",
      country: "Italia",
    },
  });

  await prisma.user.upsert({
    where: {
      email: "admin@nexus.local",
    },
    update: {},
    create: {
      firstName: "System",
      lastName: "Administrator",
      email: "admin@nexus.local",
      password,
      role: "ADMIN",
      companyId: company.id,
    },
  });

  console.log("✅ Amministratore creato");
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  });