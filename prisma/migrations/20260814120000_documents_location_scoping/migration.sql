-- Expand: DocumentSeries becomes optionally location-scoped while historical
-- series with no reliable mapping remain explicitly global for compatibility.
ALTER TABLE "DocumentSeries" ADD COLUMN "locationId" TEXT;

-- Backfill document locations only from existing, tenant-safe relationships.
UPDATE "BusinessDocument" document
SET "locationId" = warehouse."locationId"
FROM "Warehouse" warehouse
WHERE document."locationId" IS NULL
  AND document."companyId" = warehouse."companyId"
  AND document."warehouseId" = warehouse."id";

UPDATE "BusinessDocument" document
SET "locationId" = restaurant_order."locationId"
FROM "RestaurantOrder" restaurant_order
WHERE document."locationId" IS NULL
  AND document."companyId" = restaurant_order."companyId"
  AND document."id" = restaurant_order."documentId";

-- A series can be assigned automatically only when every existing document
-- using it has the same known location. Ambiguous and unused series stay NULL.
WITH unambiguous_series AS (
  SELECT "companyId", "seriesId", min("locationId") AS "locationId"
  FROM "BusinessDocument"
  GROUP BY "companyId", "seriesId"
  HAVING count(*) FILTER (WHERE "locationId" IS NULL) = 0
     AND count(DISTINCT "locationId") = 1
)
UPDATE "DocumentSeries" series
SET "locationId" = mapped."locationId"
FROM unambiguous_series mapped
WHERE series."companyId" = mapped."companyId"
  AND series."id" = mapped."seriesId";

CREATE INDEX "DocumentSeries_companyId_locationId_documentType_active_idx"
  ON "DocumentSeries"("companyId", "locationId", "documentType", "active");
CREATE INDEX "BusinessDocument_companyId_locationId_status_documentDate_idx"
  ON "BusinessDocument"("companyId", "locationId", "status", "documentDate");

ALTER TABLE "DocumentSeries"
  ADD CONSTRAINT "DocumentSeries_companyId_locationId_fkey"
  FOREIGN KEY ("companyId", "locationId") REFERENCES "Location"("companyId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Enforce for all new/updated operational rows without fabricating a value for
-- unresolved historical rows. The constraint can be VALIDATEd after remediation.
ALTER TABLE "BusinessDocument"
  ADD CONSTRAINT "BusinessDocument_locationId_required" CHECK ("locationId" IS NOT NULL) NOT VALID;
