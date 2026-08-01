-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('PRODUCT', 'SERVICE', 'INGREDIENT', 'RECIPE', 'BEAUTY_SERVICE', 'HOTEL_ROOM', 'PACKAGE', 'GIFT_CARD');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateTable
CREATE TABLE "ItemCategory" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitOfMeasure" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "precision" INTEGER NOT NULL DEFAULT 2,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnitOfMeasure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VatRate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "percentage" DECIMAL(5,2) NOT NULL,
    "natureCode" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VatRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "ItemType" NOT NULL,
    "status" "ItemStatus" NOT NULL DEFAULT 'ACTIVE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "description" TEXT,
    "internalNotes" TEXT,
    "barcode" TEXT,
    "sku" TEXT,
    "imageUrl" TEXT,
    "categoryId" TEXT,
    "unitOfMeasureId" TEXT,
    "vatRateId" TEXT,
    "salePrice" DECIMAL(15,2),
    "purchasePrice" DECIMAL(15,2),
    "standardCost" DECIMAL(15,2),
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "sellable" BOOLEAN NOT NULL DEFAULT true,
    "purchasable" BOOLEAN NOT NULL DEFAULT false,
    "stockManaged" BOOLEAN NOT NULL DEFAULT false,
    "trackLots" BOOLEAN NOT NULL DEFAULT false,
    "trackSerials" BOOLEAN NOT NULL DEFAULT false,
    "trackExpiration" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductProfile" (
    "itemId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "weight" DECIMAL(15,3),
    "dimensions" JSONB,
    "manufacturer" TEXT,
    "brand" TEXT,
    "reorderPoint" DECIMAL(15,3),
    "minimumStock" DECIMAL(15,3),

    CONSTRAINT "ProductProfile_pkey" PRIMARY KEY ("itemId")
);

-- CreateTable
CREATE TABLE "ServiceProfile" (
    "itemId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "durationMinutes" INTEGER,
    "requiresAppointment" BOOLEAN NOT NULL DEFAULT false,
    "defaultCapacity" INTEGER,

    CONSTRAINT "ServiceProfile_pkey" PRIMARY KEY ("itemId")
);

-- CreateTable
CREATE TABLE "IngredientProfile" (
    "itemId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "yieldPercentage" DECIMAL(5,2),
    "storageInstructions" TEXT,
    "allergenNotes" TEXT,
    "perishabilityDays" INTEGER,

    CONSTRAINT "IngredientProfile_pkey" PRIMARY KEY ("itemId")
);

-- CreateTable
CREATE TABLE "RecipeProfile" (
    "itemId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "preparationMinutes" INTEGER,
    "portions" DECIMAL(15,3),
    "yieldQuantity" DECIMAL(15,3),
    "instructions" TEXT,
    "foodCostTarget" DECIMAL(5,2),

    CONSTRAINT "RecipeProfile_pkey" PRIMARY KEY ("itemId")
);

-- CreateTable
CREATE TABLE "RecipeComponent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "recipeItemId" TEXT NOT NULL,
    "componentItemId" TEXT NOT NULL,
    "unitOfMeasureId" TEXT NOT NULL,
    "quantity" DECIMAL(15,3) NOT NULL,
    "wastePercentage" DECIMAL(5,2),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecipeComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BeautyServiceProfile" (
    "itemId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "cleanupMinutes" INTEGER,
    "requiresCabin" BOOLEAN NOT NULL DEFAULT false,
    "requiresOperator" BOOLEAN NOT NULL DEFAULT true,
    "recommendedRepeatDays" INTEGER,
    "consentRequired" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "BeautyServiceProfile_pkey" PRIMARY KEY ("itemId")
);

-- CreateTable
CREATE TABLE "HotelRoomProfile" (
    "itemId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "capacityAdults" INTEGER NOT NULL DEFAULT 1,
    "capacityChildren" INTEGER NOT NULL DEFAULT 0,
    "roomTypeCode" TEXT,
    "physicalRoomCode" TEXT,
    "floor" TEXT,
    "sellableUnit" BOOLEAN NOT NULL DEFAULT true,
    "housekeepingRequired" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "HotelRoomProfile_pkey" PRIMARY KEY ("itemId")
);

-- CreateTable
CREATE TABLE "PackageProfile" (
    "itemId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "validityDays" INTEGER,
    "usageLimit" INTEGER,

    CONSTRAINT "PackageProfile_pkey" PRIMARY KEY ("itemId")
);

-- CreateTable
CREATE TABLE "PackageComponent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "packageItemId" TEXT NOT NULL,
    "componentItemId" TEXT NOT NULL,
    "unitOfMeasureId" TEXT NOT NULL,
    "quantity" DECIMAL(15,3) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackageComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiftCardProfile" (
    "itemId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "defaultValidityDays" INTEGER NOT NULL,
    "fixedValue" DECIMAL(15,2),
    "reusable" BOOLEAN NOT NULL DEFAULT false,
    "transferable" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "GiftCardProfile_pkey" PRIMARY KEY ("itemId")
);

-- CreateIndex
CREATE INDEX "ItemCategory_companyId_active_deletedAt_idx" ON "ItemCategory"("companyId", "active", "deletedAt");

-- CreateIndex
CREATE INDEX "ItemCategory_parentId_idx" ON "ItemCategory"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemCategory_companyId_code_key" ON "ItemCategory"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ItemCategory_companyId_id_key" ON "ItemCategory"("companyId", "id");

-- CreateIndex
CREATE INDEX "UnitOfMeasure_companyId_active_idx" ON "UnitOfMeasure"("companyId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "UnitOfMeasure_companyId_code_key" ON "UnitOfMeasure"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "UnitOfMeasure_companyId_id_key" ON "UnitOfMeasure"("companyId", "id");

-- CreateIndex
CREATE INDEX "VatRate_companyId_active_idx" ON "VatRate"("companyId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "VatRate_companyId_code_key" ON "VatRate"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "VatRate_companyId_id_key" ON "VatRate"("companyId", "id");

-- CreateIndex
CREATE INDEX "Item_companyId_active_deletedAt_idx" ON "Item"("companyId", "active", "deletedAt");

-- CreateIndex
CREATE INDEX "Item_companyId_type_idx" ON "Item"("companyId", "type");

-- CreateIndex
CREATE INDEX "Item_companyId_categoryId_idx" ON "Item"("companyId", "categoryId");

-- CreateIndex
CREATE INDEX "Item_companyId_name_idx" ON "Item"("companyId", "name");

-- CreateIndex
CREATE INDEX "Item_companyId_sku_idx" ON "Item"("companyId", "sku");

-- CreateIndex
CREATE INDEX "Item_companyId_barcode_idx" ON "Item"("companyId", "barcode");

-- CreateIndex
CREATE UNIQUE INDEX "Item_companyId_code_key" ON "Item"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Item_companyId_id_key" ON "Item"("companyId", "id");

-- CreateIndex
CREATE INDEX "ProductProfile_companyId_idx" ON "ProductProfile"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductProfile_companyId_itemId_key" ON "ProductProfile"("companyId", "itemId");

-- CreateIndex
CREATE INDEX "ServiceProfile_companyId_idx" ON "ServiceProfile"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceProfile_companyId_itemId_key" ON "ServiceProfile"("companyId", "itemId");

-- CreateIndex
CREATE INDEX "IngredientProfile_companyId_idx" ON "IngredientProfile"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "IngredientProfile_companyId_itemId_key" ON "IngredientProfile"("companyId", "itemId");

-- CreateIndex
CREATE INDEX "RecipeProfile_companyId_idx" ON "RecipeProfile"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeProfile_companyId_itemId_key" ON "RecipeProfile"("companyId", "itemId");

-- CreateIndex
CREATE INDEX "RecipeComponent_companyId_recipeItemId_deletedAt_idx" ON "RecipeComponent"("companyId", "recipeItemId", "deletedAt");

-- CreateIndex
CREATE INDEX "RecipeComponent_companyId_componentItemId_idx" ON "RecipeComponent"("companyId", "componentItemId");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeComponent_companyId_recipeItemId_componentItemId_key" ON "RecipeComponent"("companyId", "recipeItemId", "componentItemId");

-- CreateIndex
CREATE INDEX "BeautyServiceProfile_companyId_idx" ON "BeautyServiceProfile"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "BeautyServiceProfile_companyId_itemId_key" ON "BeautyServiceProfile"("companyId", "itemId");

-- CreateIndex
CREATE INDEX "HotelRoomProfile_companyId_idx" ON "HotelRoomProfile"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "HotelRoomProfile_companyId_itemId_key" ON "HotelRoomProfile"("companyId", "itemId");

-- CreateIndex
CREATE INDEX "PackageProfile_companyId_idx" ON "PackageProfile"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "PackageProfile_companyId_itemId_key" ON "PackageProfile"("companyId", "itemId");

-- CreateIndex
CREATE INDEX "PackageComponent_companyId_packageItemId_deletedAt_idx" ON "PackageComponent"("companyId", "packageItemId", "deletedAt");

-- CreateIndex
CREATE INDEX "PackageComponent_companyId_componentItemId_idx" ON "PackageComponent"("companyId", "componentItemId");

-- CreateIndex
CREATE UNIQUE INDEX "PackageComponent_companyId_packageItemId_componentItemId_key" ON "PackageComponent"("companyId", "packageItemId", "componentItemId");

-- CreateIndex
CREATE INDEX "GiftCardProfile_companyId_idx" ON "GiftCardProfile"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "GiftCardProfile_companyId_itemId_key" ON "GiftCardProfile"("companyId", "itemId");

-- AddForeignKey
ALTER TABLE "ItemCategory" ADD CONSTRAINT "ItemCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemCategory" ADD CONSTRAINT "ItemCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ItemCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitOfMeasure" ADD CONSTRAINT "UnitOfMeasure_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VatRate" ADD CONSTRAINT "VatRate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_companyId_categoryId_fkey" FOREIGN KEY ("companyId", "categoryId") REFERENCES "ItemCategory"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_companyId_unitOfMeasureId_fkey" FOREIGN KEY ("companyId", "unitOfMeasureId") REFERENCES "UnitOfMeasure"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_companyId_vatRateId_fkey" FOREIGN KEY ("companyId", "vatRateId") REFERENCES "VatRate"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductProfile" ADD CONSTRAINT "ProductProfile_companyId_itemId_fkey" FOREIGN KEY ("companyId", "itemId") REFERENCES "Item"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceProfile" ADD CONSTRAINT "ServiceProfile_companyId_itemId_fkey" FOREIGN KEY ("companyId", "itemId") REFERENCES "Item"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngredientProfile" ADD CONSTRAINT "IngredientProfile_companyId_itemId_fkey" FOREIGN KEY ("companyId", "itemId") REFERENCES "Item"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeProfile" ADD CONSTRAINT "RecipeProfile_companyId_itemId_fkey" FOREIGN KEY ("companyId", "itemId") REFERENCES "Item"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeComponent" ADD CONSTRAINT "RecipeComponent_companyId_recipeItemId_fkey" FOREIGN KEY ("companyId", "recipeItemId") REFERENCES "Item"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeComponent" ADD CONSTRAINT "RecipeComponent_companyId_componentItemId_fkey" FOREIGN KEY ("companyId", "componentItemId") REFERENCES "Item"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeComponent" ADD CONSTRAINT "RecipeComponent_companyId_unitOfMeasureId_fkey" FOREIGN KEY ("companyId", "unitOfMeasureId") REFERENCES "UnitOfMeasure"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeautyServiceProfile" ADD CONSTRAINT "BeautyServiceProfile_companyId_itemId_fkey" FOREIGN KEY ("companyId", "itemId") REFERENCES "Item"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelRoomProfile" ADD CONSTRAINT "HotelRoomProfile_companyId_itemId_fkey" FOREIGN KEY ("companyId", "itemId") REFERENCES "Item"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageProfile" ADD CONSTRAINT "PackageProfile_companyId_itemId_fkey" FOREIGN KEY ("companyId", "itemId") REFERENCES "Item"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageComponent" ADD CONSTRAINT "PackageComponent_companyId_packageItemId_fkey" FOREIGN KEY ("companyId", "packageItemId") REFERENCES "Item"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageComponent" ADD CONSTRAINT "PackageComponent_companyId_componentItemId_fkey" FOREIGN KEY ("companyId", "componentItemId") REFERENCES "Item"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageComponent" ADD CONSTRAINT "PackageComponent_companyId_unitOfMeasureId_fkey" FOREIGN KEY ("companyId", "unitOfMeasureId") REFERENCES "UnitOfMeasure"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftCardProfile" ADD CONSTRAINT "GiftCardProfile_companyId_itemId_fkey" FOREIGN KEY ("companyId", "itemId") REFERENCES "Item"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
