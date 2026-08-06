ALTER TABLE "RestaurantReservation"
  ADD COLUMN "durationMinutes" INTEGER NOT NULL DEFAULT 120,
  ADD COLUMN "confirmationTokenHash" TEXT,
  ADD COLUMN "cancellationTokenHash" TEXT,
  ADD COLUMN "privacyConsentAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "RestaurantReservation_confirmationTokenHash_key"
  ON "RestaurantReservation"("confirmationTokenHash");
CREATE UNIQUE INDEX "RestaurantReservation_cancellationTokenHash_key"
  ON "RestaurantReservation"("cancellationTokenHash");

CREATE TABLE "RestaurantBookingSettings" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "openingHours" JSONB NOT NULL DEFAULT '{}',
  "slotIntervalMinutes" INTEGER NOT NULL DEFAULT 30,
  "defaultDurationMinutes" INTEGER NOT NULL DEFAULT 120,
  "minAdvanceMinutes" INTEGER NOT NULL DEFAULT 60,
  "maxAdvanceDays" INTEGER NOT NULL DEFAULT 90,
  "maxCoversPerSlot" INTEGER NOT NULL DEFAULT 0,
  "confirmationMessage" TEXT,
  "internalNotificationEmail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RestaurantBookingSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RestaurantBookingSettings_companyId_locationId_key"
  ON "RestaurantBookingSettings"("companyId", "locationId");
CREATE INDEX "RestaurantBookingSettings_companyId_locationId_enabled_idx"
  ON "RestaurantBookingSettings"("companyId", "locationId", "enabled");

ALTER TABLE "RestaurantBookingSettings"
  ADD CONSTRAINT "RestaurantBookingSettings_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RestaurantBookingSettings"
  ADD CONSTRAINT "RestaurantBookingSettings_companyId_locationId_fkey"
  FOREIGN KEY ("companyId", "locationId") REFERENCES "Location"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
