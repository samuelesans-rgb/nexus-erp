CREATE TYPE "KitchenPrinterDriver" AS ENUM ('MOCK', 'ESC_POS_TCP', 'ESC_POS_USB', 'ESC_POS_SERIAL', 'VENDOR_SPECIFIC');
CREATE TYPE "KitchenPrinterMode" AS ENUM ('LEGACY_FUSION', 'NEXUS_DIRECT');
CREATE TYPE "KitchenPrinterDeviceType" AS ENUM ('FISCAL', 'NON_FISCAL');
CREATE TYPE "KitchenFusionStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'DISPATCHING', 'ACCEPTED', 'REJECTED', 'UNCERTAIN');

ALTER TYPE "KitchenPrintJobStatus" ADD VALUE 'BLOCKED' BEFORE 'PENDING';
ALTER TYPE "KitchenPrintJobStatus" ADD VALUE 'UNCERTAIN' AFTER 'FAILED';

ALTER TABLE "KitchenDispatch"
  ADD COLUMN "fusionStatus" "KitchenFusionStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN "fusionError" TEXT,
  ADD COLUMN "fusionUpdatedAt" TIMESTAMP(3);

ALTER TABLE "RestaurantPrinter"
  ADD COLUMN "driver" "KitchenPrinterDriver" NOT NULL DEFAULT 'MOCK',
  ADD COLUMN "mode" "KitchenPrinterMode",
  ADD COLUMN "deviceType" "KitchenPrinterDeviceType",
  ADD COLUMN "host" TEXT,
  ADD COLUMN "port" INTEGER,
  ADD COLUMN "charsPerLine" INTEGER,
  ADD COLUMN "encoding" TEXT NOT NULL DEFAULT 'UTF-8';

UPDATE "RestaurantPrinter"
SET "mode" = CASE WHEN "type" IN ('CUSTOM_KUBE', 'FUSION_XML_1745') THEN 'LEGACY_FUSION'::"KitchenPrinterMode" ELSE 'NEXUS_DIRECT'::"KitchenPrinterMode" END,
    "deviceType" = CASE WHEN "type" IN ('CUSTOM_KUBE', 'FUSION_XML_1745') THEN 'FISCAL'::"KitchenPrinterDeviceType" ELSE 'NON_FISCAL'::"KitchenPrinterDeviceType" END;

ALTER TABLE "RestaurantPrinter"
  ALTER COLUMN "mode" SET NOT NULL,
  ALTER COLUMN "mode" SET DEFAULT 'NEXUS_DIRECT',
  ALTER COLUMN "deviceType" SET NOT NULL,
  ALTER COLUMN "deviceType" SET DEFAULT 'NON_FISCAL';

ALTER TABLE "KitchenPrintJob"
  ADD COLUMN "payloadHash" TEXT,
  ADD COLUMN "originalJobId" TEXT,
  ADD COLUMN "reprintReason" TEXT,
  ADD COLUMN "writeStartedAt" TIMESTAMP(3);

UPDATE "KitchenPrintJob"
SET "payloadHash" = encode(sha256(convert_to("payload", 'UTF8')), 'hex')
WHERE "payloadHash" IS NULL;

ALTER TABLE "KitchenPrintJob" ALTER COLUMN "payloadHash" SET NOT NULL;
ALTER TABLE "KitchenPrintJob" ADD CONSTRAINT "KitchenPrintJob_originalJobId_fkey"
  FOREIGN KEY ("companyId", "originalJobId") REFERENCES "KitchenPrintJob"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "KitchenPrintJob_companyId_originalJobId_idx" ON "KitchenPrintJob"("companyId", "originalJobId");
