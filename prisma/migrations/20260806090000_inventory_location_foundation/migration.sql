-- CORE_LOCATIONS ENGINE SCOPING foundation
-- FASE 1 — EXPAND: every new column starts nullable so existing rows remain valid.
ALTER TABLE "InventoryLot" ADD COLUMN "locationId" TEXT;
ALTER TABLE "InventorySerial" ADD COLUMN "locationId" TEXT;
ALTER TABLE "InventoryMovement" ADD COLUMN "locationId" TEXT;
ALTER TABLE "InventoryTransfer" ADD COLUMN "sourceLocationId" TEXT;
ALTER TABLE "InventoryTransfer" ADD COLUMN "destinationLocationId" TEXT;
ALTER TABLE "InventoryCount" ADD COLUMN "locationId" TEXT;
ALTER TABLE "StockBalance" ADD COLUMN "locationId" TEXT;

CREATE INDEX "InventoryLot_companyId_locationId_expirationDate_active_idx" ON "InventoryLot"("companyId", "locationId", "expirationDate", "active");
CREATE INDEX "InventorySerial_companyId_locationId_itemId_status_idx" ON "InventorySerial"("companyId", "locationId", "itemId", "status");
CREATE INDEX "InventoryMovement_companyId_locationId_warehouseId_itemId_postedAt_idx" ON "InventoryMovement"("companyId", "locationId", "warehouseId", "itemId", "postedAt");
CREATE INDEX "InventoryTransfer_companyId_sourceLocationId_status_requestedAt_idx" ON "InventoryTransfer"("companyId", "sourceLocationId", "status", "requestedAt");
CREATE INDEX "InventoryTransfer_companyId_destinationLocationId_status_requestedAt_idx" ON "InventoryTransfer"("companyId", "destinationLocationId", "status", "requestedAt");
CREATE INDEX "InventoryCount_companyId_locationId_status_createdAt_idx" ON "InventoryCount"("companyId", "locationId", "status", "createdAt");
CREATE INDEX "StockBalance_companyId_locationId_itemId_idx" ON "StockBalance"("companyId", "locationId", "itemId");

-- FASE 2 — BACKFILL: prefer the concrete Warehouse location; fall back to the
-- active headquarters (the deterministic Company default established by CORE_LOCATIONS).
UPDATE "InventoryMovement" m SET "locationId" = w."locationId" FROM "Warehouse" w WHERE w."id" = m."warehouseId" AND w."companyId" = m."companyId";
UPDATE "InventoryCount" c SET "locationId" = w."locationId" FROM "Warehouse" w WHERE w."id" = c."warehouseId" AND w."companyId" = c."companyId";
UPDATE "StockBalance" b SET "locationId" = w."locationId" FROM "Warehouse" w WHERE w."id" = b."warehouseId" AND w."companyId" = b."companyId";
UPDATE "InventoryTransfer" t SET "sourceLocationId" = sw."locationId", "destinationLocationId" = dw."locationId" FROM "Warehouse" sw, "Warehouse" dw WHERE sw."id" = t."sourceWarehouseId" AND dw."id" = t."destinationWarehouseId" AND sw."companyId" = t."companyId" AND dw."companyId" = t."companyId";

WITH headquarters AS (SELECT "companyId", "id" FROM "Location" WHERE "active" AND "deletedAt" IS NULL AND "isHeadquarters")
UPDATE "InventoryLot" x SET "locationId" = h."id" FROM headquarters h WHERE x."companyId" = h."companyId";
WITH headquarters AS (SELECT "companyId", "id" FROM "Location" WHERE "active" AND "deletedAt" IS NULL AND "isHeadquarters")
UPDATE "InventorySerial" x SET "locationId" = h."id" FROM headquarters h WHERE x."companyId" = h."companyId";

-- Validation queries: each must return zero before enforcement.
-- SELECT count(*) FROM "InventoryLot" WHERE "locationId" IS NULL;
-- SELECT count(*) FROM "InventorySerial" WHERE "locationId" IS NULL;
-- SELECT count(*) FROM "InventoryMovement" WHERE "locationId" IS NULL;
-- SELECT count(*) FROM "InventoryTransfer" WHERE "sourceLocationId" IS NULL OR "destinationLocationId" IS NULL;
-- SELECT count(*) FROM "InventoryCount" WHERE "locationId" IS NULL;
-- SELECT count(*) FROM "StockBalance" WHERE "locationId" IS NULL;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "InventoryLot" WHERE "locationId" IS NULL) OR EXISTS (SELECT 1 FROM "InventorySerial" WHERE "locationId" IS NULL) OR EXISTS (SELECT 1 FROM "InventoryMovement" WHERE "locationId" IS NULL) OR EXISTS (SELECT 1 FROM "InventoryTransfer" WHERE "sourceLocationId" IS NULL OR "destinationLocationId" IS NULL) OR EXISTS (SELECT 1 FROM "InventoryCount" WHERE "locationId" IS NULL) OR EXISTS (SELECT 1 FROM "StockBalance" WHERE "locationId" IS NULL) THEN RAISE EXCEPTION 'Inventory Location backfill incomplete'; END IF;
END $$;

-- FASE 3 — ENFORCE.
ALTER TABLE "InventoryLot" ALTER COLUMN "locationId" SET NOT NULL;
ALTER TABLE "InventorySerial" ALTER COLUMN "locationId" SET NOT NULL;
ALTER TABLE "InventoryMovement" ALTER COLUMN "locationId" SET NOT NULL;
ALTER TABLE "InventoryTransfer" ALTER COLUMN "sourceLocationId" SET NOT NULL;
ALTER TABLE "InventoryTransfer" ALTER COLUMN "destinationLocationId" SET NOT NULL;
ALTER TABLE "InventoryCount" ALTER COLUMN "locationId" SET NOT NULL;
ALTER TABLE "StockBalance" ALTER COLUMN "locationId" SET NOT NULL;

ALTER TABLE "InventoryLot" ADD CONSTRAINT "InventoryLot_companyId_locationId_fkey" FOREIGN KEY ("companyId", "locationId") REFERENCES "Location"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventorySerial" ADD CONSTRAINT "InventorySerial_companyId_locationId_fkey" FOREIGN KEY ("companyId", "locationId") REFERENCES "Location"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_companyId_locationId_fkey" FOREIGN KEY ("companyId", "locationId") REFERENCES "Location"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryTransfer" ADD CONSTRAINT "InventoryTransfer_companyId_sourceLocationId_fkey" FOREIGN KEY ("companyId", "sourceLocationId") REFERENCES "Location"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryTransfer" ADD CONSTRAINT "InventoryTransfer_companyId_destinationLocationId_fkey" FOREIGN KEY ("companyId", "destinationLocationId") REFERENCES "Location"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_companyId_locationId_fkey" FOREIGN KEY ("companyId", "locationId") REFERENCES "Location"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_companyId_locationId_fkey" FOREIGN KEY ("companyId", "locationId") REFERENCES "Location"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
