-- Rollback di 20260921120000_drop_restaurant_table_legacy_status.
--
-- NON è sufficiente tornare all'immagine precedente: il codice vecchio legge
-- "status" e fallirebbe. Immagine e schema vanno riportati indietro insieme,
-- e questo script va eseguito PRIMA di riavviare l'immagine vecchia.
--
-- I valori non si perdono: si ricalcolano dalla stessa derivazione che la
-- colonna avrebbe dovuto rispecchiare.

ALTER TABLE "RestaurantTable"
  ADD COLUMN IF NOT EXISTS "status" "RestaurantTableStatus" NOT NULL DEFAULT 'AVAILABLE';

UPDATE "RestaurantTable" t SET "status" = CASE
  WHEN t."physicalStatus" = 'OUT_OF_SERVICE' THEN 'OUT_OF_SERVICE'::"RestaurantTableStatus"
  WHEN EXISTS (
    SELECT 1 FROM "RestaurantOrderTable" ot
      JOIN "RestaurantOrder" o ON o."id" = ot."orderId"
     WHERE ot."tableId" = t."id" AND o."status" NOT IN ('CLOSED','CANCELLED')
  ) THEN 'OCCUPIED'::"RestaurantTableStatus"
  WHEN t."physicalStatus" = 'DIRTY' THEN 'DIRTY'::"RestaurantTableStatus"
  WHEN EXISTS (
    SELECT 1 FROM "RestaurantReservationTable" rt
      JOIN "RestaurantReservation" r ON r."id" = rt."reservationId"
     WHERE rt."tableId" = t."id" AND r."deletedAt" IS NULL
       AND r."status" IN ('PENDING','CONFIRMED','SEATED')
       AND r."startTime" < now() + interval '45 minutes'
       AND COALESCE(r."endTime", r."startTime") > now()
  ) THEN 'RESERVED'::"RestaurantTableStatus"
  ELSE 'AVAILABLE'::"RestaurantTableStatus"
END;

CREATE INDEX IF NOT EXISTS "RestaurantTable_companyId_locationId_status_deletedAt_idx"
  ON "RestaurantTable" ("companyId", "locationId", "status", "deletedAt");
