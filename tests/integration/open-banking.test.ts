import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { prisma } from "../../lib/prisma";
import { MockOpenBankingProvider } from "../../lib/open-banking/providers/mock";
import { beginConnection, completeConnectionCallback, discoverInstitutions, linkAccount, maskIban, OpenBankingError, revokeConnection, syncConnection } from "../../lib/open-banking/service";
import { stateDigest } from "../../lib/open-banking/crypto";

if (!(process.env.DATABASE_URL ?? "").includes("_test")) throw new Error("I test Open Banking richiedono un DATABASE_URL dedicato contenente _test.");
process.env.OPEN_BANKING_ENCRYPTION_KEY = randomBytes(32).toString("base64");
let companyId = "", otherCompanyId = "", locationA = "", locationB = "", userId = "", financialA = "", financialB = "", connectionId = "", openAccountId = "";
const provider = new MockOpenBankingProvider();
const suffix = randomUUID().slice(0, 8);

before(async () => {
  companyId = (await prisma.company.findUniqueOrThrow({ where: { vatNumber: "IT00000000000" } })).id;
  userId = (await prisma.user.findFirstOrThrow({ where: { memberships: { some: { companyId } } }, select: { id: true } })).id;
  const [a, b, other] = await Promise.all([
    prisma.location.create({ data: { companyId, code: `OB-A-${suffix}`, name: "Open Banking A" } }),
    prisma.location.create({ data: { companyId, code: `OB-B-${suffix}`, name: "Open Banking B" } }),
    prisma.company.create({ data: { name: `Open Banking other ${suffix}` } }),
  ]);
  locationA = a.id; locationB = b.id; otherCompanyId = other.id;
  const [fa, fb] = await Promise.all([
    prisma.financialAccount.create({ data: { companyId, locationId: a.id, code: `OB-A-${suffix}`, name: "BNL A", type: "BANK", currency: "EUR", createdById: userId, updatedById: userId } }),
    prisma.financialAccount.create({ data: { companyId, locationId: b.id, code: `OB-B-${suffix}`, name: "BNL B", type: "BANK", currency: "EUR", createdById: userId, updatedById: userId } }),
  ]);
  financialA = fa.id; financialB = fb.id;
});

after(async () => {
  await prisma.idempotencyRecord.deleteMany({ where: { companyId, commandType: "OPEN_BANKING_CALLBACK_STATE" } });
  await prisma.openBankingConnection.deleteMany({ where: { companyId } });
  await prisma.bankStatement.deleteMany({ where: { companyId, financialAccountId: { in: [financialA, financialB] } } });
  await prisma.financialAccount.deleteMany({ where: { id: { in: [financialA, financialB] } } });
  await prisma.location.deleteMany({ where: { id: { in: [locationA, locationB] } } });
  await prisma.company.delete({ where: { id: otherCompanyId } });
  await prisma.$disconnect();
});

test("1. discovery BNL riconosce nomi e alias", async () => { for (const term of ["BNL", "Banca Nazionale del Lavoro", "BNP Paribas Italy"]) assert.equal((await discoverInstitutions(term, provider))[0]?.id, "mock-bnl-it"); });
test("2. crea connessione nella Company A", async () => { const begun = await beginConnection(companyId, locationA, "mock-bnl-it", "http://localhost/callback", provider); connectionId = begun.connectionId; const url = new URL(begun.authorizationUrl); await completeConnectionCallback(companyId, url.searchParams.get("state")!, url.searchParams, provider); assert.equal((await prisma.openBankingConnection.findUniqueOrThrow({ where: { id: connectionId } })).companyId, companyId); });
test("3. accesso cross-company negato", async () => { await assert.rejects(syncConnection(otherCompanyId, connectionId, provider), OpenBankingError); });
test("4. callback state valido e monouso", async () => { const row = await beginConnection(companyId, locationA, "mock-bnl-it", "http://localhost/callback", provider); const url = new URL(row.authorizationUrl); const state = url.searchParams.get("state")!; await completeConnectionCallback(companyId, state, url.searchParams, provider); await assert.rejects(completeConnectionCallback(companyId, state, url.searchParams, provider), OpenBankingError); });
test("5. callback state invalido o scaduto", async () => { await assert.rejects(completeConnectionCallback(companyId, "invalid", new URLSearchParams(), provider), OpenBankingError); const state = "expired-state"; await prisma.idempotencyRecord.create({ data: { companyId, commandType: "OPEN_BANKING_CALLBACK_STATE", idempotencyKey: stateDigest(state), aggregateType: "OpenBankingConnection", aggregateId: connectionId, result: { expiresAt: new Date(0).toISOString() } } }); await assert.rejects(completeConnectionCallback(companyId, state, new URLSearchParams(), provider), OpenBankingError); });
test("6. importa account EUR", async () => { await syncConnection(companyId, connectionId, provider); const account = await prisma.openBankingAccount.findFirstOrThrow({ where: { companyId, connectionId } }); openAccountId = account.id; assert.equal(account.currency, "EUR"); });
test("7. collega account nella stessa Location", async () => { await linkAccount(companyId, locationA, openAccountId, financialA); assert.equal((await prisma.openBankingAccount.findUniqueOrThrow({ where: { id: openAccountId } })).financialAccountId, financialA); });
test("8. rifiuta collegamento cross-location", async () => { await assert.rejects(linkAccount(companyId, locationA, openAccountId, financialB), OpenBankingError); });
test("9. importa saldo", async () => { await syncConnection(companyId, connectionId, provider); const row = await prisma.openBankingAccount.findUniqueOrThrow({ where: { id: openAccountId } }); assert.equal(Number(row.currentBalance), 1234.56); assert.equal(Number(row.availableBalance), 1200); });
test("10. importa transazione booked", async () => { assert.equal(await prisma.bankStatementLine.count({ where: { companyId, providerTransactionId: "bnl-booked-1", openBankingStatus: "BOOKED" } }), 1); });
test("11. sync duplicata non duplica", async () => { const before = await prisma.bankStatementLine.count({ where: { companyId, openBankingProvider: "mock" } }); const result = await syncConnection(companyId, connectionId, provider); assert.equal(await prisma.bankStatementLine.count({ where: { companyId, openBankingProvider: "mock" } }), before); assert.ok(result.duplicate >= 2); });
test("12. sync incrementale passa lastSuccessfulSyncAt", async () => { assert.ok((await prisma.openBankingConnection.findUniqueOrThrow({ where: { id: connectionId } })).lastSuccessfulSyncAt); });
test("13. conserva stato pending", async () => { assert.equal((await prisma.bankStatementLine.findFirstOrThrow({ where: { companyId, providerTransactionId: "bnl-pending-1" } })).openBankingStatus, "PENDING"); });
test("14. aggiorna pending a booked senza duplicare", async () => { provider.mode = "booked"; const count = await prisma.bankStatementLine.count({ where: { companyId } }); const result = await syncConnection(companyId, connectionId, provider); assert.equal((await prisma.bankStatementLine.findFirstOrThrow({ where: { companyId, providerTransactionId: "bnl-pending-1" } })).openBankingStatus, "BOOKED"); assert.equal(await prisma.bankStatementLine.count({ where: { companyId } }), count); assert.ok(result.updated >= 1); provider.mode = "normal"; });
test("15. revoca connessione e cancella token", async () => { const row = await beginConnection(companyId, locationA, "mock-bnl-it", "http://localhost/callback", provider); await revokeConnection(companyId, row.connectionId, provider); const saved = await prisma.openBankingConnection.findUniqueOrThrow({ where: { id: row.connectionId } }); assert.equal(saved.status, "REVOKED"); assert.equal(saved.encryptedAccessToken, null); });
test("16. consenso scaduto", async () => { provider.mode = "expired"; const row = await beginConnection(companyId, locationA, "mock-bnl-it", "http://localhost/callback", provider); const url = new URL(row.authorizationUrl); await completeConnectionCallback(companyId, url.searchParams.get("state")!, url.searchParams, provider); assert.equal((await prisma.openBankingConnection.findUniqueOrThrow({ where: { id: row.connectionId } })).status, "EXPIRED"); provider.mode = "normal"; });
test("17. token cifrato non esposto", async () => { const row = await prisma.openBankingConnection.findUniqueOrThrow({ where: { id: connectionId } }); assert.ok(row.encryptedAccessToken?.startsWith("v1.")); assert.equal(row.encryptedAccessToken?.includes("mock-access-token-secret"), false); assert.equal(JSON.stringify({ id: row.id, status: row.status }).includes("token"), false); });
test("18. IBAN mascherato e mai loggato", async () => { const account = await prisma.openBankingAccount.findUniqueOrThrow({ where: { id: openAccountId } }); assert.equal(maskIban(account.iban).includes(account.iban!), false); const calls: unknown[][] = []; const original = console.log; console.log = (...args: unknown[]) => { calls.push(args); }; try { await syncConnection(companyId, connectionId, provider); } finally { console.log = original; } assert.equal(JSON.stringify(calls).includes(account.iban!), false); });
test("19. crea BankStatementLine", async () => { assert.ok(await prisma.bankStatementLine.findFirst({ where: { companyId, openBankingProvider: "mock" } })); });
test("20. non crea FinancialMovement automaticamente", async () => { assert.equal(await prisma.financialMovement.count({ where: { companyId, financialAccountId: financialA } }), 0); });
test("21. isolamento tenant nelle letture persistite", async () => { assert.equal(await prisma.openBankingConnection.count({ where: { companyId: otherCompanyId } }), 0); assert.equal(await prisma.bankStatementLine.count({ where: { companyId: otherCompanyId, openBankingProvider: "mock" } }), 0); });
test("22. errore provider sanitizzato", async () => { provider.mode = "error"; await assert.rejects(syncConnection(companyId, connectionId, provider), (error: unknown) => error instanceof OpenBankingError && !error.message.includes("secret") && !error.message.includes("IT00FULL")); const row = await prisma.openBankingConnection.findUniqueOrThrow({ where: { id: connectionId } }); assert.equal(row.safeError?.includes("secret"), false); provider.mode = "normal"; });
