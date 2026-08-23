ALTER TABLE "BusinessDocumentLine" ADD COLUMN "vatName" TEXT, ADD COLUMN "vatPercentage" DECIMAL(5,2);
UPDATE "BusinessDocumentLine" line SET "vatName"=vat."name", "vatPercentage"=vat."percentage" FROM "VatRate" vat WHERE vat."companyId"=line."companyId" AND vat."id"=line."vatRateId";
DO $$ BEGIN IF EXISTS (SELECT 1 FROM "BusinessDocumentLine" WHERE "vatName" IS NULL OR "vatPercentage" IS NULL) THEN RAISE EXCEPTION 'BusinessDocumentLine tax snapshot backfill incompleto'; END IF; END $$;
ALTER TABLE "BusinessDocumentLine" ALTER COLUMN "vatName" SET NOT NULL, ALTER COLUMN "vatPercentage" SET NOT NULL;
