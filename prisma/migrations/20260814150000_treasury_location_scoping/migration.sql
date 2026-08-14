-- Expand: historical Treasury rows remain nullable until their location can be
-- derived from an existing location-scoped aggregate without guessing.
ALTER TABLE "FinancialAccount" ADD COLUMN "locationId" TEXT;
ALTER TABLE "PaymentSchedule" ADD COLUMN "locationId" TEXT;
ALTER TABLE "FinancialMovement" ADD COLUMN "locationId" TEXT;
ALTER TABLE "FinancialAllocation" ADD COLUMN "locationId" TEXT;
ALTER TABLE "FinancialTransfer" ADD COLUMN "locationId" TEXT;
ALTER TABLE "BankStatement" ADD COLUMN "locationId" TEXT;
ALTER TABLE "BankStatementLine" ADD COLUMN "locationId" TEXT;

-- Documents and Restaurant reservations are authoritative schedule sources.
UPDATE "PaymentSchedule" schedule
SET "locationId" = document."locationId"
FROM "BusinessDocument" document
WHERE schedule."locationId" IS NULL
  AND schedule."companyId" = document."companyId"
  AND schedule."documentId" = document."id"
  AND document."locationId" IS NOT NULL;

UPDATE "PaymentSchedule" schedule
SET "locationId" = reservation."locationId"
FROM "RestaurantReservation" reservation
WHERE schedule."locationId" IS NULL
  AND schedule."companyId" = reservation."companyId"
  AND schedule."id" = reservation."depositScheduleId";

-- A movement inherits only from an already mapped schedule or document.
UPDATE "FinancialMovement" movement
SET "locationId" = schedule."locationId"
FROM "PaymentSchedule" schedule
WHERE movement."locationId" IS NULL
  AND movement."companyId" = schedule."companyId"
  AND movement."paymentScheduleId" = schedule."id"
  AND schedule."locationId" IS NOT NULL;

UPDATE "FinancialMovement" movement
SET "locationId" = document."locationId"
FROM "BusinessDocument" document
WHERE movement."locationId" IS NULL
  AND movement."companyId" = document."companyId"
  AND movement."documentId" = document."id"
  AND document."locationId" IS NOT NULL;

UPDATE "FinancialMovement" reversal
SET "locationId" = original."locationId"
FROM "FinancialMovement" original
WHERE reversal."locationId" IS NULL
  AND reversal."companyId" = original."companyId"
  AND reversal."reversalOfId" = original."id"
  AND original."locationId" IS NOT NULL;

-- Allocations are mapped only when both sides agree on the same known location.
UPDATE "FinancialAllocation" allocation
SET "locationId" = movement."locationId"
FROM "FinancialMovement" movement, "PaymentSchedule" schedule
WHERE allocation."locationId" IS NULL
  AND allocation."companyId" = movement."companyId"
  AND allocation."movementId" = movement."id"
  AND allocation."companyId" = schedule."companyId"
  AND allocation."scheduleId" = schedule."id"
  AND movement."locationId" IS NOT NULL
  AND movement."locationId" = schedule."locationId";

-- Accounts are mapped only when every existing movement is mapped to one site.
WITH unambiguous_accounts AS (
  SELECT "companyId", "financialAccountId", min("locationId") AS "locationId"
  FROM "FinancialMovement"
  GROUP BY "companyId", "financialAccountId"
  HAVING count(*) FILTER (WHERE "locationId" IS NULL) = 0
     AND count(DISTINCT "locationId") = 1
)
UPDATE "FinancialAccount" account
SET "locationId" = mapped."locationId"
FROM unambiguous_accounts mapped
WHERE account."companyId" = mapped."companyId"
  AND account."id" = mapped."financialAccountId";

UPDATE "FinancialTransfer" transfer
SET "locationId" = source."locationId"
FROM "FinancialAccount" source, "FinancialAccount" destination
WHERE transfer."locationId" IS NULL
  AND transfer."companyId" = source."companyId"
  AND transfer."sourceAccountId" = source."id"
  AND transfer."companyId" = destination."companyId"
  AND transfer."destinationAccountId" = destination."id"
  AND source."locationId" IS NOT NULL
  AND source."locationId" = destination."locationId";

UPDATE "BankStatement" statement
SET "locationId" = account."locationId"
FROM "FinancialAccount" account
WHERE statement."locationId" IS NULL
  AND statement."companyId" = account."companyId"
  AND statement."financialAccountId" = account."id"
  AND account."locationId" IS NOT NULL;

UPDATE "BankStatementLine" line
SET "locationId" = statement."locationId"
FROM "BankStatement" statement
WHERE line."locationId" IS NULL
  AND line."companyId" = statement."companyId"
  AND line."bankStatementId" = statement."id"
  AND statement."locationId" IS NOT NULL;

CREATE INDEX "FinancialAccount_companyId_locationId_active_deletedAt_idx" ON "FinancialAccount"("companyId", "locationId", "active", "deletedAt");
CREATE INDEX "PaymentSchedule_companyId_locationId_direction_status_dueDate_idx" ON "PaymentSchedule"("companyId", "locationId", "direction", "status", "dueDate");
CREATE INDEX "FinancialMovement_companyId_locationId_occurredAt_idx" ON "FinancialMovement"("companyId", "locationId", "occurredAt");
CREATE INDEX "FinancialAllocation_companyId_locationId_reversedAt_idx" ON "FinancialAllocation"("companyId", "locationId", "reversedAt");
CREATE INDEX "FinancialTransfer_companyId_locationId_status_transferDate_idx" ON "FinancialTransfer"("companyId", "locationId", "status", "transferDate");
CREATE INDEX "BankStatement_companyId_locationId_status_statementDate_idx" ON "BankStatement"("companyId", "locationId", "status", "statementDate");
CREATE INDEX "BankStatementLine_companyId_locationId_bankStatementId_reconciliationStatus_idx" ON "BankStatementLine"("companyId", "locationId", "bankStatementId", "reconciliationStatus");

ALTER TABLE "FinancialAccount" ADD CONSTRAINT "FinancialAccount_companyId_locationId_fkey" FOREIGN KEY ("companyId", "locationId") REFERENCES "Location"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentSchedule" ADD CONSTRAINT "PaymentSchedule_companyId_locationId_fkey" FOREIGN KEY ("companyId", "locationId") REFERENCES "Location"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancialMovement" ADD CONSTRAINT "FinancialMovement_companyId_locationId_fkey" FOREIGN KEY ("companyId", "locationId") REFERENCES "Location"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancialAllocation" ADD CONSTRAINT "FinancialAllocation_companyId_locationId_fkey" FOREIGN KEY ("companyId", "locationId") REFERENCES "Location"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancialTransfer" ADD CONSTRAINT "FinancialTransfer_companyId_locationId_fkey" FOREIGN KEY ("companyId", "locationId") REFERENCES "Location"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankStatement" ADD CONSTRAINT "BankStatement_companyId_locationId_fkey" FOREIGN KEY ("companyId", "locationId") REFERENCES "Location"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_companyId_locationId_fkey" FOREIGN KEY ("companyId", "locationId") REFERENCES "Location"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- NOT VALID preserves unresolved history but enforces location on new/updated rows.
ALTER TABLE "FinancialAccount" ADD CONSTRAINT "FinancialAccount_locationId_required" CHECK ("locationId" IS NOT NULL) NOT VALID;
ALTER TABLE "PaymentSchedule" ADD CONSTRAINT "PaymentSchedule_locationId_required" CHECK ("locationId" IS NOT NULL) NOT VALID;
ALTER TABLE "FinancialMovement" ADD CONSTRAINT "FinancialMovement_locationId_required" CHECK ("locationId" IS NOT NULL) NOT VALID;
ALTER TABLE "FinancialAllocation" ADD CONSTRAINT "FinancialAllocation_locationId_required" CHECK ("locationId" IS NOT NULL) NOT VALID;
ALTER TABLE "FinancialTransfer" ADD CONSTRAINT "FinancialTransfer_locationId_required" CHECK ("locationId" IS NOT NULL) NOT VALID;
ALTER TABLE "BankStatement" ADD CONSTRAINT "BankStatement_locationId_required" CHECK ("locationId" IS NOT NULL) NOT VALID;
ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_locationId_required" CHECK ("locationId" IS NOT NULL) NOT VALID;
