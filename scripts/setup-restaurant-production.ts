import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { setupRestaurantProduction } from "../lib/restaurant-production-setup";

const { values } = parseArgs({ options: { config: { type: "string", short: "c" }, "dry-run": { type: "boolean", default: false } }, strict: true });
if (!values.config) throw new Error("Uso: npm run setup:restaurant:production -- --config <file> [--dry-run]");
const rawConfig = JSON.parse(await readFile(resolve(values.config), "utf8")) as unknown;
const connectionString = process.env.DATABASE_URL; if (!connectionString) throw new Error("DATABASE_URL mancante.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
try { const result = await setupRestaurantProduction(prisma, rawConfig, process.env, { dryRun: values["dry-run"] }); console.info(values["dry-run"] ? "Dry-run completato: nessuna scrittura eseguita." : "Setup Restaurant production completato."); for (const action of result.actions) console.info(`${action.entity} ${action.code}: ${action.action}`); }
catch (error) { console.error(error instanceof Error ? error.message : "Setup Restaurant production non riuscito."); process.exitCode = 1; }
finally { await prisma.$disconnect(); }
