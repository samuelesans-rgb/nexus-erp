ALTER TABLE "RestaurantBookingWidget"
ADD COLUMN "logoUrl" TEXT,
ADD COLUMN "backgroundColor" TEXT NOT NULL DEFAULT '#ffffff',
ADD COLUMN "textColor" TEXT NOT NULL DEFAULT '#0f172a';
