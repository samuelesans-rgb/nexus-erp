CREATE TYPE "ItemCategoryPurpose" AS ENUM ('SELLABLE', 'INVENTORY', 'BOTH');

ALTER TABLE "ItemCategory" ADD COLUMN "purpose" "ItemCategoryPurpose" NOT NULL DEFAULT 'BOTH';

CREATE TABLE "Allergen" (
  "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL,
  "description" TEXT, "active" BOOLEAN NOT NULL DEFAULT true, "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Allergen_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Allergen_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Allergen_companyId_code_key" ON "Allergen"("companyId", "code");
CREATE UNIQUE INDEX "Allergen_companyId_id_key" ON "Allergen"("companyId", "id");
CREATE INDEX "Allergen_companyId_active_deletedAt_idx" ON "Allergen"("companyId", "active", "deletedAt");

CREATE TABLE "ItemAllergen" (
  "companyId" TEXT NOT NULL, "itemId" TEXT NOT NULL, "allergenId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ItemAllergen_pkey" PRIMARY KEY ("companyId", "itemId", "allergenId"),
  CONSTRAINT "ItemAllergen_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ItemAllergen_companyId_itemId_fkey" FOREIGN KEY ("companyId", "itemId") REFERENCES "Item"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ItemAllergen_companyId_allergenId_fkey" FOREIGN KEY ("companyId", "allergenId") REFERENCES "Allergen"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ItemAllergen_companyId_allergenId_idx" ON "ItemAllergen"("companyId", "allergenId");

CREATE TABLE "RestaurantProductVariant" (
  "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "itemId" TEXT NOT NULL, "name" TEXT NOT NULL, "sku" TEXT,
  "priceOverride" DECIMAL(15,2), "priceDelta" DECIMAL(15,2) NOT NULL DEFAULT 0, "available" BOOLEAN NOT NULL DEFAULT true,
  "active" BOOLEAN NOT NULL DEFAULT true, "sortOrder" INTEGER NOT NULL DEFAULT 0, "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RestaurantProductVariant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RestaurantProductVariant_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RestaurantProductVariant_companyId_itemId_fkey" FOREIGN KEY ("companyId", "itemId") REFERENCES "Item"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RestaurantProductVariant_companyId_id_key" ON "RestaurantProductVariant"("companyId", "id");
CREATE UNIQUE INDEX "RestaurantProductVariant_companyId_itemId_id_key" ON "RestaurantProductVariant"("companyId", "itemId", "id");
CREATE UNIQUE INDEX "RestaurantProductVariant_companyId_itemId_name_key" ON "RestaurantProductVariant"("companyId", "itemId", "name");
CREATE INDEX "RestaurantProductVariant_companyId_itemId_active_available_deletedAt_idx" ON "RestaurantProductVariant"("companyId", "itemId", "active", "available", "deletedAt");

CREATE TABLE "RestaurantModifierGroup" (
  "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "itemId" TEXT NOT NULL, "name" TEXT NOT NULL, "required" BOOLEAN NOT NULL DEFAULT false,
  "minSelections" INTEGER NOT NULL DEFAULT 0, "maxSelections" INTEGER NOT NULL DEFAULT 1, "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true, "deletedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RestaurantModifierGroup_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RestaurantModifierGroup_selection_bounds_check" CHECK ("minSelections" >= 0 AND "maxSelections" >= "minSelections" AND (NOT "required" OR "minSelections" >= 1)),
  CONSTRAINT "RestaurantModifierGroup_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RestaurantModifierGroup_companyId_itemId_fkey" FOREIGN KEY ("companyId", "itemId") REFERENCES "Item"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RestaurantModifierGroup_companyId_id_key" ON "RestaurantModifierGroup"("companyId", "id");
CREATE UNIQUE INDEX "RestaurantModifierGroup_companyId_itemId_name_key" ON "RestaurantModifierGroup"("companyId", "itemId", "name");
CREATE INDEX "RestaurantModifierGroup_companyId_itemId_active_deletedAt_idx" ON "RestaurantModifierGroup"("companyId", "itemId", "active", "deletedAt");

CREATE TABLE "RestaurantModifier" (
  "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "groupId" TEXT NOT NULL, "name" TEXT NOT NULL, "priceDelta" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "itemId" TEXT, "active" BOOLEAN NOT NULL DEFAULT true, "sortOrder" INTEGER NOT NULL DEFAULT 0, "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RestaurantModifier_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RestaurantModifier_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RestaurantModifier_companyId_groupId_fkey" FOREIGN KEY ("companyId", "groupId") REFERENCES "RestaurantModifierGroup"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RestaurantModifier_companyId_itemId_fkey" FOREIGN KEY ("companyId", "itemId") REFERENCES "Item"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RestaurantModifier_companyId_id_key" ON "RestaurantModifier"("companyId", "id");
CREATE UNIQUE INDEX "RestaurantModifier_companyId_groupId_name_key" ON "RestaurantModifier"("companyId", "groupId", "name");
CREATE INDEX "RestaurantModifier_companyId_groupId_active_deletedAt_idx" ON "RestaurantModifier"("companyId", "groupId", "active", "deletedAt");

CREATE TABLE "RestaurantRecipeImpact" (
  "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "variantId" TEXT, "modifierId" TEXT, "componentItemId" TEXT NOT NULL,
  "unitOfMeasureId" TEXT NOT NULL, "quantityDelta" DECIMAL(15,3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RestaurantRecipeImpact_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RestaurantRecipeImpact_owner_check" CHECK (("variantId" IS NOT NULL) <> ("modifierId" IS NOT NULL)),
  CONSTRAINT "RestaurantRecipeImpact_nonzero_check" CHECK ("quantityDelta" <> 0),
  CONSTRAINT "RestaurantRecipeImpact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RestaurantRecipeImpact_companyId_variantId_fkey" FOREIGN KEY ("companyId", "variantId") REFERENCES "RestaurantProductVariant"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RestaurantRecipeImpact_companyId_modifierId_fkey" FOREIGN KEY ("companyId", "modifierId") REFERENCES "RestaurantModifier"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RestaurantRecipeImpact_companyId_componentItemId_fkey" FOREIGN KEY ("companyId", "componentItemId") REFERENCES "Item"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RestaurantRecipeImpact_companyId_unitOfMeasureId_fkey" FOREIGN KEY ("companyId", "unitOfMeasureId") REFERENCES "UnitOfMeasure"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RestaurantRecipeImpact_companyId_variantId_componentItemId_key" ON "RestaurantRecipeImpact"("companyId", "variantId", "componentItemId");
CREATE UNIQUE INDEX "RestaurantRecipeImpact_companyId_modifierId_componentItemId_key" ON "RestaurantRecipeImpact"("companyId", "modifierId", "componentItemId");
CREATE INDEX "RestaurantRecipeImpact_companyId_componentItemId_idx" ON "RestaurantRecipeImpact"("companyId", "componentItemId");

ALTER TABLE "RestaurantOrderLine" ADD COLUMN "baseUnitPrice" DECIMAL(15,4), ADD COLUMN "lineTotal" DECIMAL(15,2),
  ADD COLUMN "modifierTotal" DECIMAL(15,4) NOT NULL DEFAULT 0, ADD COLUMN "productName" TEXT, ADD COLUMN "variantId" TEXT,
  ADD COLUMN "variantName" TEXT, ADD COLUMN "vatName" TEXT, ADD COLUMN "vatPercentage" DECIMAL(5,2);
ALTER TABLE "RestaurantOrderLineModifier" ADD COLUMN "groupName" TEXT, ADD COLUMN "modifierId" TEXT;

WITH snapshot AS (
  SELECT line."id", item."name" AS product_name, vat."name" AS vat_name, vat."percentage" AS vat_percentage,
    line."unitPrice" AS base_price, COALESCE(SUM(modifier."priceDelta"), 0) AS modifier_total, line."quantity"
  FROM "RestaurantOrderLine" line
  JOIN "Item" item ON item."companyId" = line."companyId" AND item."id" = line."itemId"
  JOIN "VatRate" vat ON vat."companyId" = line."companyId" AND vat."id" = line."vatRateId"
  LEFT JOIN "RestaurantOrderLineModifier" modifier ON modifier."companyId" = line."companyId" AND modifier."orderLineId" = line."id"
  GROUP BY line."id", item."name", vat."name", vat."percentage", line."unitPrice", line."quantity"
)
UPDATE "RestaurantOrderLine" line SET "productName" = snapshot.product_name, "vatName" = snapshot.vat_name,
  "vatPercentage" = snapshot.vat_percentage, "baseUnitPrice" = snapshot.base_price, "modifierTotal" = snapshot.modifier_total,
  "unitPrice" = snapshot.base_price + snapshot.modifier_total, "lineTotal" = ROUND(snapshot.quantity * (snapshot.base_price + snapshot.modifier_total), 2)
FROM snapshot WHERE snapshot."id" = line."id";
DO $$ BEGIN IF EXISTS (SELECT 1 FROM "RestaurantOrderLine" WHERE "productName" IS NULL OR "vatName" IS NULL OR "vatPercentage" IS NULL OR "baseUnitPrice" IS NULL OR "lineTotal" IS NULL) THEN RAISE EXCEPTION 'RestaurantOrderLine snapshot backfill incompleto'; END IF; END $$;
ALTER TABLE "RestaurantOrderLine" ALTER COLUMN "productName" SET NOT NULL, ALTER COLUMN "vatName" SET NOT NULL,
  ALTER COLUMN "vatPercentage" SET NOT NULL, ALTER COLUMN "baseUnitPrice" SET NOT NULL, ALTER COLUMN "lineTotal" SET NOT NULL;
ALTER TABLE "RestaurantOrderLine" ADD CONSTRAINT "RestaurantOrderLine_companyId_itemId_variantId_fkey" FOREIGN KEY ("companyId", "itemId", "variantId") REFERENCES "RestaurantProductVariant"("companyId", "itemId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RestaurantOrderLineModifier" ADD CONSTRAINT "RestaurantOrderLineModifier_companyId_modifierId_fkey" FOREIGN KEY ("companyId", "modifierId") REFERENCES "RestaurantModifier"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "RestaurantOrderLineModifier_companyId_orderLineId_modifierId_key" ON "RestaurantOrderLineModifier"("companyId", "orderLineId", "modifierId");
