import "server-only";
import { checkProviderConfiguration, loadProviderConfiguration, providerNames, type OpenBankingProviderName, type ProviderConfigurationHealth } from "./config";
import type { OpenBankingProvider } from "./provider";
import { EnableBankingProvider } from "./providers/enable-banking";
import { MockOpenBankingProvider } from "./providers/mock";
import { TinkProvider } from "./providers/tink";
import { YapilyProvider } from "./providers/yapily";

export class ProviderConfigurationError extends Error {
  constructor(readonly diagnostics: ProviderConfigurationHealth) { super(diagnostics.status === "CONFIG_REQUIRED" ? "Configurazione provider Open Banking incompleta." : "Provider Open Banking non disponibile."); }
}
function create(name: OpenBankingProviderName, env: NodeJS.ProcessEnv): OpenBankingProvider {
  const scoped = { ...env, OPEN_BANKING_PROVIDER: name };
  const health = checkProviderConfiguration(scoped); const config = loadProviderConfiguration(scoped);
  if (!health.ready || !config) throw new ProviderConfigurationError(health);
  if (name === "mock") return new MockOpenBankingProvider();
  if (name === "enable-banking") return new EnableBankingProvider(config);
  if (name === "yapily") return new YapilyProvider(config);
  return new TinkProvider(config);
}
export function getOpenBankingProvider(env: NodeJS.ProcessEnv = process.env) {
  const name = env.OPEN_BANKING_PROVIDER?.trim();
  if (!providerNames.includes(name as OpenBankingProviderName)) throw new ProviderConfigurationError(checkProviderConfiguration(env));
  return create(name as OpenBankingProviderName, env);
}
export function getOpenBankingProviderByName(name: string, env: NodeJS.ProcessEnv = process.env) {
  if (!providerNames.includes(name as OpenBankingProviderName)) throw new ProviderConfigurationError(checkProviderConfiguration({ ...env, OPEN_BANKING_PROVIDER: name }));
  return create(name as OpenBankingProviderName, env);
}
