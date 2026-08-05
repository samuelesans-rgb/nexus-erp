import "dotenv/config";

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";

const sourceUrl = process.env.DATABASE_URL ?? "";
const databaseUrl = sourceUrl.includes("_test") ? sourceUrl : sourceUrl.replace("nexus_erp", "nexus_erp_test");

if (!databaseUrl.includes("_test")) {
  throw new Error("La suite E2E richiede DATABASE_URL con un database _test.");
}

process.env.DATABASE_URL = databaseUrl;

const cachedChromium = join(homedir(), ".cache", "ms-playwright", "chromium-1187", "chrome-linux", "chrome");

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  retries: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
    headless: true,
    launchOptions: existsSync(cachedChromium) ? { executablePath: cachedChromium } : undefined,
  },
  webServer: {
    command: "npm run dev -- -p 3100",
    url: "http://127.0.0.1:3100/login",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      AUTH_URL: "http://127.0.0.1:3100",
      AUTH_TRUST_HOST: "true",
    },
  },
});
