-- CreateEnum
CREATE TYPE "ModuleCategory" AS ENUM ('CORE', 'SHARED', 'RESTAURANT', 'BEAUTY', 'HOTEL');

-- CreateEnum
CREATE TYPE "ModuleStatus" AS ENUM ('AVAILABLE', 'PLANNED', 'FUTURE');

-- CreateTable
CREATE TABLE "ModuleDefinition" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "ModuleCategory" NOT NULL,
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "status" "ModuleStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModuleDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyModule" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "moduleDefinitionId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "enabledAt" TIMESTAMP(3),
    "disabledAt" TIMESTAMP(3),
    "configuration" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyModule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ModuleDefinition_code_key" ON "ModuleDefinition"("code");

-- CreateIndex
CREATE INDEX "CompanyModule_companyId_enabled_idx" ON "CompanyModule"("companyId", "enabled");

-- CreateIndex
CREATE INDEX "CompanyModule_moduleDefinitionId_idx" ON "CompanyModule"("moduleDefinitionId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyModule_companyId_moduleDefinitionId_key" ON "CompanyModule"("companyId", "moduleDefinitionId");

-- AddForeignKey
ALTER TABLE "CompanyModule" ADD CONSTRAINT "CompanyModule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyModule" ADD CONSTRAINT "CompanyModule_moduleDefinitionId_fkey" FOREIGN KEY ("moduleDefinitionId") REFERENCES "ModuleDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
