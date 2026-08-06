CREATE TABLE "RestaurantBookingWidget" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "publicKey" TEXT NOT NULL,
    "allowedDomains" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "mode" TEXT NOT NULL DEFAULT 'INLINE',
    "theme" TEXT NOT NULL DEFAULT 'LIGHT',
    "primaryColor" TEXT NOT NULL DEFAULT '#0f172a',
    "secondaryColor" TEXT NOT NULL DEFAULT '#ffffff',
    "accentColor" TEXT NOT NULL DEFAULT '#059669',
    "borderRadius" INTEGER NOT NULL DEFAULT 16,
    "fontFamily" TEXT NOT NULL DEFAULT 'system-ui',
    "buttonLabel" TEXT NOT NULL DEFAULT 'Prenota ora',
    "heading" TEXT NOT NULL DEFAULT 'Prenota un tavolo',
    "description" TEXT,
    "privacyUrl" TEXT,
    "successMessage" TEXT NOT NULL DEFAULT 'Prenotazione ricevuta.',
    "requirePhone" BOOLEAN NOT NULL DEFAULT true,
    "requireEmail" BOOLEAN NOT NULL DEFAULT true,
    "showNotes" BOOLEAN NOT NULL DEFAULT true,
    "locale" TEXT NOT NULL DEFAULT 'it-IT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantBookingWidget_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RestaurantBookingWidget_publicKey_key" ON "RestaurantBookingWidget"("publicKey");
CREATE UNIQUE INDEX "RestaurantBookingWidget_companyId_locationId_key" ON "RestaurantBookingWidget"("companyId", "locationId");
CREATE INDEX "RestaurantBookingWidget_companyId_enabled_idx" ON "RestaurantBookingWidget"("companyId", "enabled");

ALTER TABLE "RestaurantBookingWidget" ADD CONSTRAINT "RestaurantBookingWidget_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RestaurantBookingWidget" ADD CONSTRAINT "RestaurantBookingWidget_companyId_locationId_fkey" FOREIGN KEY ("companyId", "locationId") REFERENCES "Location"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
