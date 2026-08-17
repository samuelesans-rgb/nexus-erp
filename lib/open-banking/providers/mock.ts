import type { AuthorizationResult, Institution, NormalizedTransaction, OpenBankingProvider, ProviderAccount, ProviderBalance, ProviderConnection, ProviderSession } from "../provider";

export class MockOpenBankingProvider implements OpenBankingProvider {
  readonly id = "mock";
  mode: "normal" | "booked" | "expired" | "error" = "normal";
  private revoked = new Set<string>();
  async listInstitutions(query = ""): Promise<Institution[]> {
    const rows = [
      { id: "mock-bnl-it", name: "BNL BNP Paribas", country: "IT", aliases: ["BNL", "Banca Nazionale del Lavoro", "BNP Paribas Italy"] },
      { id: "mock-intesa-it", name: "Intesa Sanpaolo", country: "IT", aliases: ["Intesa Sanpaolo", "Intesa", "ISP"] },
    ];
    const term = query.toLowerCase();
    return rows.filter((row) => !term || [row.name, ...row.aliases].join(" ").toLowerCase().includes(term));
  }
  async createConnection(institutionId: string): Promise<ProviderConnection> {
    if (this.mode === "error") throw new Error("provider secret diagnostic");
    if (institutionId !== "mock-bnl-it") throw new Error("Institution unavailable");
    return { providerConnectionId: `mock-${crypto.randomUUID()}`, accessToken: "mock-access-token-secret", refreshToken: "mock-refresh-token-secret", consentExpiresAt: new Date(Date.now() + 90 * 86400000) };
  }
  async getAuthorizationUrl(connection: ProviderConnection, state: string, redirectUri: string) { return `${redirectUri}?code=mock-code&state=${encodeURIComponent(state)}&connection=${connection.providerConnectionId}`; }
  async handleCallback(connection: ProviderConnection): Promise<AuthorizationResult> {
    if (this.mode === "expired") return { ...connection, status: "EXPIRED", consentExpiresAt: new Date(Date.now() - 1000) };
    return { ...connection, status: "CONNECTED" };
  }
  private guard(session: ProviderSession) { if (this.mode === "error") throw new Error("provider token=secret iban=IT00FULL"); if (this.revoked.has(session.providerConnectionId)) throw new Error("revoked"); }
  async getAccounts(session: ProviderSession): Promise<ProviderAccount[]> { this.guard(session); return [{ id: "mock-bnl-account-eur", iban: "IT60X0542811101000000123456", name: "BNL Conto EUR", currency: "EUR", type: "CURRENT" }]; }
  async getBalances(session: ProviderSession): Promise<ProviderBalance[]> { this.guard(session); return [{ accountId: "mock-bnl-account-eur", current: 1234.56, available: 1200, currency: "EUR", updatedAt: new Date() }]; }
  async getTransactions(session: ProviderSession): Promise<NormalizedTransaction[]> {
    this.guard(session);
    const day = new Date("2026-08-15T12:00:00.000Z");
    return [
      { providerTransactionId: "bnl-booked-1", bookingDate: day, valueDate: day, amount: 100, currency: "EUR", description: "Bonifico cliente", debtorCreditorName: "Cliente Demo", remittanceInformation: "Fattura 1", status: "BOOKED" },
      { providerTransactionId: "bnl-pending-1", bookingDate: day, amount: -25, currency: "EUR", description: "Pagamento carta", status: this.mode === "booked" ? "BOOKED" : "PENDING", updatedAt: new Date() },
      { providerTransactionId: "bnl-booked-1", bookingDate: day, valueDate: day, amount: 100, currency: "EUR", description: "Bonifico cliente", status: "BOOKED" },
    ];
  }
  async refreshConnection(session: ProviderSession) { this.guard(session); return { providerConnectionId: session.providerConnectionId, accessToken: "mock-access-refreshed", refreshToken: "mock-refresh-refreshed", consentExpiresAt: new Date(Date.now() + 90 * 86400000) }; }
  async revokeConnection(session: ProviderSession) { this.revoked.add(session.providerConnectionId); }
}
