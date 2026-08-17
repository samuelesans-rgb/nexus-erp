export type Institution = { id: string; name: string; country: string; aliases?: string[] };
export type ProviderConnection = { providerConnectionId: string; accessToken?: string; refreshToken?: string; consentExpiresAt?: Date };
export type AuthorizationResult = ProviderConnection & { status: "CONNECTED" | "REAUTH_REQUIRED" | "EXPIRED" };
export type ProviderAccount = { id: string; iban?: string; name: string; currency: string; type?: string };
export type ProviderBalance = { accountId: string; current: number; available?: number; currency: string; updatedAt: Date };
export type NormalizedTransaction = {
  providerTransactionId?: string;
  bookingDate: Date;
  valueDate?: Date;
  amount: number;
  currency: string;
  description: string;
  debtorCreditorName?: string;
  remittanceInformation?: string;
  status: "PENDING" | "BOOKED" | "REVERSED" | "DELETED";
  updatedAt?: Date;
};
export type ProviderSession = { providerConnectionId: string; accessToken?: string; refreshToken?: string };

export interface OpenBankingProvider {
  readonly id: string;
  listInstitutions(query?: string): Promise<Institution[]>;
  createConnection(institutionId: string): Promise<ProviderConnection>;
  getAuthorizationUrl(connection: ProviderConnection, state: string, redirectUri: string): Promise<string>;
  handleCallback(connection: ProviderConnection, params: URLSearchParams): Promise<AuthorizationResult>;
  getAccounts(session: ProviderSession): Promise<ProviderAccount[]>;
  getBalances(session: ProviderSession, accountIds: string[]): Promise<ProviderBalance[]>;
  getTransactions(session: ProviderSession, accountId: string, since?: Date): Promise<NormalizedTransaction[]>;
  refreshConnection(session: ProviderSession): Promise<ProviderConnection>;
  revokeConnection(session: ProviderSession): Promise<void>;
}
