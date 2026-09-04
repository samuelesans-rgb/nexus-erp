ALTER TABLE "RestaurantModifier"
  ADD COLUMN "locationId" TEXT,
  ADD COLUMN "kitchenLabel" TEXT,
  ADD COLUMN "fusionPluId" INTEGER,
  ADD COLUMN "fusionPlateVariation" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "RestaurantOrderLineModifier"
  ADD COLUMN "kitchenLabel" TEXT,
  ADD COLUMN "fusionPluId" INTEGER,
  ADD COLUMN "fusionPlateVariation" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

UPDATE "RestaurantModifier" AS modifier
SET "locationId" = COALESCE(
  (
    SELECT menu."locationId"
    FROM "RestaurantModifierGroup" AS modifier_group
    JOIN "RestaurantMenuItem" AS menu_item ON menu_item."itemId" = modifier_group."itemId"
    JOIN "RestaurantMenuSection" AS section ON section.id = menu_item."menuSectionId"
    JOIN "RestaurantMenu" AS menu ON menu.id = section."menuId"
    WHERE modifier_group.id = modifier."groupId"
      AND menu."companyId" = modifier."companyId"
      AND menu."deletedAt" IS NULL
    ORDER BY menu."active" DESC, menu."createdAt" ASC
    LIMIT 1
  ),
  (
    SELECT location.id
    FROM "Location" AS location
    WHERE location."companyId" = modifier."companyId"
      AND location."deletedAt" IS NULL
    ORDER BY location."isHeadquarters" DESC, location."createdAt" ASC
    LIMIT 1
  )
), "kitchenLabel" = modifier.name;

UPDATE "RestaurantOrderLineModifier" AS selection
SET "kitchenLabel" = selection.name,
    "fusionPluId" = modifier."fusionPluId",
    "fusionPlateVariation" = modifier."fusionPlateVariation"
FROM "RestaurantModifier" AS modifier
WHERE modifier.id = selection."modifierId"
  AND modifier."companyId" = selection."companyId";

UPDATE "RestaurantOrderLineModifier"
SET "kitchenLabel" = name
WHERE "kitchenLabel" IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "RestaurantModifier" WHERE "locationId" IS NULL) THEN
    RAISE EXCEPTION 'Cannot assign a location to every RestaurantModifier';
  END IF;
END $$;

ALTER TABLE "RestaurantModifier"
  ALTER COLUMN "locationId" SET NOT NULL,
  ALTER COLUMN "kitchenLabel" SET NOT NULL;

ALTER TABLE "RestaurantOrderLineModifier"
  ALTER COLUMN "kitchenLabel" SET NOT NULL;

DROP INDEX "RestaurantModifier_companyId_groupId_name_key";
DROP INDEX "RestaurantModifier_companyId_groupId_active_deletedAt_idx";

CREATE UNIQUE INDEX "RestaurantModifier_companyId_locationId_groupId_name_key"
  ON "RestaurantModifier"("companyId", "locationId", "groupId", "name");
CREATE INDEX "RestaurantModifier_companyId_locationId_groupId_active_deletedAt_idx"
  ON "RestaurantModifier"("companyId", "locationId", "groupId", "active", "deletedAt");

ALTER TABLE "RestaurantModifier"
  ADD CONSTRAINT "RestaurantModifier_companyId_locationId_fkey"
  FOREIGN KEY ("companyId", "locationId") REFERENCES "Location"("companyId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RestaurantModifier"
  ADD CONSTRAINT "RestaurantModifier_fusion_mapping_check"
  CHECK ("fusionPluId" IS NULL OR "fusionPluId" > 0);

ALTER TABLE "RestaurantOrderLineModifier"
  ADD CONSTRAINT "RestaurantOrderLineModifier_fusion_mapping_check"
  CHECK ("fusionPluId" IS NULL OR "fusionPluId" > 0);

INSERT INTO "Role" ("id", "code", "name", "description", "system")
VALUES (
  'nexus_role_sala',
  'SALA',
  'Operatore sala',
  'Accesso operativo alla PWA sala',
  true
)
ON CONFLICT ("code") DO UPDATE
SET "name" = EXCLUDED."name",
    "description" = EXCLUDED."description",
    "system" = true;
