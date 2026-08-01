-- DropForeignKey
ALTER TABLE "ItemCategory" DROP CONSTRAINT "ItemCategory_parentId_fkey";

-- DropIndex
DROP INDEX "ItemCategory_parentId_idx";

-- DropIndex
DROP INDEX "UnitOfMeasure_companyId_active_idx";

-- DropIndex
DROP INDEX "VatRate_companyId_active_idx";

-- AlterTable
ALTER TABLE "ItemCategory" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "updatedById" TEXT;

-- AlterTable
ALTER TABLE "Partner" ADD COLUMN     "paymentMethodId" TEXT,
ADD COLUMN     "paymentTermId" TEXT,
ADD COLUMN     "priceListId" TEXT;

-- AlterTable
ALTER TABLE "UnitOfMeasure" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "description" TEXT,
ADD COLUMN     "updatedById" TEXT;

-- AlterTable
ALTER TABLE "VatRate" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "description" TEXT,
ADD COLUMN     "updatedById" TEXT;

-- CreateTable
CREATE TABLE "PriceList" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceListItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "priceListId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "price" DECIMAL(15,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceListItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentMethod" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentTerm" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "dueDays" INTEGER,
    "endOfMonth" BOOLEAN NOT NULL DEFAULT false,
    "installments" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentTerm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PriceList_companyId_active_deletedAt_idx" ON "PriceList"("companyId", "active", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PriceList_companyId_code_key" ON "PriceList"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "PriceList_companyId_id_key" ON "PriceList"("companyId", "id");

-- CreateIndex
CREATE INDEX "PriceListItem_companyId_itemId_deletedAt_idx" ON "PriceListItem"("companyId", "itemId", "deletedAt");

-- CreateIndex
CREATE INDEX "PriceListItem_companyId_priceListId_deletedAt_idx" ON "PriceListItem"("companyId", "priceListId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PriceListItem_companyId_priceListId_itemId_key" ON "PriceListItem"("companyId", "priceListId", "itemId");

-- CreateIndex
CREATE INDEX "PaymentMethod_companyId_active_deletedAt_idx" ON "PaymentMethod"("companyId", "active", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMethod_companyId_code_key" ON "PaymentMethod"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMethod_companyId_id_key" ON "PaymentMethod"("companyId", "id");

-- CreateIndex
CREATE INDEX "PaymentTerm_companyId_active_deletedAt_idx" ON "PaymentTerm"("companyId", "active", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTerm_companyId_code_key" ON "PaymentTerm"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTerm_companyId_id_key" ON "PaymentTerm"("companyId", "id");

-- Preserve legacy Partner commercial values as tenant-scoped configurations.
INSERT INTO "PaymentMethod" ("id", "companyId", "code", "name", "createdAt", "updatedAt")
SELECT md5("companyId" || ':method:' || "paymentMethod"), "companyId",
       'LEGACY-' || upper(substr(md5("paymentMethod"), 1, 12)), "paymentMethod",
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Partner"
WHERE "paymentMethod" IS NOT NULL
GROUP BY "companyId", "paymentMethod";

INSERT INTO "PaymentTerm" ("id", "companyId", "code", "name", "createdAt", "updatedAt")
SELECT md5("companyId" || ':term:' || "paymentTerms"), "companyId",
       'LEGACY-' || upper(substr(md5("paymentTerms"), 1, 12)), "paymentTerms",
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Partner"
WHERE "paymentTerms" IS NOT NULL
GROUP BY "companyId", "paymentTerms";

INSERT INTO "PriceList" ("id", "companyId", "code", "name", "createdAt", "updatedAt")
SELECT md5("companyId" || ':price-list:' || "priceListCode"), "companyId",
       "priceListCode", "priceListCode", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Partner"
WHERE "priceListCode" IS NOT NULL
GROUP BY "companyId", "priceListCode";

UPDATE "Partner" SET "paymentMethodId" = md5("companyId" || ':method:' || "paymentMethod")
WHERE "paymentMethod" IS NOT NULL;
UPDATE "Partner" SET "paymentTermId" = md5("companyId" || ':term:' || "paymentTerms")
WHERE "paymentTerms" IS NOT NULL;
UPDATE "Partner" SET "priceListId" = md5("companyId" || ':price-list:' || "priceListCode")
WHERE "priceListCode" IS NOT NULL;

ALTER TABLE "Partner" DROP COLUMN "paymentMethod",
DROP COLUMN "paymentTerms",
DROP COLUMN "priceListCode";

-- CreateIndex
CREATE INDEX "ItemCategory_companyId_parentId_idx" ON "ItemCategory"("companyId", "parentId");

-- CreateIndex
CREATE INDEX "Partner_companyId_priceListId_idx" ON "Partner"("companyId", "priceListId");

-- CreateIndex
CREATE INDEX "Partner_companyId_paymentMethodId_idx" ON "Partner"("companyId", "paymentMethodId");

-- CreateIndex
CREATE INDEX "Partner_companyId_paymentTermId_idx" ON "Partner"("companyId", "paymentTermId");

-- CreateIndex
CREATE INDEX "UnitOfMeasure_companyId_active_deletedAt_idx" ON "UnitOfMeasure"("companyId", "active", "deletedAt");

-- CreateIndex
CREATE INDEX "VatRate_companyId_active_deletedAt_idx" ON "VatRate"("companyId", "active", "deletedAt");

-- AddForeignKey
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_companyId_priceListId_fkey" FOREIGN KEY ("companyId", "priceListId") REFERENCES "PriceList"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_companyId_paymentMethodId_fkey" FOREIGN KEY ("companyId", "paymentMethodId") REFERENCES "PaymentMethod"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_companyId_paymentTermId_fkey" FOREIGN KEY ("companyId", "paymentTermId") REFERENCES "PaymentTerm"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemCategory" ADD CONSTRAINT "ItemCategory_companyId_parentId_fkey" FOREIGN KEY ("companyId", "parentId") REFERENCES "ItemCategory"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemCategory" ADD CONSTRAINT "ItemCategory_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemCategory" ADD CONSTRAINT "ItemCategory_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitOfMeasure" ADD CONSTRAINT "UnitOfMeasure_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitOfMeasure" ADD CONSTRAINT "UnitOfMeasure_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VatRate" ADD CONSTRAINT "VatRate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VatRate" ADD CONSTRAINT "VatRate_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceList" ADD CONSTRAINT "PriceList_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceList" ADD CONSTRAINT "PriceList_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceList" ADD CONSTRAINT "PriceList_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceListItem" ADD CONSTRAINT "PriceListItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceListItem" ADD CONSTRAINT "PriceListItem_companyId_priceListId_fkey" FOREIGN KEY ("companyId", "priceListId") REFERENCES "PriceList"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceListItem" ADD CONSTRAINT "PriceListItem_companyId_itemId_fkey" FOREIGN KEY ("companyId", "itemId") REFERENCES "Item"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceListItem" ADD CONSTRAINT "PriceListItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceListItem" ADD CONSTRAINT "PriceListItem_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentMethod" ADD CONSTRAINT "PaymentMethod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentMethod" ADD CONSTRAINT "PaymentMethod_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentMethod" ADD CONSTRAINT "PaymentMethod_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTerm" ADD CONSTRAINT "PaymentTerm_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTerm" ADD CONSTRAINT "PaymentTerm_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTerm" ADD CONSTRAINT "PaymentTerm_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
