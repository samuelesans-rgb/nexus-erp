CREATE TYPE "RestaurantBookingConfirmationPolicy" AS ENUM ('MANUAL', 'AUTO_CONFIRM');
CREATE TYPE "RestaurantCalendarExceptionType" AS ENUM ('CLOSED', 'SPECIAL_OPENING', 'OVERRIDE_HOURS', 'CAPACITY_OVERRIDE');

ALTER TABLE "RestaurantTable" ADD COLUMN "rotation" DECIMAL(6,2);
ALTER TABLE "RestaurantReservation" ADD COLUMN "serviceWindowId" TEXT;
ALTER TABLE "RestaurantBookingSettings"
  ADD COLUMN "bufferBeforeMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "bufferAfterMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "confirmationPolicy" "RestaurantBookingConfirmationPolicy" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "cancellationEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "cancellationDeadlineMinutes" INTEGER NOT NULL DEFAULT 1440,
  ADD COLUMN "customerCancellationMessage" TEXT,
  ADD COLUMN "noShowThresholdMinutes" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "cancellationMessage" TEXT;

CREATE TABLE "RestaurantServiceWindow" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "daysOfWeek" INTEGER[] NOT NULL,
  "startTime" TEXT NOT NULL,
  "endTime" TEXT NOT NULL,
  "slotIntervalMinutes" INTEGER NOT NULL,
  "defaultDurationMinutes" INTEGER NOT NULL,
  "maxCovers" INTEGER,
  "bufferBeforeMinutes" INTEGER,
  "bufferAfterMinutes" INTEGER,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RestaurantServiceWindow_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RestaurantServiceWindow_time_check" CHECK ("startTime" ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$' AND "endTime" ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$' AND "startTime" < "endTime"),
  CONSTRAINT "RestaurantServiceWindow_days_check" CHECK ("daysOfWeek" <@ ARRAY[0,1,2,3,4,5,6] AND cardinality("daysOfWeek") > 0),
  CONSTRAINT "RestaurantServiceWindow_values_check" CHECK ("slotIntervalMinutes" >= 5 AND "defaultDurationMinutes" >= 15 AND ("maxCovers" IS NULL OR "maxCovers" > 0) AND ("bufferBeforeMinutes" IS NULL OR "bufferBeforeMinutes" >= 0) AND ("bufferAfterMinutes" IS NULL OR "bufferAfterMinutes" >= 0)),
  CONSTRAINT "RestaurantServiceWindow_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RestaurantServiceWindow_companyId_locationId_fkey" FOREIGN KEY ("companyId","locationId") REFERENCES "Location"("companyId","id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RestaurantServiceWindow_companyId_id_key" ON "RestaurantServiceWindow"("companyId","id");
CREATE UNIQUE INDEX "RestaurantServiceWindow_companyId_locationId_name_key" ON "RestaurantServiceWindow"("companyId","locationId","name");
CREATE INDEX "RestaurantServiceWindow_companyId_locationId_active_idx" ON "RestaurantServiceWindow"("companyId","locationId","active");

CREATE TABLE "RestaurantCalendarException" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "type" "RestaurantCalendarExceptionType" NOT NULL,
  "intervals" JSONB NOT NULL DEFAULT '[]',
  "maxCovers" INTEGER,
  "reason" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RestaurantCalendarException_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RestaurantCalendarException_capacity_check" CHECK ("maxCovers" IS NULL OR "maxCovers" > 0),
  CONSTRAINT "RestaurantCalendarException_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RestaurantCalendarException_companyId_locationId_fkey" FOREIGN KEY ("companyId","locationId") REFERENCES "Location"("companyId","id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RestaurantCalendarException_companyId_id_key" ON "RestaurantCalendarException"("companyId","id");
CREATE INDEX "RestaurantCalendarException_companyId_locationId_date_active_idx" ON "RestaurantCalendarException"("companyId","locationId","date","active");

CREATE TABLE "RestaurantTableCombination" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "areaId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RestaurantTableCombination_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RestaurantTableCombination_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RestaurantTableCombination_companyId_locationId_fkey" FOREIGN KEY ("companyId","locationId") REFERENCES "Location"("companyId","id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RestaurantTableCombination_companyId_areaId_fkey" FOREIGN KEY ("companyId","areaId") REFERENCES "RestaurantArea"("companyId","id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RestaurantTableCombination_companyId_id_key" ON "RestaurantTableCombination"("companyId","id");
CREATE UNIQUE INDEX "RestaurantTableCombination_companyId_locationId_name_key" ON "RestaurantTableCombination"("companyId","locationId","name");
CREATE INDEX "RestaurantTableCombination_companyId_locationId_areaId_active_idx" ON "RestaurantTableCombination"("companyId","locationId","areaId","active");

CREATE TABLE "RestaurantTableCombinationTable" (
  "companyId" TEXT NOT NULL,
  "combinationId" TEXT NOT NULL,
  "tableId" TEXT NOT NULL,
  CONSTRAINT "RestaurantTableCombinationTable_pkey" PRIMARY KEY ("companyId","combinationId","tableId"),
  CONSTRAINT "RestaurantTableCombinationTable_companyId_combinationId_fkey" FOREIGN KEY ("companyId","combinationId") REFERENCES "RestaurantTableCombination"("companyId","id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RestaurantTableCombinationTable_companyId_tableId_fkey" FOREIGN KEY ("companyId","tableId") REFERENCES "RestaurantTable"("companyId","id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "RestaurantTableCombinationTable_companyId_tableId_idx" ON "RestaurantTableCombinationTable"("companyId","tableId");

ALTER TABLE "RestaurantReservation" ADD CONSTRAINT "RestaurantReservation_companyId_serviceWindowId_fkey" FOREIGN KEY ("companyId","serviceWindowId") REFERENCES "RestaurantServiceWindow"("companyId","id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RestaurantBookingSettings"
  ADD CONSTRAINT "RestaurantBookingSettings_buffers_check" CHECK ("bufferBeforeMinutes" >= 0 AND "bufferAfterMinutes" >= 0),
  ADD CONSTRAINT "RestaurantBookingSettings_cancellation_deadline_check" CHECK ("cancellationDeadlineMinutes" >= 0),
  ADD CONSTRAINT "RestaurantBookingSettings_no_show_threshold_check" CHECK ("noShowThresholdMinutes" >= 0);


CREATE TABLE "RestaurantOrderTable" (
  "companyId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "tableId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RestaurantOrderTable_pkey" PRIMARY KEY ("companyId","orderId","tableId"),
  CONSTRAINT "RestaurantOrderTable_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RestaurantOrderTable_companyId_locationId_fkey" FOREIGN KEY ("companyId","locationId") REFERENCES "Location"("companyId","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RestaurantOrderTable_companyId_locationId_orderId_fkey" FOREIGN KEY ("companyId","locationId","orderId") REFERENCES "RestaurantOrder"("companyId","locationId","id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RestaurantOrderTable_companyId_locationId_tableId_fkey" FOREIGN KEY ("companyId","locationId","tableId") REFERENCES "RestaurantTable"("companyId","locationId","id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "RestaurantOrderTable_companyId_locationId_tableId_idx" ON "RestaurantOrderTable"("companyId","locationId","tableId");

INSERT INTO "RestaurantOrderTable" ("companyId","locationId","orderId","tableId")
SELECT "companyId","locationId","id","tableId"
FROM "RestaurantOrder"
WHERE "tableId" IS NOT NULL
ON CONFLICT DO NOTHING;
