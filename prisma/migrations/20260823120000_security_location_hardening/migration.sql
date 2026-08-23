-- Security and multi-location hardening.
-- Legacy remediation is deliberately limited to authoritative parent links or
-- companies having exactly one active location. The migration aborts otherwise.

CREATE TABLE "MembershipLocation" (
  "companyId" TEXT NOT NULL,
  "membershipId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MembershipLocation_pkey" PRIMARY KEY ("companyId", "membershipId", "locationId")
);
CREATE INDEX "MembershipLocation_companyId_locationId_idx" ON "MembershipLocation"("companyId", "locationId");
ALTER TABLE "MembershipLocation" ADD CONSTRAINT "MembershipLocation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MembershipLocation" ADD CONSTRAINT "MembershipLocation_companyId_membershipId_fkey" FOREIGN KEY ("companyId", "membershipId") REFERENCES "Membership"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MembershipLocation" ADD CONSTRAINT "MembershipLocation_companyId_locationId_fkey" FOREIGN KEY ("companyId", "locationId") REFERENCES "Location"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve the legacy company-wide visibility as explicit ACL rows. Include an
-- inactive default location too, so the default-location invariant is immediate.
INSERT INTO "MembershipLocation" ("companyId", "membershipId", "locationId")
SELECT m."companyId", m.id, l.id FROM "Membership" m JOIN "Location" l ON l."companyId"=m."companyId" WHERE l.active=true AND l."deletedAt" IS NULL
ON CONFLICT DO NOTHING;
INSERT INTO "MembershipLocation" ("companyId", "membershipId", "locationId")
SELECT m."companyId", m.id, m."defaultLocationId" FROM "Membership" m WHERE m."defaultLocationId" IS NOT NULL
ON CONFLICT DO NOTHING;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_defaultLocation_authorized_fkey" FOREIGN KEY ("companyId", "id", "defaultLocationId") REFERENCES "MembershipLocation"("companyId", "membershipId", "locationId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "companyId" TEXT,
  "membershipId" TEXT,
  "userId" TEXT,
  "locationId" TEXT,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "metadata" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AuditLog_companyId_occurredAt_idx" ON "AuditLog"("companyId", "occurredAt");
CREATE INDEX "AuditLog_companyId_entityType_entityId_occurredAt_idx" ON "AuditLog"("companyId", "entityType", "entityId", "occurredAt");
CREATE INDEX "AuditLog_userId_occurredAt_idx" ON "AuditLog"("userId", "occurredAt");
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_companyId_membershipId_fkey" FOREIGN KEY ("companyId", "membershipId") REFERENCES "Membership"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_companyId_locationId_fkey" FOREIGN KEY ("companyId", "locationId") REFERENCES "Location"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Resolve Treasury children from authoritative parents first.
UPDATE "FinancialMovement" m SET "locationId"=d."locationId" FROM "BusinessDocument" d WHERE m."locationId" IS NULL AND m."documentId"=d.id AND m."companyId"=d."companyId" AND d."locationId" IS NOT NULL;
UPDATE "FinancialAllocation" a SET "locationId"=m."locationId" FROM "FinancialMovement" m WHERE a."locationId" IS NULL AND a."movementId"=m.id AND a."companyId"=m."companyId" AND m."locationId" IS NOT NULL;
UPDATE "FinancialTransfer" t SET "locationId"=a."locationId" FROM "FinancialAccount" a WHERE t."locationId" IS NULL AND t."sourceAccountId"=a.id AND t."companyId"=a."companyId" AND a."locationId" IS NOT NULL;
UPDATE "BankStatementLine" l SET "locationId"=s."locationId" FROM "BankStatement" s WHERE l."locationId" IS NULL AND l."bankStatementId"=s.id AND l."companyId"=s."companyId" AND s."locationId" IS NOT NULL;

-- The only safe generic fallback: exactly one active location in the company.
WITH only_location AS (SELECT "companyId", min(id) id FROM "Location" WHERE active=true AND "deletedAt" IS NULL GROUP BY "companyId" HAVING count(*)=1)
UPDATE "FinancialAccount" x SET "locationId"=o.id FROM only_location o WHERE x."locationId" IS NULL AND x."companyId"=o."companyId";
WITH only_location AS (SELECT "companyId", min(id) id FROM "Location" WHERE active=true AND "deletedAt" IS NULL GROUP BY "companyId" HAVING count(*)=1)
UPDATE "PaymentSchedule" x SET "locationId"=o.id FROM only_location o WHERE x."locationId" IS NULL AND x."companyId"=o."companyId";
WITH only_location AS (SELECT "companyId", min(id) id FROM "Location" WHERE active=true AND "deletedAt" IS NULL GROUP BY "companyId" HAVING count(*)=1)
UPDATE "FinancialMovement" x SET "locationId"=o.id FROM only_location o WHERE x."locationId" IS NULL AND x."companyId"=o."companyId";
WITH only_location AS (SELECT "companyId", min(id) id FROM "Location" WHERE active=true AND "deletedAt" IS NULL GROUP BY "companyId" HAVING count(*)=1)
UPDATE "FinancialAllocation" x SET "locationId"=o.id FROM only_location o WHERE x."locationId" IS NULL AND x."companyId"=o."companyId";
WITH only_location AS (SELECT "companyId", min(id) id FROM "Location" WHERE active=true AND "deletedAt" IS NULL GROUP BY "companyId" HAVING count(*)=1)
UPDATE "FinancialTransfer" x SET "locationId"=o.id FROM only_location o WHERE x."locationId" IS NULL AND x."companyId"=o."companyId";
WITH only_location AS (SELECT "companyId", min(id) id FROM "Location" WHERE active=true AND "deletedAt" IS NULL GROUP BY "companyId" HAVING count(*)=1)
UPDATE "BankStatement" x SET "locationId"=o.id FROM only_location o WHERE x."locationId" IS NULL AND x."companyId"=o."companyId";
UPDATE "BankStatementLine" l SET "locationId"=s."locationId" FROM "BankStatement" s WHERE l."locationId" IS NULL AND l."bankStatementId"=s.id AND l."companyId"=s."companyId" AND s."locationId" IS NOT NULL;
WITH only_location AS (SELECT "companyId", min(id) id FROM "Location" WHERE active=true AND "deletedAt" IS NULL GROUP BY "companyId" HAVING count(*)=1)
UPDATE "BusinessDocument" x SET "locationId"=o.id FROM only_location o WHERE x."locationId" IS NULL AND x."companyId"=o."companyId";
WITH only_location AS (SELECT "companyId", min(id) id FROM "Location" WHERE active=true AND "deletedAt" IS NULL GROUP BY "companyId" HAVING count(*)=1)
UPDATE "DocumentSeries" x SET "locationId"=o.id FROM only_location o WHERE x."locationId" IS NULL AND x."companyId"=o."companyId";
WITH only_location AS (SELECT "companyId", min(id) id FROM "Location" WHERE active=true AND "deletedAt" IS NULL GROUP BY "companyId" HAVING count(*)=1)
UPDATE "RestaurantMenu" x SET "locationId"=o.id FROM only_location o WHERE x."locationId" IS NULL AND x."companyId"=o."companyId";

DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM "BusinessDocument" WHERE "locationId" IS NULL) OR EXISTS (SELECT 1 FROM "DocumentSeries" WHERE "locationId" IS NULL) OR EXISTS (SELECT 1 FROM "RestaurantMenu" WHERE "locationId" IS NULL) OR EXISTS (SELECT 1 FROM "FinancialAccount" WHERE "locationId" IS NULL) OR EXISTS (SELECT 1 FROM "PaymentSchedule" WHERE "locationId" IS NULL) OR EXISTS (SELECT 1 FROM "FinancialMovement" WHERE "locationId" IS NULL) OR EXISTS (SELECT 1 FROM "FinancialAllocation" WHERE "locationId" IS NULL) OR EXISTS (SELECT 1 FROM "FinancialTransfer" WHERE "locationId" IS NULL) OR EXISTS (SELECT 1 FROM "BankStatement" WHERE "locationId" IS NULL) OR EXISTS (SELECT 1 FROM "BankStatementLine" WHERE "locationId" IS NULL) THEN
  RAISE EXCEPTION 'Non-deterministic location legacy records remain';
 END IF;
END $$;

ALTER TABLE "BusinessDocument" VALIDATE CONSTRAINT "BusinessDocument_locationId_required";
ALTER TABLE "FinancialAccount" VALIDATE CONSTRAINT "FinancialAccount_locationId_required";
ALTER TABLE "PaymentSchedule" VALIDATE CONSTRAINT "PaymentSchedule_locationId_required";
ALTER TABLE "FinancialMovement" VALIDATE CONSTRAINT "FinancialMovement_locationId_required";
ALTER TABLE "FinancialAllocation" VALIDATE CONSTRAINT "FinancialAllocation_locationId_required";
ALTER TABLE "FinancialTransfer" VALIDATE CONSTRAINT "FinancialTransfer_locationId_required";
ALTER TABLE "BankStatement" VALIDATE CONSTRAINT "BankStatement_locationId_required";
ALTER TABLE "BankStatementLine" VALIDATE CONSTRAINT "BankStatementLine_locationId_required";
ALTER TABLE "RestaurantTable" VALIDATE CONSTRAINT "RestaurantTable_location_area_fkey";
ALTER TABLE "RestaurantOrder" VALIDATE CONSTRAINT "RestaurantOrder_location_table_fkey";
ALTER TABLE "RestaurantOrder" VALIDATE CONSTRAINT "RestaurantOrder_location_reservation_fkey";
ALTER TABLE "RestaurantOrderLine" VALIDATE CONSTRAINT "RestaurantOrderLine_location_order_fkey";
ALTER TABLE "KitchenTicket" VALIDATE CONSTRAINT "KitchenTicket_location_station_fkey";
ALTER TABLE "KitchenTicket" VALIDATE CONSTRAINT "KitchenTicket_location_order_fkey";
ALTER TABLE "KitchenTicketLine" VALIDATE CONSTRAINT "KitchenTicketLine_location_ticket_fkey";
ALTER TABLE "KitchenTicketLine" VALIDATE CONSTRAINT "KitchenTicketLine_location_orderLine_fkey";

ALTER TABLE "BusinessDocument" ALTER COLUMN "locationId" SET NOT NULL;
ALTER TABLE "DocumentSeries" ALTER COLUMN "locationId" SET NOT NULL;
ALTER TABLE "RestaurantMenu" ALTER COLUMN "locationId" SET NOT NULL;
ALTER TABLE "FinancialAccount" ALTER COLUMN "locationId" SET NOT NULL;
ALTER TABLE "PaymentSchedule" ALTER COLUMN "locationId" SET NOT NULL;
ALTER TABLE "FinancialMovement" ALTER COLUMN "locationId" SET NOT NULL;
ALTER TABLE "FinancialAllocation" ALTER COLUMN "locationId" SET NOT NULL;
ALTER TABLE "FinancialTransfer" ALTER COLUMN "locationId" SET NOT NULL;
ALTER TABLE "BankStatement" ALTER COLUMN "locationId" SET NOT NULL;
ALTER TABLE "BankStatementLine" ALTER COLUMN "locationId" SET NOT NULL;
DROP TRIGGER IF EXISTS "DocumentSeries_locationId_write_guard" ON "DocumentSeries";
DROP FUNCTION IF EXISTS "enforce_document_series_location"();

ALTER TABLE "BusinessDocumentLine" DROP CONSTRAINT "BusinessDocumentLine_itemCategoryId_fkey";
ALTER TABLE "BusinessDocumentLine" ADD CONSTRAINT "BusinessDocumentLine_companyId_itemCategoryId_fkey" FOREIGN KEY ("companyId", "itemCategoryId") REFERENCES "ItemCategory"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Partner" DROP CONSTRAINT "Partner_agentId_fkey";
DROP INDEX IF EXISTS "Partner_agentId_idx";
CREATE INDEX "Partner_companyId_agentId_idx" ON "Partner"("companyId", "agentId");
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_companyId_agentId_fkey" FOREIGN KEY ("companyId", "agentId") REFERENCES "Partner"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Actor references must resolve to a membership in the same company, not merely a global User.
ALTER TABLE "Location" ADD CONSTRAINT "Location_createdById_company_membership_fkey" FOREIGN KEY ("createdById", "companyId") REFERENCES "Membership"("userId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Location" ADD CONSTRAINT "Location_updatedById_company_membership_fkey" FOREIGN KEY ("updatedById", "companyId") REFERENCES "Membership"("userId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_createdById_company_membership_fkey" FOREIGN KEY ("createdById", "companyId") REFERENCES "Membership"("userId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_updatedById_company_membership_fkey" FOREIGN KEY ("updatedById", "companyId") REFERENCES "Membership"("userId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Item" ADD CONSTRAINT "Item_createdById_company_membership_fkey" FOREIGN KEY ("createdById", "companyId") REFERENCES "Membership"("userId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Item" ADD CONSTRAINT "Item_updatedById_company_membership_fkey" FOREIGN KEY ("updatedById", "companyId") REFERENCES "Membership"("userId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ItemCategory" ADD CONSTRAINT "ItemCategory_createdById_company_membership_fkey" FOREIGN KEY ("createdById", "companyId") REFERENCES "Membership"("userId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ItemCategory" ADD CONSTRAINT "ItemCategory_updatedById_company_membership_fkey" FOREIGN KEY ("updatedById", "companyId") REFERENCES "Membership"("userId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UnitOfMeasure" ADD CONSTRAINT "UnitOfMeasure_createdById_company_membership_fkey" FOREIGN KEY ("createdById", "companyId") REFERENCES "Membership"("userId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UnitOfMeasure" ADD CONSTRAINT "UnitOfMeasure_updatedById_company_membership_fkey" FOREIGN KEY ("updatedById", "companyId") REFERENCES "Membership"("userId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VatRate" ADD CONSTRAINT "VatRate_createdById_company_membership_fkey" FOREIGN KEY ("createdById", "companyId") REFERENCES "Membership"("userId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VatRate" ADD CONSTRAINT "VatRate_updatedById_company_membership_fkey" FOREIGN KEY ("updatedById", "companyId") REFERENCES "Membership"("userId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PriceList" ADD CONSTRAINT "PriceList_createdById_company_membership_fkey" FOREIGN KEY ("createdById", "companyId") REFERENCES "Membership"("userId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PriceList" ADD CONSTRAINT "PriceList_updatedById_company_membership_fkey" FOREIGN KEY ("updatedById", "companyId") REFERENCES "Membership"("userId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PriceListItem" ADD CONSTRAINT "PriceListItem_createdById_company_membership_fkey" FOREIGN KEY ("createdById", "companyId") REFERENCES "Membership"("userId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PriceListItem" ADD CONSTRAINT "PriceListItem_updatedById_company_membership_fkey" FOREIGN KEY ("updatedById", "companyId") REFERENCES "Membership"("userId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentMethod" ADD CONSTRAINT "PaymentMethod_createdById_company_membership_fkey" FOREIGN KEY ("createdById", "companyId") REFERENCES "Membership"("userId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentMethod" ADD CONSTRAINT "PaymentMethod_updatedById_company_membership_fkey" FOREIGN KEY ("updatedById", "companyId") REFERENCES "Membership"("userId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentTerm" ADD CONSTRAINT "PaymentTerm_createdById_company_membership_fkey" FOREIGN KEY ("createdById", "companyId") REFERENCES "Membership"("userId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentTerm" ADD CONSTRAINT "PaymentTerm_updatedById_company_membership_fkey" FOREIGN KEY ("updatedById", "companyId") REFERENCES "Membership"("userId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
