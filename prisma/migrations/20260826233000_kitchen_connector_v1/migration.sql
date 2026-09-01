CREATE TYPE "KitchenPrintType" AS ENUM ('KITCHEN_TICKET', 'PREBILL', 'NON_FISCAL_RECEIPT', 'FISCAL_RECEIPT', 'TEST');
CREATE TYPE "KitchenConnectorStatus" AS ENUM ('PAIRED', 'ONLINE', 'OFFLINE', 'DEGRADED', 'REVOKED');
ALTER TYPE "KitchenPrinterType" ADD VALUE IF NOT EXISTS 'CUSTOM_KUBE';
ALTER TYPE "KitchenPrinterConnectionType" ADD VALUE IF NOT EXISTS 'RS232';

ALTER TABLE "KitchenPrintJob"
  ALTER COLUMN "ticketId" DROP NOT NULL,
  ADD COLUMN "printType" "KitchenPrintType" NOT NULL DEFAULT 'KITCHEN_TICKET',
  ADD COLUMN "connectorId" TEXT,
  ADD COLUMN "leaseTokenHash" TEXT,
  ADD COLUMN "leaseExpiresAt" TIMESTAMP(3),
  ADD COLUMN "claimedAt" TIMESTAMP(3),
  ADD COLUMN "acknowledgedAt" TIMESTAMP(3);
CREATE INDEX "KitchenPrintJob_companyId_locationId_connectorId_leaseExpiresAt_idx" ON "KitchenPrintJob"("companyId", "locationId", "connectorId", "leaseExpiresAt");

CREATE TABLE "KitchenConnectorDevice" (
  "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "locationId" TEXT NOT NULL, "printerId" TEXT NOT NULL,
  "name" TEXT NOT NULL, "status" "KitchenConnectorStatus" NOT NULL DEFAULT 'PAIRED',
  "credentialHash" TEXT NOT NULL, "credentialPrefix" TEXT NOT NULL, "credentialVersion" INTEGER NOT NULL DEFAULT 1,
  "active" BOOLEAN NOT NULL DEFAULT true, "leaseSeconds" INTEGER NOT NULL DEFAULT 60, "pairedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastHeartbeatAt" TIMESTAMP(3), "lastSeenAt" TIMESTAMP(3), "connectorVersion" TEXT, "printerOnline" BOOLEAN NOT NULL DEFAULT false, "lastSuccessfulPrintAt" TIMESTAMP(3),
  "queueDepth" INTEGER NOT NULL DEFAULT 0, "failedJobs" INTEGER NOT NULL DEFAULT 0, "lastError" TEXT,
  "diagnostics" JSONB, "serialConfig" JSONB, "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KitchenConnectorDevice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "KitchenConnectorDevice_leaseSeconds_check" CHECK ("leaseSeconds" BETWEEN 15 AND 600)
);
CREATE UNIQUE INDEX "KitchenConnectorDevice_credentialHash_key" ON "KitchenConnectorDevice"("credentialHash");
CREATE UNIQUE INDEX "KitchenConnectorDevice_companyId_id_key" ON "KitchenConnectorDevice"("companyId", "id");
CREATE UNIQUE INDEX "KitchenConnectorDevice_companyId_locationId_printerId_name_key" ON "KitchenConnectorDevice"("companyId", "locationId", "printerId", "name");
CREATE INDEX "KitchenConnectorDevice_companyId_locationId_active_lastHeartbeatAt_idx" ON "KitchenConnectorDevice"("companyId", "locationId", "active", "lastHeartbeatAt");

CREATE TABLE "KitchenConnectorPairingToken" (
  "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "locationId" TEXT NOT NULL, "printerId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "usedAt" TIMESTAMP(3), "usedByDeviceId" TEXT,
  "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KitchenConnectorPairingToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "KitchenConnectorPairingToken_tokenHash_key" ON "KitchenConnectorPairingToken"("tokenHash");
CREATE UNIQUE INDEX "KitchenConnectorPairingToken_companyId_id_key" ON "KitchenConnectorPairingToken"("companyId", "id");
CREATE INDEX "KitchenConnectorPairingToken_companyId_locationId_expiresAt_usedAt_idx" ON "KitchenConnectorPairingToken"("companyId", "locationId", "expiresAt", "usedAt");

ALTER TABLE "KitchenConnectorDevice" ADD CONSTRAINT "KitchenConnectorDevice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KitchenConnectorDevice" ADD CONSTRAINT "KitchenConnectorDevice_companyId_locationId_fkey" FOREIGN KEY ("companyId", "locationId") REFERENCES "Location"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KitchenConnectorDevice" ADD CONSTRAINT "KitchenConnectorDevice_companyId_printerId_fkey" FOREIGN KEY ("companyId", "printerId") REFERENCES "RestaurantPrinter"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KitchenConnectorPairingToken" ADD CONSTRAINT "KitchenConnectorPairingToken_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KitchenConnectorPairingToken" ADD CONSTRAINT "KitchenConnectorPairingToken_companyId_locationId_fkey" FOREIGN KEY ("companyId", "locationId") REFERENCES "Location"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KitchenConnectorPairingToken" ADD CONSTRAINT "KitchenConnectorPairingToken_companyId_printerId_fkey" FOREIGN KEY ("companyId", "printerId") REFERENCES "RestaurantPrinter"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KitchenPrintJob" ADD CONSTRAINT "KitchenPrintJob_companyId_connectorId_fkey" FOREIGN KEY ("companyId", "connectorId") REFERENCES "KitchenConnectorDevice"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
