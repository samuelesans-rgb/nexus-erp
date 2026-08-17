import type { ProviderConfiguration } from "../config";
import type { AuthorizationResult, Institution, NormalizedTransaction, OpenBankingProvider, ProviderAccount, ProviderBalance, ProviderConnection } from "../provider";

export class ProviderAdapterUnavailableError extends Error { constructor() { super("Adapter provider configurato ma non ancora abilitato per chiamate remote."); } }
export abstract class ConfiguredProviderSkeleton implements OpenBankingProvider {
  abstract readonly id: string;
  constructor(protected readonly config: ProviderConfiguration) {}
  async listInstitutions(query = ""): Promise<Institution[]> { const term = query.toLowerCase(); return Object.values(this.config.institutions).filter((row): row is NonNullable<typeof row> => Boolean(row)).filter((row) => !term || [row.name, ...row.aliases].join(" ").toLowerCase().includes(term)).map((row) => ({ id: row.id, name: row.name, aliases: row.aliases, country: "IT" })); }
  protected unavailable(): never { throw new ProviderAdapterUnavailableError(); }
  async createConnection(): Promise<ProviderConnection> { return this.unavailable(); }
  async getAuthorizationUrl(): Promise<string> { return this.unavailable(); }
  async handleCallback(): Promise<AuthorizationResult> { return this.unavailable(); }
  async getAccounts(): Promise<ProviderAccount[]> { return this.unavailable(); }
  async getBalances(): Promise<ProviderBalance[]> { return this.unavailable(); }
  async getTransactions(): Promise<NormalizedTransaction[]> { return this.unavailable(); }
  async refreshConnection(): Promise<ProviderConnection> { return this.unavailable(); }
  async revokeConnection(): Promise<void> { return this.unavailable(); }
}
