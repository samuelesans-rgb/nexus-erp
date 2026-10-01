ALTER TABLE "BusinessDocumentLine"
  ADD COLUMN "stockUnitOfMeasureId" TEXT,
  ADD COLUMN "purchaseConversionFactor" DECIMAL(15,6),
  ADD COLUMN "warehouseBinId" TEXT,
  ADD CONSTRAINT "BusinessDocumentLine_conversion_check" CHECK ("purchaseConversionFactor" IS NULL OR "purchaseConversionFactor" > 0),
  ADD CONSTRAINT "BusinessDocumentLine_companyId_stockUnitOfMeasureId_fkey" FOREIGN KEY ("companyId","stockUnitOfMeasureId") REFERENCES "UnitOfMeasure"("companyId","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "BusinessDocumentLine_companyId_warehouseBinId_fkey" FOREIGN KEY ("companyId","warehouseBinId") REFERENCES "WarehouseBin"("companyId","id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "BusinessDocumentLine_companyId_warehouseBinId_idx" ON "BusinessDocumentLine"("companyId","warehouseBinId");
