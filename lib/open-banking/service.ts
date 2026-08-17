import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret, stateDigest } from "./crypto";
import { MockOpenBankingProvider } from "./providers/mock";
import type { NormalizedTransaction, OpenBankingProvider, ProviderSession } from "./provider";

export class OpenBankingError extends Error {}
const SAFE_PROVIDER_ERROR = "Il provider bancario non è temporaneamente disponibile. Riprova più tardi.";
const configuredProvider = () => {
  if (process.env.OPEN_BANKING_PROVIDER === "mock" || process.env.NODE_ENV === "test") return new MockOpenBankingProvider();
  throw new OpenBankingError("Nessun provider Open Banking configurato.");
};
const providerFor = (name: string, provider?: OpenBankingProvider) => {
  const selected = provider ?? configuredProvider();
  if (selected.id !== name) throw new OpenBankingError("Provider Open Banking non configurato.");
  return selected;
};
const safe = () => SAFE_PROVIDER_ERROR;
const sessionOf = (row: { providerConnectionId: string; encryptedAccessToken: string | null; encryptedRefreshToken: string | null }): ProviderSession => ({ providerConnectionId: row.providerConnectionId, accessToken: decryptSecret(row.encryptedAccessToken), refreshToken: decryptSecret(row.encryptedRefreshToken) });
const fingerprint = (accountId: string, tx: NormalizedTransaction) => createHash("sha256").update([accountId, tx.bookingDate.toISOString(), tx.valueDate?.toISOString() ?? "", tx.amount.toFixed(2), tx.currency, tx.description, tx.debtorCreditorName ?? "", tx.remittanceInformation ?? ""].join("|")).digest("hex");
const startOfUtcDay = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

export async function discoverInstitutions(query = "BNL", provider?: OpenBankingProvider) { return (provider ?? configuredProvider()).listInstitutions(query); }

export async function beginConnection(companyId: string, locationId: string, institutionId: string, redirectUri: string, provider?: OpenBankingProvider) {
  const selected = provider ?? configuredProvider();
  const [location, institutions] = await Promise.all([prisma.location.findFirst({ where: { id: locationId, companyId, active: true, deletedAt: null }, select: { id: true } }), selected.listInstitutions()]);
  if (!location) throw new OpenBankingError("Location non valida per la Company attiva.");
  const institution = institutions.find((row) => row.id === institutionId);
  if (!institution) throw new OpenBankingError("Banca non disponibile presso il provider configurato.");
  try {
    const remote = await selected.createConnection(institution.id);
    const connection = await prisma.openBankingConnection.create({ data: { companyId, locationId, provider: selected.id, institutionId: institution.id, institutionName: institution.name, providerConnectionId: remote.providerConnectionId, encryptedAccessToken: encryptSecret(remote.accessToken), encryptedRefreshToken: encryptSecret(remote.refreshToken), consentExpiresAt: remote.consentExpiresAt }, select: { id: true } });
    const state = randomBytes(32).toString("base64url");
    await prisma.idempotencyRecord.create({ data: { companyId, commandType: "OPEN_BANKING_CALLBACK_STATE", idempotencyKey: stateDigest(state), aggregateType: "OpenBankingConnection", aggregateId: connection.id, result: { expiresAt: new Date(Date.now() + 10 * 60000).toISOString() } } });
    return { connectionId: connection.id, authorizationUrl: await selected.getAuthorizationUrl(remote, state, redirectUri) };
  } catch (error) { if (error instanceof OpenBankingError) throw error; throw new OpenBankingError(safe()); }
}

export async function completeConnectionCallback(companyId: string, state: string, params: URLSearchParams, provider?: OpenBankingProvider) {
  const digest = stateDigest(state);
  const result = await prisma.$transaction(async (tx) => {
    const record = await tx.idempotencyRecord.findUnique({ where: { companyId_commandType_idempotencyKey: { companyId, commandType: "OPEN_BANKING_CALLBACK_STATE", idempotencyKey: digest } } });
    const payload = record?.result as { expiresAt?: string } | null;
    if (!record || record.status !== "PROCESSING" || !payload?.expiresAt || new Date(payload.expiresAt) <= new Date() || !record.aggregateId) throw new OpenBankingError("Stato callback non valido o scaduto.");
    await tx.idempotencyRecord.update({ where: { id: record.id }, data: { status: "SUCCEEDED", completedAt: new Date() } });
    return tx.openBankingConnection.findFirstOrThrow({ where: { id: record.aggregateId, companyId } });
  });
  const selected = providerFor(result.provider, provider);
  try {
    const remote = await selected.handleCallback({ ...sessionOf(result), consentExpiresAt: result.consentExpiresAt ?? undefined }, params);
    return prisma.openBankingConnection.update({ where: { id: result.id }, data: { status: remote.status, encryptedAccessToken: encryptSecret(remote.accessToken), encryptedRefreshToken: encryptSecret(remote.refreshToken), consentExpiresAt: remote.consentExpiresAt, safeError: null }, select: { id: true, status: true } });
  } catch (error) { await prisma.openBankingConnection.update({ where: { id: result.id }, data: { status: "ERROR", safeError: safe() } }); if (error instanceof OpenBankingError) throw error; throw new OpenBankingError(safe()); }
}

export async function linkAccount(companyId: string, locationId: string, openBankingAccountId: string, financialAccountId: string) {
  return prisma.$transaction(async (tx) => {
    const [source, target] = await Promise.all([
      tx.openBankingAccount.findFirst({ where: { id: openBankingAccountId, companyId, connection: { companyId, locationId } }, include: { connection: { select: { locationId: true } } } }),
      tx.financialAccount.findFirst({ where: { id: financialAccountId, companyId, active: true, deletedAt: null } }),
    ]);
    if (!source || !target) throw new OpenBankingError("Conto non valido per la Company attiva.");
    if (source.connection.locationId !== locationId || target.locationId !== locationId) throw new OpenBankingError("Il collegamento cross-location non è consentito.");
    if (source.currency !== target.currency) throw new OpenBankingError("La valuta dei conti non coincide.");
    return tx.openBankingAccount.update({ where: { id: source.id }, data: { financialAccountId: target.id, locationId }, select: { id: true } });
  });
}

async function importTransaction(companyId: string, connection: { provider: string; locationId: string | null }, account: { providerAccountId: string; financialAccountId: string | null }, tx: NormalizedTransaction) {
  if (!connection.locationId || !account.financialAccountId) return "skipped" as const;
  const id = tx.providerTransactionId ?? null; const hash = id ? null : fingerprint(account.providerAccountId, tx);
  const existing = await prisma.bankStatementLine.findFirst({ where: { companyId, openBankingProvider: connection.provider, providerAccountId: account.providerAccountId, ...(id ? { providerTransactionId: id } : { providerFingerprint: hash }) } });
  if (existing) {
    const changed = existing.openBankingStatus !== tx.status || Number(existing.amount) !== tx.amount || existing.description !== tx.description;
    if (changed) await prisma.bankStatementLine.update({ where: { id: existing.id }, data: { transactionDate: tx.bookingDate, valueDate: tx.valueDate, amount: tx.amount, description: tx.description, reference: tx.remittanceInformation, openBankingStatus: tx.status, debtorCreditorName: tx.debtorCreditorName, remittanceInformation: tx.remittanceInformation, providerUpdatedAt: tx.updatedAt } });
    return changed ? "updated" as const : "duplicate" as const;
  }
  const statementDate = startOfUtcDay(tx.bookingDate);
  const statement = await prisma.bankStatement.upsert({ where: { companyId_financialAccountId_statementDate: { companyId, financialAccountId: account.financialAccountId, statementDate } }, create: { companyId, locationId: connection.locationId, financialAccountId: account.financialAccountId, statementDate, openingBalance: 0, closingBalance: tx.amount }, update: { closingBalance: { increment: tx.amount } }, select: { id: true } });
  await prisma.bankStatementLine.create({ data: { companyId, locationId: connection.locationId, bankStatementId: statement.id, transactionDate: tx.bookingDate, valueDate: tx.valueDate, amount: tx.amount, description: tx.description, reference: tx.remittanceInformation, openBankingProvider: connection.provider, providerAccountId: account.providerAccountId, providerTransactionId: id, providerFingerprint: hash, openBankingStatus: tx.status, debtorCreditorName: tx.debtorCreditorName, remittanceInformation: tx.remittanceInformation, providerUpdatedAt: tx.updatedAt } });
  return "created" as const;
}

export async function syncConnection(companyId: string, connectionId: string, provider?: OpenBankingProvider) {
  const connection = await prisma.openBankingConnection.findFirst({ where: { id: connectionId, companyId }, include: { accounts: true } });
  if (!connection) throw new OpenBankingError("Connessione non trovata nella Company attiva.");
  if (connection.status === "REVOKED" || connection.status === "EXPIRED") throw new OpenBankingError("Il consenso bancario non è attivo.");
  const audit = await prisma.openBankingSync.create({ data: { companyId, connectionId }, select: { id: true } });
  const selected = providerFor(connection.provider, provider); const session = sessionOf(connection);
  let fetched = 0, created = 0, duplicate = 0, updated = 0;
  try {
    const remoteAccounts = await selected.getAccounts(session);
    for (const account of remoteAccounts) await prisma.openBankingAccount.upsert({ where: { companyId_connectionId_providerAccountId: { companyId, connectionId, providerAccountId: account.id } }, create: { companyId, connectionId, locationId: connection.locationId, providerAccountId: account.id, iban: account.iban, accountName: account.name, currency: account.currency, accountType: account.type }, update: { iban: account.iban, accountName: account.name, currency: account.currency, accountType: account.type } });
    const rows = await prisma.openBankingAccount.findMany({ where: { companyId, connectionId, enabled: true } });
    const balances = await selected.getBalances(session, rows.map((row) => row.providerAccountId));
    for (const balance of balances) await prisma.openBankingAccount.updateMany({ where: { companyId, connectionId, providerAccountId: balance.accountId, currency: balance.currency }, data: { currentBalance: balance.current, availableBalance: balance.available, balanceUpdatedAt: balance.updatedAt } });
    for (const account of rows) for (const tx of await selected.getTransactions(session, account.providerAccountId, connection.lastSuccessfulSyncAt ?? undefined)) { fetched++; const outcome = await importTransaction(companyId, connection, account, tx); if (outcome === "created") created++; else if (outcome === "updated") updated++; else if (outcome === "duplicate") duplicate++; }
    const now = new Date(); await prisma.$transaction([prisma.openBankingSync.update({ where: { id: audit.id }, data: { status: "COMPLETED", completedAt: now, fetchedCount: fetched, createdCount: created, duplicateCount: duplicate, updatedCount: updated } }), prisma.openBankingConnection.update({ where: { id: connection.id }, data: { lastSyncAt: now, lastSuccessfulSyncAt: now, safeError: null } })]);
    return { fetched, created, duplicate, updated };
  } catch { const now = new Date(); await prisma.$transaction([prisma.openBankingSync.update({ where: { id: audit.id }, data: { status: "FAILED", completedAt: now, fetchedCount: fetched, createdCount: created, duplicateCount: duplicate, updatedCount: updated, safeError: safe() } }), prisma.openBankingConnection.update({ where: { id: connection.id }, data: { status: "ERROR", lastSyncAt: now, safeError: safe() } })]); throw new OpenBankingError(safe()); }
}

export async function refreshConnection(companyId: string, connectionId: string, provider?: OpenBankingProvider) { const row = await prisma.openBankingConnection.findFirst({ where: { id: connectionId, companyId } }); if (!row) throw new OpenBankingError("Connessione non trovata."); try { const remote = await providerFor(row.provider, provider).refreshConnection(sessionOf(row)); return prisma.openBankingConnection.update({ where: { id: row.id }, data: { status: "CONNECTED", encryptedAccessToken: encryptSecret(remote.accessToken), encryptedRefreshToken: encryptSecret(remote.refreshToken), consentExpiresAt: remote.consentExpiresAt, safeError: null }, select: { id: true } }); } catch { throw new OpenBankingError(safe()); } }
export async function revokeConnection(companyId: string, connectionId: string, provider?: OpenBankingProvider) { const row = await prisma.openBankingConnection.findFirst({ where: { id: connectionId, companyId } }); if (!row) throw new OpenBankingError("Connessione non trovata."); try { await providerFor(row.provider, provider).revokeConnection(sessionOf(row)); } catch { throw new OpenBankingError(safe()); } return prisma.openBankingConnection.update({ where: { id: row.id }, data: { status: "REVOKED", revokedAt: new Date(), encryptedAccessToken: null, encryptedRefreshToken: null }, select: { id: true } }); }
export async function getOpenBankingDashboard(companyId: string, locationId: string) { const [connections, accounts] = await Promise.all([prisma.openBankingConnection.findMany({ where: { companyId, locationId }, include: { accounts: { orderBy: { accountName: "asc" } }, syncs: { orderBy: { startedAt: "desc" }, take: 1 } }, orderBy: { createdAt: "desc" } }), prisma.financialAccount.findMany({ where: { companyId, locationId, type: "BANK", active: true, deletedAt: null }, select: { id: true, code: true, name: true, currency: true } })]); return { connections, financialAccounts: accounts }; }
export const maskIban = (iban?: string | null) => !iban ? "—" : `${iban.slice(0, 4)}••••${iban.slice(-4)}`;
