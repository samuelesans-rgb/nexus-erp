import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { checkProviderConfiguration, resolveOpenBankingCallbackUrl } from "../../lib/open-banking/config";
import { getOpenBankingProvider, getOpenBankingProviderByName, ProviderConfigurationError } from "../../lib/open-banking/registry";

const callback: NodeJS.ProcessEnv = { AUTH_URL: "https://erp.frisabistro.com", OPEN_BANKING_CALLBACK_URL: "https://erp.frisabistro.com/api/open-banking/callback", NODE_ENV: "production" };
const complete = (provider: "enable-banking" | "yapily" | "tink") => {
  const env: NodeJS.ProcessEnv = { ...callback, OPEN_BANKING_PROVIDER: provider };
  if (provider === "enable-banking") Object.assign(env, { ENABLE_BANKING_CLIENT_ID: "id", ENABLE_BANKING_CLIENT_SECRET: "secret-value", ENABLE_BANKING_BNL_INSTITUTION_ID: "bnl-id", ENABLE_BANKING_INTESA_INSTITUTION_ID: "intesa-id", ENABLE_BANKING_SANDBOX: "true" });
  if (provider === "yapily") Object.assign(env, { YAPILY_APPLICATION_KEY: "id", YAPILY_APPLICATION_SECRET: "secret-value", YAPILY_BNL_INSTITUTION_ID: "bnl-id", YAPILY_INTESA_INSTITUTION_ID: "intesa-id", YAPILY_SANDBOX: "true" });
  if (provider === "tink") Object.assign(env, { TINK_CLIENT_ID: "id", TINK_CLIENT_SECRET: "secret-value", TINK_BNL_INSTITUTION_ID: "bnl-id", TINK_INTESA_INSTITUTION_ID: "intesa-id", TINK_SANDBOX: "true" });
  return env;
};

test("1. provider registry restituisce mock in test", () => { assert.equal(getOpenBankingProvider({ OPEN_BANKING_PROVIDER: "mock", NODE_ENV: "test", AUTH_URL: "http://localhost:3100" }).id, "mock"); });
test("2. provider sconosciuto è rifiutato con errore safe", () => { assert.throws(() => getOpenBankingProvider({ ...callback, OPEN_BANKING_PROVIDER: "other", TOP_SECRET: "never-show" }), (error: unknown) => error instanceof ProviderConfigurationError && !error.message.includes("never-show")); });
test("3. mock è bloccato in production", () => { const health = checkProviderConfiguration({ ...callback, OPEN_BANKING_PROVIDER: "mock", OPEN_BANKING_ALLOW_MOCK: "true" }); assert.equal(health.status, "ERROR"); assert.throws(() => getOpenBankingProvider({ ...callback, OPEN_BANKING_PROVIDER: "mock", OPEN_BANKING_ALLOW_MOCK: "true" })); });
test("4. Enable Banking missing/complete", () => { assert.equal(checkProviderConfiguration({ ...callback, OPEN_BANKING_PROVIDER: "enable-banking" }).status, "CONFIG_REQUIRED"); const health = checkProviderConfiguration(complete("enable-banking")); assert.equal(health.status, "READY"); assert.equal(getOpenBankingProvider(complete("enable-banking")).id, "enable-banking"); });
test("5. Yapily missing/complete", () => { assert.equal(checkProviderConfiguration({ ...callback, OPEN_BANKING_PROVIDER: "yapily" }).status, "CONFIG_REQUIRED"); assert.equal(checkProviderConfiguration(complete("yapily")).status, "READY"); assert.equal(getOpenBankingProvider(complete("yapily")).id, "yapily"); });
test("6. Tink missing/complete", () => { assert.equal(checkProviderConfiguration({ ...callback, OPEN_BANKING_PROVIDER: "tink" }).status, "CONFIG_REQUIRED"); assert.equal(checkProviderConfiguration(complete("tink")).status, "READY"); assert.equal(getOpenBankingProvider(complete("tink")).id, "tink"); });
test("7. callback localhost rifiutata in production", () => { assert.equal(resolveOpenBankingCallbackUrl({ NODE_ENV: "production", AUTH_URL: "http://localhost:3000" }).valid, false); });
test("8. callback HTTPS coerente accettata", () => { const row = resolveOpenBankingCallbackUrl(callback); assert.equal(row.valid, true); assert.equal(new URL(row.url).hostname, "erp.frisabistro.com"); });
test("9. BNL mancante è diagnosticata", () => { const env = complete("tink"); delete env.TINK_BNL_INSTITUTION_ID; const health = checkProviderConfiguration(env); assert.equal(health.institutionMappings.BNL, false); assert.ok(health.missingVariables.includes("TINK_BNL_INSTITUTION_ID")); });
test("10. Intesa mancante è diagnosticata", () => { const env = complete("yapily"); delete env.YAPILY_INTESA_INSTITUTION_ID; const health = checkProviderConfiguration(env); assert.equal(health.institutionMappings.INTESA, false); assert.ok(health.missingVariables.includes("YAPILY_INTESA_INSTITUTION_ID")); });
test("11. diagnostics non espone secret", () => { const env = complete("enable-banking"); const diagnostics = JSON.stringify(checkProviderConfiguration(env)); assert.equal(diagnostics.includes("secret-value"), false); assert.equal(diagnostics.includes("CLIENT_SECRET"), false); });
test("12. UI mostra CONFIG_REQUIRED senza secret", async () => { const source = await readFile(new URL("../../app/(dashboard)/treasury/open-banking/page.tsx", import.meta.url), "utf8"); assert.ok(source.includes("health.status")); assert.equal(source.includes("clientSecret"), false); });
test("13. ready state espone mapping e sandbox", () => { const health = checkProviderConfiguration(complete("tink")); assert.deepEqual({ ready: health.ready, status: health.status, sandbox: health.sandbox, mappings: health.institutionMappings }, { ready: true, status: "READY", sandbox: true, mappings: { BNL: true, INTESA: true } }); });
test("14. provider switch non altera resolver connessione esistente", () => { const env = { ...complete("enable-banking"), OPEN_BANKING_PROVIDER: "tink" }; assert.equal(getOpenBankingProviderByName("enable-banking", env).id, "enable-banking"); });
test("15. skeleton READY non avvia chiamate live", async () => { const adapter = getOpenBankingProvider(complete("enable-banking")); await assert.rejects(adapter.createConnection("bnl-id"), /non ancora abilitato/); });
