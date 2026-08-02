-- CreateEnum
CREATE TYPE "FinancialAccountType" AS ENUM ('BANK', 'CASH', 'CARD', 'PAYPAL', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentScheduleDirection" AS ENUM ('RECEIVABLE', 'PAYABLE');

-- CreateEnum
CREATE TYPE "PaymentScheduleStatus" AS ENUM ('OPEN', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "FinancialMovementType" AS ENUM ('CUSTOMER_RECEIPT', 'SUPPLIER_PAYMENT', 'TRANSFER_OUT', 'TRANSFER_IN', 'FEE', 'INTEREST', 'REFUND_IN', 'REFUND_OUT', 'OPENING', 'ADJUSTMENT', 'REVERSAL');

-- CreateEnum
CREATE TYPE "FinancialMovementDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "FinancialTransferStatus" AS ENUM ('DRAFT', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BankStatementStatus" AS ENUM ('IMPORTED', 'PARTIALLY_RECONCILED', 'RECONCILED');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('UNMATCHED', 'MATCHED');

-- CreateTable
CREATE TABLE "FinancialAccount" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "FinancialAccountType" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "iban" TEXT,
    "bic" TEXT,
    "bankName" TEXT,
    "openingBalance" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "allowOverdraft" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentSchedule" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "documentId" TEXT,
    "installmentNumber" INTEGER NOT NULL DEFAULT 1,
    "documentType" "DocumentType",
    "direction" "PaymentScheduleDirection" NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "residualAmount" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "status" "PaymentScheduleStatus" NOT NULL DEFAULT 'OPEN',
    "paymentMethodId" TEXT,
    "paymentTermId" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialMovement" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "financialAccountId" TEXT NOT NULL,
    "partnerId" TEXT,
    "paymentScheduleId" TEXT,
    "documentId" TEXT,
    "movementType" "FinancialMovementType" NOT NULL,
    "direction" "FinancialMovementDirection" NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "exchangeRate" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "valueDate" TIMESTAMP(3),
    "reference" TEXT,
    "notes" TEXT,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postedById" TEXT NOT NULL,
    "reversalOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialAllocation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "movementId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialTransfer" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sourceAccountId" TEXT NOT NULL,
    "destinationAccountId" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "transferDate" TIMESTAMP(3) NOT NULL,
    "status" "FinancialTransferStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "completedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "FinancialTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankStatement" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "financialAccountId" TEXT NOT NULL,
    "statementDate" TIMESTAMP(3) NOT NULL,
    "openingBalance" DECIMAL(15,2) NOT NULL,
    "closingBalance" DECIMAL(15,2) NOT NULL,
    "status" "BankStatementStatus" NOT NULL DEFAULT 'IMPORTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankStatementLine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "bankStatementId" TEXT NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "valueDate" TIMESTAMP(3),
    "amount" DECIMAL(15,2) NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "matchedMovementId" TEXT,
    "reconciliationStatus" "ReconciliationStatus" NOT NULL DEFAULT 'UNMATCHED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankStatementLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinancialAccount_companyId_active_deletedAt_idx" ON "FinancialAccount"("companyId", "active", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialAccount_companyId_code_key" ON "FinancialAccount"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialAccount_companyId_id_key" ON "FinancialAccount"("companyId", "id");

-- CreateIndex
CREATE INDEX "PaymentSchedule_companyId_direction_status_dueDate_idx" ON "PaymentSchedule"("companyId", "direction", "status", "dueDate");

-- CreateIndex
CREATE INDEX "PaymentSchedule_companyId_partnerId_dueDate_idx" ON "PaymentSchedule"("companyId", "partnerId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentSchedule_companyId_documentId_installmentNumber_key" ON "PaymentSchedule"("companyId", "documentId", "installmentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentSchedule_companyId_id_key" ON "PaymentSchedule"("companyId", "id");

-- CreateIndex
CREATE INDEX "FinancialMovement_companyId_financialAccountId_occurredAt_idx" ON "FinancialMovement"("companyId", "financialAccountId", "occurredAt");

-- CreateIndex
CREATE INDEX "FinancialMovement_companyId_partnerId_occurredAt_idx" ON "FinancialMovement"("companyId", "partnerId", "occurredAt");

-- CreateIndex
CREATE INDEX "FinancialMovement_companyId_paymentScheduleId_idx" ON "FinancialMovement"("companyId", "paymentScheduleId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialMovement_companyId_id_key" ON "FinancialMovement"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialMovement_reversalOfId_key" ON "FinancialMovement"("reversalOfId");

-- CreateIndex
CREATE INDEX "FinancialAllocation_companyId_scheduleId_reversedAt_idx" ON "FinancialAllocation"("companyId", "scheduleId", "reversedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialAllocation_companyId_movementId_scheduleId_key" ON "FinancialAllocation"("companyId", "movementId", "scheduleId");

-- CreateIndex
CREATE INDEX "FinancialTransfer_companyId_status_transferDate_idx" ON "FinancialTransfer"("companyId", "status", "transferDate");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialTransfer_companyId_id_key" ON "FinancialTransfer"("companyId", "id");

-- CreateIndex
CREATE INDEX "BankStatement_companyId_status_statementDate_idx" ON "BankStatement"("companyId", "status", "statementDate");

-- CreateIndex
CREATE UNIQUE INDEX "BankStatement_companyId_financialAccountId_statementDate_key" ON "BankStatement"("companyId", "financialAccountId", "statementDate");

-- CreateIndex
CREATE UNIQUE INDEX "BankStatement_companyId_id_key" ON "BankStatement"("companyId", "id");

-- CreateIndex
CREATE INDEX "BankStatementLine_companyId_bankStatementId_reconciliationS_idx" ON "BankStatementLine"("companyId", "bankStatementId", "reconciliationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "BankStatementLine_companyId_id_key" ON "BankStatementLine"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "BankStatementLine_companyId_matchedMovementId_key" ON "BankStatementLine"("companyId", "matchedMovementId");

-- AddForeignKey
ALTER TABLE "FinancialAccount" ADD CONSTRAINT "FinancialAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialAccount" ADD CONSTRAINT "FinancialAccount_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialAccount" ADD CONSTRAINT "FinancialAccount_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSchedule" ADD CONSTRAINT "PaymentSchedule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSchedule" ADD CONSTRAINT "PaymentSchedule_companyId_partnerId_fkey" FOREIGN KEY ("companyId", "partnerId") REFERENCES "Partner"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSchedule" ADD CONSTRAINT "PaymentSchedule_companyId_documentId_fkey" FOREIGN KEY ("companyId", "documentId") REFERENCES "BusinessDocument"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSchedule" ADD CONSTRAINT "PaymentSchedule_companyId_paymentMethodId_fkey" FOREIGN KEY ("companyId", "paymentMethodId") REFERENCES "PaymentMethod"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSchedule" ADD CONSTRAINT "PaymentSchedule_companyId_paymentTermId_fkey" FOREIGN KEY ("companyId", "paymentTermId") REFERENCES "PaymentTerm"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSchedule" ADD CONSTRAINT "PaymentSchedule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSchedule" ADD CONSTRAINT "PaymentSchedule_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialMovement" ADD CONSTRAINT "FinancialMovement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialMovement" ADD CONSTRAINT "FinancialMovement_companyId_financialAccountId_fkey" FOREIGN KEY ("companyId", "financialAccountId") REFERENCES "FinancialAccount"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialMovement" ADD CONSTRAINT "FinancialMovement_companyId_partnerId_fkey" FOREIGN KEY ("companyId", "partnerId") REFERENCES "Partner"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialMovement" ADD CONSTRAINT "FinancialMovement_companyId_paymentScheduleId_fkey" FOREIGN KEY ("companyId", "paymentScheduleId") REFERENCES "PaymentSchedule"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialMovement" ADD CONSTRAINT "FinancialMovement_companyId_documentId_fkey" FOREIGN KEY ("companyId", "documentId") REFERENCES "BusinessDocument"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialMovement" ADD CONSTRAINT "FinancialMovement_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialMovement" ADD CONSTRAINT "FinancialMovement_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "FinancialMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialAllocation" ADD CONSTRAINT "FinancialAllocation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialAllocation" ADD CONSTRAINT "FinancialAllocation_companyId_movementId_fkey" FOREIGN KEY ("companyId", "movementId") REFERENCES "FinancialMovement"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialAllocation" ADD CONSTRAINT "FinancialAllocation_companyId_scheduleId_fkey" FOREIGN KEY ("companyId", "scheduleId") REFERENCES "PaymentSchedule"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransfer" ADD CONSTRAINT "FinancialTransfer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransfer" ADD CONSTRAINT "FinancialTransfer_companyId_sourceAccountId_fkey" FOREIGN KEY ("companyId", "sourceAccountId") REFERENCES "FinancialAccount"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransfer" ADD CONSTRAINT "FinancialTransfer_companyId_destinationAccountId_fkey" FOREIGN KEY ("companyId", "destinationAccountId") REFERENCES "FinancialAccount"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransfer" ADD CONSTRAINT "FinancialTransfer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransfer" ADD CONSTRAINT "FinancialTransfer_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatement" ADD CONSTRAINT "BankStatement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatement" ADD CONSTRAINT "BankStatement_companyId_financialAccountId_fkey" FOREIGN KEY ("companyId", "financialAccountId") REFERENCES "FinancialAccount"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_companyId_bankStatementId_fkey" FOREIGN KEY ("companyId", "bankStatementId") REFERENCES "BankStatement"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_companyId_matchedMovementId_fkey" FOREIGN KEY ("companyId", "matchedMovementId") REFERENCES "FinancialMovement"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
