CREATE TYPE "FusionCatalogSyncStatus" AS ENUM ('READY', 'SYNCING', 'STALE', 'ERROR');

CREATE TABLE "FusionCatalogMapping" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "plu" INTEGER NOT NULL,
  "synchronizedName" TEXT NOT NULL,
  "priceCents" INTEGER,
  "fingerprint" TEXT NOT NULL,
  "missingFromFusion" BOOLEAN NOT NULL DEFAULT false,
  "needsReview" BOOLEAN NOT NULL DEFAULT true,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FusionCatalogMapping_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FusionCatalogMapping_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE,
  CONSTRAINT "FusionCatalogMapping_companyId_locationId_fkey" FOREIGN KEY ("companyId", "locationId") REFERENCES "Location"("companyId", "id") ON DELETE CASCADE,
  CONSTRAINT "FusionCatalogMapping_companyId_itemId_fkey" FOREIGN KEY ("companyId", "itemId") REFERENCES "Item"("companyId", "id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "FusionCatalogMapping_companyId_locationId_plu_key" ON "FusionCatalogMapping"("companyId", "locationId", "plu");
CREATE UNIQUE INDEX "FusionCatalogMapping_companyId_locationId_itemId_key" ON "FusionCatalogMapping"("companyId", "locationId", "itemId");
CREATE INDEX "FusionCatalogMapping_companyId_locationId_missingFromFusion_idx" ON "FusionCatalogMapping"("companyId", "locationId", "missingFromFusion");

CREATE TABLE "FusionCatalogSyncState" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "connectorId" TEXT NOT NULL,
  "status" "FusionCatalogSyncStatus" NOT NULL DEFAULT 'READY',
  "manualRequestVersion" INTEGER NOT NULL DEFAULT 0,
  "consumedRequestVersion" INTEGER NOT NULL DEFAULT 0,
  "requestedAt" TIMESTAMP(3),
  "requestedById" TEXT,
  "syncStartedAt" TIMESTAMP(3),
  "lastSyncAt" TIMESTAMP(3),
  "lastError" TEXT,
  "totalCount" INTEGER NOT NULL DEFAULT 0,
  "createdCount" INTEGER NOT NULL DEFAULT 0,
  "updatedCount" INTEGER NOT NULL DEFAULT 0,
  "unchangedCount" INTEGER NOT NULL DEFAULT 0,
  "missingCount" INTEGER NOT NULL DEFAULT 0,
  "errorCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FusionCatalogSyncState_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FusionCatalogSyncState_companyId_connectorId_fkey" FOREIGN KEY ("companyId", "connectorId") REFERENCES "KitchenConnectorDevice"("companyId", "id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "FusionCatalogSyncState_connectorId_key" ON "FusionCatalogSyncState"("connectorId");
CREATE UNIQUE INDEX "FusionCatalogSyncState_companyId_locationId_connectorId_key" ON "FusionCatalogSyncState"("companyId", "locationId", "connectorId");
CREATE UNIQUE INDEX "FusionCatalogSyncState_companyId_connectorId_key" ON "FusionCatalogSyncState"("companyId", "connectorId");
CREATE INDEX "FusionCatalogSyncState_companyId_locationId_status_idx" ON "FusionCatalogSyncState"("companyId", "locationId", "status");
