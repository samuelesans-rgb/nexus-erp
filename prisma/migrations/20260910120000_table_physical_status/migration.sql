-- Phase 1 of deriving RestaurantTable.status from orders and reservations.
-- Additive only: "status" is left untouched and still authoritative.
-- "physicalStatus" carries the two states that cannot be derived.

CREATE TYPE "RestaurantTablePhysicalStatus" AS ENUM ('READY', 'DIRTY', 'OUT_OF_SERVICE');

ALTER TABLE "RestaurantTable"
  ADD COLUMN "physicalStatus" "RestaurantTablePhysicalStatus" NOT NULL DEFAULT 'READY';

-- OCCUPIED and RESERVED are intentionally mapped to READY: both are recomputed
-- from RestaurantOrderTable and RestaurantReservationTable. A table whose order
-- is genuinely open derives OCCUPIED again on the next read.
UPDATE "RestaurantTable"
   SET "physicalStatus" = CASE "status"
     WHEN 'OUT_OF_SERVICE' THEN 'OUT_OF_SERVICE'::"RestaurantTablePhysicalStatus"
     WHEN 'DIRTY'          THEN 'DIRTY'::"RestaurantTablePhysicalStatus"
     ELSE 'READY'::"RestaurantTablePhysicalStatus"
   END;

CREATE INDEX "RestaurantTable_companyId_locationId_physicalStatus_deleted_idx"
  ON "RestaurantTable" ("companyId", "locationId", "physicalStatus", "deletedAt");
