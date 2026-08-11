import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { bootstrapProduction } from "../lib/production-bootstrap";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

try {
  const result = await bootstrapProduction(prisma, process.env);
  console.info(`Bootstrap production completato: ${result.enabledModuleCount} moduli abilitati.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Bootstrap production non riuscito.");
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
