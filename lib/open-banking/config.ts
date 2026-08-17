import "server-only";
import { z } from "zod";

export const providerNames = ["mock", "enable-banking", "yapily", "tink"] as const;
export type OpenBankingProviderName = typeof providerNames[number];
export type ProviderStatus = "MOCK" | "CONFIG_REQUIRED" | "READY" | "ERROR";
export type InstitutionKey = "BNL" | "INTESA";
export type InstitutionMapping = { id: string; name: string; aliases: string[] };
export type ProviderConfiguration = {
  provider: OpenBankingProviderName;
  clientId?: string;
  clientSecret?: string;
  redirectUri: string;
  baseUrl?: string;
  sandbox: boolean;
  institutions: Partial<Record<InstitutionKey, InstitutionMapping>>;
};
export type ProviderConfigurationHealth = {
  provider: string;
  status: ProviderStatus;
  ready: boolean;
  missingVariables: string[];
  callbackUrl: string;
  callbackValid: boolean;
  callbackError?: string;
  sandbox: boolean;
  credentialsConfigured: boolean;
  institutionMappings: Record<InstitutionKey, boolean>;
};

type Env = Record<string, string | undefined>;
const nonEmpty = z.string().trim().min(1);
const optionalUrl = z.string().url().optional();
const enableSchema = z.object({ clientId: nonEmpty, clientSecret: nonEmpty, baseUrl: optionalUrl });
const yapilySchema = z.object({ clientId: nonEmpty, clientSecret: nonEmpty });
const tinkSchema = z.object({ clientId: nonEmpty, clientSecret: nonEmpty });
const aliases: Record<InstitutionKey, string[]> = {
  BNL: ["BNL", "Banca Nazionale del Lavoro", "BNP Paribas Italy"],
  INTESA: ["Intesa Sanpaolo", "Intesa", "ISP"],
};
const displayNames: Record<InstitutionKey, string> = { BNL: "BNL BNP Paribas", INTESA: "Intesa Sanpaolo" };
const truthy = (value?: string) => value === "true" || value === "1";
const configured = (env: Env, key: string) => Boolean(env[key]?.trim());

export function resolveOpenBankingCallbackUrl(env: Env = process.env) {
  const candidate = env.OPEN_BANKING_CALLBACK_URL?.trim() || (env.AUTH_URL?.trim() ? `${env.AUTH_URL.trim().replace(/\/$/, "")}/api/open-banking/callback` : "");
  if (!candidate) return { url: "", valid: false, error: "OPEN_BANKING_CALLBACK_URL o AUTH_URL mancante." };
  try {
    const url = new URL(candidate);
    if (url.username || url.password) return { url: candidate, valid: false, error: "La callback non può contenere credenziali." };
    if (env.NODE_ENV === "production") {
      if (url.protocol !== "https:") return { url: candidate, valid: false, error: "La callback deve usare HTTPS in production." };
      if (["localhost", "127.0.0.1", "::1"].includes(url.hostname)) return { url: candidate, valid: false, error: "La callback non può usare localhost in production." };
      if (env.AUTH_URL) { const auth = new URL(env.AUTH_URL); if (auth.hostname !== url.hostname) return { url: candidate, valid: false, error: "Hostname callback non coerente con AUTH_URL." }; }
    }
    return { url: url.toString(), valid: true };
  } catch { return { url: candidate, valid: false, error: "URL callback non valido." }; }
}

function mapping(env: Env, prefix: string, institution: InstitutionKey): InstitutionMapping | undefined {
  const id = env[`${prefix}_${institution}_INSTITUTION_ID`]?.trim();
  return id ? { id, name: displayNames[institution], aliases: aliases[institution] } : undefined;
}

export function checkProviderConfiguration(env: Env = process.env): ProviderConfigurationHealth {
  const provider = env.OPEN_BANKING_PROVIDER?.trim() ?? "";
  const callback = resolveOpenBankingCallbackUrl(env);
  const base = { provider: provider || "not-configured", callbackUrl: callback.url, callbackValid: callback.valid, callbackError: callback.error, sandbox: true, credentialsConfigured: false, institutionMappings: { BNL: false, INTESA: false } };
  if (!providerNames.includes(provider as OpenBankingProviderName)) return { ...base, status: "ERROR", ready: false, missingVariables: [provider ? "OPEN_BANKING_PROVIDER (valore non supportato)" : "OPEN_BANKING_PROVIDER"] };
  if (provider === "mock") {
    const allowed = env.NODE_ENV === "test" || (env.NODE_ENV === "development" && truthy(env.OPEN_BANKING_ALLOW_MOCK));
    return { ...base, status: allowed ? "MOCK" : "ERROR", ready: allowed && callback.valid, missingVariables: [...(!allowed ? ["OPEN_BANKING_ALLOW_MOCK (mock vietato in questo ambiente)"] : []), ...(!callback.valid ? ["OPEN_BANKING_CALLBACK_URL"] : [])], credentialsConfigured: false, institutionMappings: { BNL: true, INTESA: true } };
  }
  const definitions = {
    "enable-banking": { prefix: "ENABLE_BANKING", client: "ENABLE_BANKING_CLIENT_ID", secret: "ENABLE_BANKING_CLIENT_SECRET", schema: enableSchema, base: "ENABLE_BANKING_BASE_URL" },
    yapily: { prefix: "YAPILY", client: "YAPILY_APPLICATION_KEY", secret: "YAPILY_APPLICATION_SECRET", schema: yapilySchema },
    tink: { prefix: "TINK", client: "TINK_CLIENT_ID", secret: "TINK_CLIENT_SECRET", schema: tinkSchema },
  } as const;
  const realProvider = provider as Exclude<OpenBankingProviderName, "mock">;
  const definition = definitions[realProvider];
  const bnl = mapping(env, definition.prefix, "BNL"); const intesa = mapping(env, definition.prefix, "INTESA");
  const input = { clientId: env[definition.client], clientSecret: env[definition.secret], ...("base" in definition ? { baseUrl: env[definition.base] || undefined } : {}) };
  const parsed = definition.schema.safeParse(input);
  const missing: string[] = [definition.client, definition.secret].filter((key) => !configured(env, key));
  if (!callback.valid) missing.push("OPEN_BANKING_CALLBACK_URL");
  if (!bnl) missing.push(`${definition.prefix}_BNL_INSTITUTION_ID`);
  if (!intesa) missing.push(`${definition.prefix}_INTESA_INSTITUTION_ID`);
  if (!parsed.success && !missing.length) missing.push("Configurazione provider non valida");
  const ready = parsed.success && callback.valid && Boolean(bnl && intesa);
  return { provider, status: ready ? "READY" : "CONFIG_REQUIRED", ready, missingVariables: [...new Set(missing)], callbackUrl: callback.url, callbackValid: callback.valid, callbackError: callback.error, sandbox: truthy(env[`${definition.prefix}_SANDBOX`]), credentialsConfigured: configured(env, definition.client) && configured(env, definition.secret), institutionMappings: { BNL: Boolean(bnl), INTESA: Boolean(intesa) } };
}

export function loadProviderConfiguration(env: Env = process.env): ProviderConfiguration | null {
  const health = checkProviderConfiguration(env);
  if (!health.ready || health.provider === "not-configured") return null;
  if (health.provider === "mock") return { provider: "mock", redirectUri: health.callbackUrl, sandbox: true, institutions: { BNL: { id: "mock-bnl-it", name: displayNames.BNL, aliases: aliases.BNL }, INTESA: { id: "mock-intesa-it", name: displayNames.INTESA, aliases: aliases.INTESA } } };
  const provider = health.provider as Exclude<OpenBankingProviderName, "mock">;
  const definitions = { "enable-banking": { prefix: "ENABLE_BANKING", client: "ENABLE_BANKING_CLIENT_ID", secret: "ENABLE_BANKING_CLIENT_SECRET", base: "ENABLE_BANKING_BASE_URL" }, yapily: { prefix: "YAPILY", client: "YAPILY_APPLICATION_KEY", secret: "YAPILY_APPLICATION_SECRET" }, tink: { prefix: "TINK", client: "TINK_CLIENT_ID", secret: "TINK_CLIENT_SECRET" } } as const;
  const definition = definitions[provider];
  return { provider, clientId: env[definition.client]!, clientSecret: env[definition.secret]!, redirectUri: health.callbackUrl, baseUrl: "base" in definition ? env[definition.base] : undefined, sandbox: health.sandbox, institutions: { BNL: mapping(env, definition.prefix, "BNL"), INTESA: mapping(env, definition.prefix, "INTESA") } };
}
