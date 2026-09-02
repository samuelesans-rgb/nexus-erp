import "dotenv/config";
import { parseArgs } from "node:util";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { configureFrisaFusionMenu } from "../lib/restaurant-fusion-menu";

const { values } = parseArgs({ options: { "company-id": { type: "string" }, "location-id": { type: "string" }, "dry-run": { type: "boolean", default: false } }, strict: true });
if (!values["company-id"] || !values["location-id"]) throw new Error("Uso: npm run setup:restaurant:fusion-menu -- --company-id <id> --location-id <id> [--dry-run]");
const connectionString = process.env.DATABASE_URL; if (!connectionString) throw new Error("DATABASE_URL mancante.");
const client = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
try { console.info(JSON.stringify(await configureFrisaFusionMenu(client, values["company-id"], values["location-id"], { dryRun: values["dry-run"] }), null, 2)); }
finally { await client.$disconnect(); }
