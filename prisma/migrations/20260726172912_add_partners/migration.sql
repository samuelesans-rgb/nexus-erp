-- CreateEnum
CREATE TYPE "PartnerType" AS ENUM ('COMPANY', 'PERSON');

-- CreateTable
CREATE TABLE "Partner" (
    "id" TEXT NOT NULL,
    "type" "PartnerType" NOT NULL DEFAULT 'COMPANY',
    "name" TEXT NOT NULL,
    "displayName" TEXT,
    "vatNumber" TEXT,
    "taxCode" TEXT,
    "email" TEXT,
    "pec" TEXT,
    "phone" TEXT,
    "mobile" TEXT,
    "website" TEXT,
    "address" TEXT,
    "zipCode" TEXT,
    "city" TEXT,
    "province" TEXT,
    "country" TEXT,
    "isCustomer" BOOLEAN NOT NULL DEFAULT false,
    "isSupplier" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Partner_companyId_idx" ON "Partner"("companyId");

-- CreateIndex
CREATE INDEX "Partner_name_idx" ON "Partner"("name");

-- AddForeignKey
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
