CREATE TYPE "KitchenDispatchType" AS ENUM ('NEW', 'ADDITION', 'CHANGE', 'CANCELLATION');
CREATE TYPE "KitchenPrinterType" AS ENUM ('MOCK', 'ESC_POS');
CREATE TYPE "KitchenPrinterConnectionType" AS ENUM ('MOCK', 'NETWORK', 'USB');
CREATE TYPE "KitchenPrintJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'PRINTED', 'FAILED', 'CANCELLED');
CREATE TYPE "KitchenPrintJobType" AS ENUM ('PRINT', 'REPRINT');

ALTER TABLE "RestaurantOrderLine" ADD COLUMN "sentQuantity" DECIMAL(15,3) NOT NULL DEFAULT 0;
UPDATE "RestaurantOrderLine" SET "sentQuantity"="quantity" WHERE "status" IN ('SENT','IN_PREPARATION','READY','SERVED');

CREATE TABLE "KitchenDispatch" (
  "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "locationId" TEXT NOT NULL, "orderId" TEXT NOT NULL,
  "sequenceNumber" INTEGER NOT NULL, "type" "KitchenDispatchType" NOT NULL, "idempotencyKey" TEXT NOT NULL,
  "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KitchenDispatch_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "KitchenDispatch_companyId_id_key" ON "KitchenDispatch"("companyId","id");
CREATE UNIQUE INDEX "KitchenDispatch_companyId_orderId_sequenceNumber_key" ON "KitchenDispatch"("companyId","orderId","sequenceNumber");
CREATE UNIQUE INDEX "KitchenDispatch_companyId_orderId_idempotencyKey_key" ON "KitchenDispatch"("companyId","orderId","idempotencyKey");
CREATE INDEX "KitchenDispatch_companyId_locationId_createdAt_idx" ON "KitchenDispatch"("companyId","locationId","createdAt");
ALTER TABLE "KitchenDispatch" ADD CONSTRAINT "KitchenDispatch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KitchenDispatch" ADD CONSTRAINT "KitchenDispatch_companyId_locationId_fkey" FOREIGN KEY ("companyId","locationId") REFERENCES "Location"("companyId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KitchenDispatch" ADD CONSTRAINT "KitchenDispatch_companyId_orderId_fkey" FOREIGN KEY ("companyId","orderId") REFERENCES "RestaurantOrder"("companyId","id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "KitchenDispatch" ("id","companyId","locationId","orderId","sequenceNumber","type","idempotencyKey","createdById","createdAt")
SELECT 'legacy_'||md5(t."id"),t."companyId",t."locationId",t."orderId",row_number() OVER(PARTITION BY t."companyId",t."orderId" ORDER BY t."createdAt",t."id"),'NEW','legacy:'||t."id",COALESCE(o."createdById",'system'),t."createdAt"
FROM "KitchenTicket" t JOIN "RestaurantOrder" o ON o."companyId"=t."companyId" AND o."id"=t."orderId";

ALTER TABLE "KitchenTicket" ADD COLUMN "dispatchId" TEXT;
ALTER TABLE "KitchenTicket" ADD COLUMN "dispatchType" "KitchenDispatchType";
ALTER TABLE "KitchenTicket" ADD COLUMN "dispatchNumber" INTEGER;
ALTER TABLE "KitchenTicket" ADD COLUMN "orderCode" TEXT;
ALTER TABLE "KitchenTicket" ADD COLUMN "tableNames" JSONB;
ALTER TABLE "KitchenTicket" ADD COLUMN "guestCount" INTEGER;
ALTER TABLE "KitchenTicket" ADD COLUMN "operatorName" TEXT;
ALTER TABLE "KitchenTicket" ADD COLUMN "stationCode" TEXT;
ALTER TABLE "KitchenTicket" ADD COLUMN "stationName" TEXT;
ALTER TABLE "KitchenTicket" ADD COLUMN "reprintCount" INTEGER NOT NULL DEFAULT 0;
UPDATE "KitchenTicket" t SET "dispatchId"='legacy_'||md5(t."id"),"dispatchType"='NEW',"dispatchNumber"=d."sequenceNumber","orderCode"=o."code","tableNames"=COALESCE((SELECT jsonb_agg(rt."code"||' · '||rt."name" ORDER BY rt."code") FROM "RestaurantOrderTable" ot JOIN "RestaurantTable" rt ON rt."companyId"=ot."companyId" AND rt."id"=ot."tableId" WHERE ot."companyId"=t."companyId" AND ot."orderId"=t."orderId"),'[]'::jsonb),"guestCount"=o."guestCount","operatorName"='Sistema',"stationCode"=s."code","stationName"=s."name" FROM "KitchenDispatch" d,"RestaurantOrder" o,"KitchenStation" s WHERE d."id"='legacy_'||md5(t."id") AND o."companyId"=t."companyId" AND o."id"=t."orderId" AND s."companyId"=t."companyId" AND s."id"=t."kitchenStationId";
ALTER TABLE "KitchenTicket" ALTER COLUMN "dispatchId" SET NOT NULL, ALTER COLUMN "dispatchType" SET NOT NULL, ALTER COLUMN "dispatchNumber" SET NOT NULL, ALTER COLUMN "orderCode" SET NOT NULL, ALTER COLUMN "tableNames" SET NOT NULL, ALTER COLUMN "guestCount" SET NOT NULL, ALTER COLUMN "operatorName" SET NOT NULL, ALTER COLUMN "stationCode" SET NOT NULL, ALTER COLUMN "stationName" SET NOT NULL;
CREATE UNIQUE INDEX "KitchenTicket_companyId_dispatchId_kitchenStationId_key" ON "KitchenTicket"("companyId","dispatchId","kitchenStationId");
ALTER TABLE "KitchenTicket" ADD CONSTRAINT "KitchenTicket_companyId_dispatchId_fkey" FOREIGN KEY ("companyId","dispatchId") REFERENCES "KitchenDispatch"("companyId","id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "KitchenTicketLine" ADD COLUMN "dispatchId" TEXT;
ALTER TABLE "KitchenTicketLine" ADD COLUMN "quantity" DECIMAL(15,3);
ALTER TABLE "KitchenTicketLine" ADD COLUMN "productName" TEXT;
ALTER TABLE "KitchenTicketLine" ADD COLUMN "variantName" TEXT;
ALTER TABLE "KitchenTicketLine" ADD COLUMN "modifiers" JSONB;
ALTER TABLE "KitchenTicketLine" ADD COLUMN "notes" TEXT;
ALTER TABLE "KitchenTicketLine" ADD COLUMN "allergens" JSONB;
ALTER TABLE "KitchenTicketLine" ADD COLUMN "stationCode" TEXT;
ALTER TABLE "KitchenTicketLine" ADD COLUMN "stationName" TEXT;
UPDATE "KitchenTicketLine" l SET "dispatchId"=t."dispatchId","quantity"=ol."quantity","productName"=ol."productName","variantName"=ol."variantName","modifiers"=COALESCE((SELECT jsonb_agg(jsonb_build_object('groupName',m."groupName",'name',m."name",'notes',m."notes") ORDER BY m."id") FROM "RestaurantOrderLineModifier" m WHERE m."companyId"=l."companyId" AND m."orderLineId"=l."orderLineId"),'[]'::jsonb),"notes"=COALESCE(ol."kitchenNotes",ol."notes"),"allergens"='[]'::jsonb,"stationCode"=t."stationCode","stationName"=t."stationName" FROM "KitchenTicket" t,"RestaurantOrderLine" ol WHERE t."companyId"=l."companyId" AND t."id"=l."ticketId" AND ol."companyId"=l."companyId" AND ol."id"=l."orderLineId";
ALTER TABLE "KitchenTicketLine" ALTER COLUMN "dispatchId" SET NOT NULL, ALTER COLUMN "quantity" SET NOT NULL, ALTER COLUMN "productName" SET NOT NULL, ALTER COLUMN "modifiers" SET NOT NULL, ALTER COLUMN "allergens" SET NOT NULL, ALTER COLUMN "stationCode" SET NOT NULL, ALTER COLUMN "stationName" SET NOT NULL;
DROP INDEX "KitchenTicketLine_companyId_ticketId_orderLineId_key";
CREATE UNIQUE INDEX "KitchenTicketLine_companyId_dispatchId_orderLineId_key" ON "KitchenTicketLine"("companyId","dispatchId","orderLineId");
ALTER TABLE "KitchenTicketLine" ADD CONSTRAINT "KitchenTicketLine_companyId_dispatchId_fkey" FOREIGN KEY ("companyId","dispatchId") REFERENCES "KitchenDispatch"("companyId","id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "RestaurantPrinter" (
 "id" TEXT NOT NULL,"companyId" TEXT NOT NULL,"locationId" TEXT NOT NULL,"stationId" TEXT NOT NULL,"name" TEXT NOT NULL,"code" TEXT NOT NULL,
 "type" "KitchenPrinterType" NOT NULL DEFAULT 'MOCK',"connectionType" "KitchenPrinterConnectionType" NOT NULL DEFAULT 'MOCK',"address" TEXT,"enabled" BOOLEAN NOT NULL DEFAULT true,"copies" INTEGER NOT NULL DEFAULT 1,"paperWidth" INTEGER NOT NULL DEFAULT 80,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "RestaurantPrinter_pkey" PRIMARY KEY ("id"), CONSTRAINT "RestaurantPrinter_copies_check" CHECK ("copies">0), CONSTRAINT "RestaurantPrinter_paperWidth_check" CHECK ("paperWidth" IN (58,80))
);
CREATE UNIQUE INDEX "RestaurantPrinter_companyId_id_key" ON "RestaurantPrinter"("companyId","id");
CREATE UNIQUE INDEX "RestaurantPrinter_companyId_locationId_code_key" ON "RestaurantPrinter"("companyId","locationId","code");
CREATE INDEX "RestaurantPrinter_companyId_locationId_stationId_enabled_idx" ON "RestaurantPrinter"("companyId","locationId","stationId","enabled");
ALTER TABLE "RestaurantPrinter" ADD CONSTRAINT "RestaurantPrinter_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RestaurantPrinter" ADD CONSTRAINT "RestaurantPrinter_companyId_locationId_fkey" FOREIGN KEY ("companyId","locationId") REFERENCES "Location"("companyId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RestaurantPrinter" ADD CONSTRAINT "RestaurantPrinter_companyId_stationId_fkey" FOREIGN KEY ("companyId","stationId") REFERENCES "KitchenStation"("companyId","id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "KitchenPrintJob" (
 "id" TEXT NOT NULL,"companyId" TEXT NOT NULL,"locationId" TEXT NOT NULL,"stationId" TEXT NOT NULL,"ticketId" TEXT NOT NULL,"printerId" TEXT NOT NULL,"type" "KitchenPrintJobType" NOT NULL DEFAULT 'PRINT',"status" "KitchenPrintJobStatus" NOT NULL DEFAULT 'PENDING',"attempts" INTEGER NOT NULL DEFAULT 0,"lastError" TEXT,"payload" TEXT NOT NULL,"idempotencyKey" TEXT NOT NULL,"requestedById" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"startedAt" TIMESTAMP(3),"printedAt" TIMESTAMP(3),CONSTRAINT "KitchenPrintJob_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "KitchenPrintJob_companyId_id_key" ON "KitchenPrintJob"("companyId","id");
CREATE UNIQUE INDEX "KitchenPrintJob_companyId_idempotencyKey_key" ON "KitchenPrintJob"("companyId","idempotencyKey");
CREATE INDEX "KitchenPrintJob_companyId_locationId_status_createdAt_idx" ON "KitchenPrintJob"("companyId","locationId","status","createdAt");
CREATE INDEX "KitchenPrintJob_companyId_printerId_status_idx" ON "KitchenPrintJob"("companyId","printerId","status");
ALTER TABLE "KitchenPrintJob" ADD CONSTRAINT "KitchenPrintJob_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KitchenPrintJob" ADD CONSTRAINT "KitchenPrintJob_companyId_locationId_fkey" FOREIGN KEY ("companyId","locationId") REFERENCES "Location"("companyId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KitchenPrintJob" ADD CONSTRAINT "KitchenPrintJob_companyId_stationId_fkey" FOREIGN KEY ("companyId","stationId") REFERENCES "KitchenStation"("companyId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KitchenPrintJob" ADD CONSTRAINT "KitchenPrintJob_companyId_ticketId_fkey" FOREIGN KEY ("companyId","ticketId") REFERENCES "KitchenTicket"("companyId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KitchenPrintJob" ADD CONSTRAINT "KitchenPrintJob_companyId_printerId_fkey" FOREIGN KEY ("companyId","printerId") REFERENCES "RestaurantPrinter"("companyId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
