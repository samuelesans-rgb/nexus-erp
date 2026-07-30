-- CreateEnum
CREATE TYPE "PartnerStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- Replace legacy indexes with tenant-oriented indexes.
DROP INDEX "Partner_companyId_idx";
DROP INDEX "Partner_name_idx";

-- Add nullable code first so existing Partner rows can be preserved and backfilled.
ALTER TABLE "Partner" ADD COLUMN "agentId" TEXT,
ADD COLUMN "category" TEXT,
ADD COLUMN "code" TEXT,
ADD COLUMN "createdById" TEXT,
ADD COLUMN "creditLimit" DECIMAL(15,2),
ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "discountPercent" DECIMAL(5,2),
ADD COLUMN "firstName" TEXT,
ADD COLUMN "internalNotes" TEXT,
ADD COLUMN "isAgent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "isCarrier" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "isCollaborator" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "isLead" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "isProfessional" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "isProspect" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "lastName" TEXT,
ADD COLUMN "legalName" TEXT,
ADD COLUMN "paymentMethod" TEXT,
ADD COLUMN "paymentTerms" TEXT,
ADD COLUMN "priceListCode" TEXT,
ADD COLUMN "recipientCode" TEXT,
ADD COLUMN "reverseCharge" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "splitPayment" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "status" "PartnerStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "updatedById" TEXT;

UPDATE "Partner"
SET "code" = 'P-' || UPPER(LEFT(MD5("id"), 12))
WHERE "code" IS NULL;

ALTER TABLE "Partner" ALTER COLUMN "code" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Partner_companyId_active_deletedAt_idx" ON "Partner"("companyId", "active", "deletedAt");
CREATE INDEX "Partner_companyId_type_idx" ON "Partner"("companyId", "type");
CREATE INDEX "Partner_companyId_category_idx" ON "Partner"("companyId", "category");
CREATE INDEX "Partner_companyId_name_idx" ON "Partner"("companyId", "name");
CREATE INDEX "Partner_companyId_vatNumber_idx" ON "Partner"("companyId", "vatNumber");
CREATE INDEX "Partner_companyId_taxCode_idx" ON "Partner"("companyId", "taxCode");
CREATE INDEX "Partner_agentId_idx" ON "Partner"("agentId");
CREATE UNIQUE INDEX "Partner_companyId_code_key" ON "Partner"("companyId", "code");

-- AddForeignKey
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
