CREATE TYPE "OpenBankingConnectionStatus" AS ENUM ('CONNECTED', 'REAUTH_REQUIRED', 'EXPIRED', 'REVOKED', 'ERROR');
CREATE TYPE "OpenBankingSyncStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');
CREATE TYPE "OpenBankingTransactionStatus" AS ENUM ('PENDING', 'BOOKED', 'REVERSED', 'DELETED');

ALTER TABLE "BankStatementLine"
  ADD COLUMN "openBankingProvider" TEXT,
  ADD COLUMN "providerAccountId" TEXT,
  ADD COLUMN "providerTransactionId" TEXT,
  ADD COLUMN "providerFingerprint" TEXT,
  ADD COLUMN "openBankingStatus" "OpenBankingTransactionStatus",
  ADD COLUMN "debtorCreditorName" TEXT,
  ADD COLUMN "remittanceInformation" TEXT,
  ADD COLUMN "providerUpdatedAt" TIMESTAMP(3);

CREATE TABLE "OpenBankingConnection" (
  "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "locationId" TEXT, "provider" TEXT NOT NULL,
  "institutionId" TEXT NOT NULL, "institutionName" TEXT NOT NULL, "status" "OpenBankingConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
  "providerConnectionId" TEXT NOT NULL, "encryptedAccessToken" TEXT, "encryptedRefreshToken" TEXT,
  "consentExpiresAt" TIMESTAMP(3), "lastSyncAt" TIMESTAMP(3), "lastSuccessfulSyncAt" TIMESTAMP(3),
  "safeError" TEXT, "revokedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "OpenBankingConnection_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "OpenBankingAccount" (
  "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "connectionId" TEXT NOT NULL, "locationId" TEXT,
  "financialAccountId" TEXT, "providerAccountId" TEXT NOT NULL, "iban" TEXT, "accountName" TEXT NOT NULL,
  "currency" TEXT NOT NULL, "accountType" TEXT, "enabled" BOOLEAN NOT NULL DEFAULT true,
  "currentBalance" DECIMAL(15,2), "availableBalance" DECIMAL(15,2), "balanceUpdatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OpenBankingAccount_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "OpenBankingSync" (
  "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "connectionId" TEXT NOT NULL,
  "status" "OpenBankingSyncStatus" NOT NULL DEFAULT 'RUNNING', "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3), "fetchedCount" INTEGER NOT NULL DEFAULT 0, "createdCount" INTEGER NOT NULL DEFAULT 0,
  "duplicateCount" INTEGER NOT NULL DEFAULT 0, "updatedCount" INTEGER NOT NULL DEFAULT 0, "safeError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "OpenBankingSync_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BankStmtLine_provider_tx_key" ON "BankStatementLine"("companyId", "openBankingProvider", "providerAccountId", "providerTransactionId");
CREATE UNIQUE INDEX "BankStmtLine_provider_fp_key" ON "BankStatementLine"("companyId", "openBankingProvider", "providerAccountId", "providerFingerprint");
CREATE UNIQUE INDEX "OpenBankingConnection_provider_providerConnectionId_key" ON "OpenBankingConnection"("provider", "providerConnectionId");
CREATE UNIQUE INDEX "OpenBankingConnection_companyId_id_key" ON "OpenBankingConnection"("companyId", "id");
CREATE INDEX "OpenBankingConnection_companyId_locationId_status_idx" ON "OpenBankingConnection"("companyId", "locationId", "status");
CREATE UNIQUE INDEX "OpenBankingAccount_companyId_id_key" ON "OpenBankingAccount"("companyId", "id");
CREATE UNIQUE INDEX "OpenBankingAccount_companyId_connectionId_providerAccountId_key" ON "OpenBankingAccount"("companyId", "connectionId", "providerAccountId");
CREATE INDEX "OpenBankingAccount_companyId_locationId_enabled_idx" ON "OpenBankingAccount"("companyId", "locationId", "enabled");
CREATE INDEX "OpenBankingAccount_companyId_financialAccountId_idx" ON "OpenBankingAccount"("companyId", "financialAccountId");
CREATE INDEX "OpenBankingSync_companyId_connectionId_startedAt_idx" ON "OpenBankingSync"("companyId", "connectionId", "startedAt");

ALTER TABLE "OpenBankingConnection" ADD CONSTRAINT "OpenBankingConnection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OpenBankingConnection" ADD CONSTRAINT "OpenBankingConnection_companyId_locationId_fkey" FOREIGN KEY ("companyId", "locationId") REFERENCES "Location"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OpenBankingAccount" ADD CONSTRAINT "OpenBankingAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OpenBankingAccount" ADD CONSTRAINT "OpenBankingAccount_companyId_connectionId_fkey" FOREIGN KEY ("companyId", "connectionId") REFERENCES "OpenBankingConnection"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OpenBankingAccount" ADD CONSTRAINT "OpenBankingAccount_companyId_locationId_fkey" FOREIGN KEY ("companyId", "locationId") REFERENCES "Location"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OpenBankingAccount" ADD CONSTRAINT "OpenBankingAccount_companyId_financialAccountId_fkey" FOREIGN KEY ("companyId", "financialAccountId") REFERENCES "FinancialAccount"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OpenBankingSync" ADD CONSTRAINT "OpenBankingSync_companyId_connectionId_fkey" FOREIGN KEY ("companyId", "connectionId") REFERENCES "OpenBankingConnection"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
