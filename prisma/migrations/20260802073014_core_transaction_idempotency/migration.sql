-- CreateEnum
CREATE TYPE "IdempotencyStatus" AS ENUM ('PROCESSING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "commandType" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "IdempotencyStatus" NOT NULL DEFAULT 'PROCESSING',
    "aggregateType" TEXT,
    "aggregateId" TEXT,
    "result" JSONB,
    "error" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IdempotencyRecord_companyId_status_startedAt_idx" ON "IdempotencyRecord"("companyId", "status", "startedAt");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_companyId_aggregateType_aggregateId_idx" ON "IdempotencyRecord"("companyId", "aggregateType", "aggregateId");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_companyId_commandType_idempotencyKey_key" ON "IdempotencyRecord"("companyId", "commandType", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
