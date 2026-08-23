import { spawnSync } from "node:child_process";
import process from "node:process";
import pg from "pg";

const DATABASE_NAME = "nexus_bootstrap_isolated_test";
const source = process.env.BOOTSTRAP_TEST_DATABASE_URL || process.env.DATABASE_URL;
if (!source) throw new Error("DATABASE_URL o BOOTSTRAP_TEST_DATABASE_URL obbligatorio.");
const testUrl = new URL(source);
testUrl.pathname = "/" + DATABASE_NAME;
if (testUrl.pathname.slice(1) !== DATABASE_NAME || !DATABASE_NAME.endsWith("_test")) throw new Error("Database bootstrap non sicuro.");
const adminUrl = new URL(source);
adminUrl.pathname = "/postgres";
const admin = new pg.Client({ connectionString: adminUrl.toString() });
await admin.connect();
try {
  const existing = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [DATABASE_NAME]);
  if (!existing.rowCount) await admin.query('CREATE DATABASE "nexus_bootstrap_isolated_test"');
} finally {
  await admin.end();
}
const environment = { ...process.env, DATABASE_URL: testUrl.toString() };
const migrate = spawnSync("npx", ["prisma", "migrate", "deploy"], { env: environment, stdio: "inherit" });
if (migrate.status !== 0) process.exit(migrate.status ?? 1);
const guard = new pg.Client({ connectionString: testUrl.toString() });
await guard.connect();
try {
  const tenants = await guard.query('SELECT "vatNumber" FROM "Company"');
  if (tenants.rows.some((row) => row.vatNumber !== "ITBOOTSTRAPTEST001")) throw new Error("nexus_bootstrap_isolated_test contiene tenant estranei: esecuzione rifiutata.");
} finally {
  await guard.end();
}
const test = spawnSync("node", ["--import", "tsx", "--loader", "./tests/register-server-only-loader.mjs", "--test", "--test-concurrency=1", "tests/integration/production-bootstrap.test.ts"], { env: environment, stdio: "inherit" });
process.exit(test.status ?? 1);
