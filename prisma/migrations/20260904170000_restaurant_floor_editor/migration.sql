ALTER TABLE "RestaurantArea"
  ADD COLUMN "layoutWidth" INTEGER NOT NULL DEFAULT 1200,
  ADD COLUMN "layoutHeight" INTEGER NOT NULL DEFAULT 800,
  ADD COLUMN "backgroundImage" TEXT,
  ADD COLUMN "backgroundOpacity" DECIMAL(3,2) NOT NULL DEFAULT 0.15;

ALTER TABLE "RestaurantTable"
  ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "visibleInFloor" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "fusionTableNumber" INTEGER;

UPDATE "RestaurantTable"
SET "shape" = COALESCE("shape", 'RECTANGLE'),
    "positionX" = COALESCE("positionX", 40),
    "positionY" = COALESCE("positionY", 40),
    "width" = COALESCE("width", 120),
    "height" = COALESCE("height", 80),
    "rotation" = COALESCE("rotation", 0);

ALTER TABLE "RestaurantTable"
  ALTER COLUMN "shape" SET DEFAULT 'RECTANGLE',
  ALTER COLUMN "shape" SET NOT NULL,
  ALTER COLUMN "positionX" SET DEFAULT 40,
  ALTER COLUMN "positionX" SET NOT NULL,
  ALTER COLUMN "positionY" SET DEFAULT 40,
  ALTER COLUMN "positionY" SET NOT NULL,
  ALTER COLUMN "width" SET DEFAULT 120,
  ALTER COLUMN "width" SET NOT NULL,
  ALTER COLUMN "height" SET DEFAULT 80,
  ALTER COLUMN "height" SET NOT NULL,
  ALTER COLUMN "rotation" SET DEFAULT 0,
  ALTER COLUMN "rotation" SET NOT NULL;

CREATE UNIQUE INDEX "RestaurantTable_companyId_locationId_fusionTableNumber_key"
  ON "RestaurantTable"("companyId", "locationId", "fusionTableNumber");

ALTER TABLE "RestaurantArea"
  ADD CONSTRAINT "RestaurantArea_layout_dimensions_check"
  CHECK ("layoutWidth" BETWEEN 320 AND 5000 AND "layoutHeight" BETWEEN 240 AND 5000),
  ADD CONSTRAINT "RestaurantArea_background_opacity_check"
  CHECK ("backgroundOpacity" BETWEEN 0 AND 1);

ALTER TABLE "RestaurantTable"
  ADD CONSTRAINT "RestaurantTable_floor_shape_check"
  CHECK ("shape" IN ('RECTANGLE', 'SQUARE', 'ROUND')),
  ADD CONSTRAINT "RestaurantTable_floor_geometry_check"
  CHECK ("positionX" >= 0 AND "positionY" >= 0 AND "width" >= 60 AND "height" >= 60),
  ADD CONSTRAINT "RestaurantTable_floor_rotation_check"
  CHECK ("rotation" IN (0, 90, 180, 270)),
  ADD CONSTRAINT "RestaurantTable_fusion_number_check"
  CHECK ("fusionTableNumber" IS NULL OR "fusionTableNumber" BETWEEN 1 AND 199);
