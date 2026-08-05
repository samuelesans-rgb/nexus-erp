-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'IT',
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'EUR',
ADD COLUMN     "description" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "isHeadquarters" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "province" TEXT,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Europe/Rome',
ADD COLUMN     "updatedById" TEXT;

-- Backfill one active headquarters for every existing Company. The deterministic
-- code is used only where an active location does not already exist.
INSERT INTO "Location" ("id", "companyId", "code", "name", "country", "timezone", "currency", "isHeadquarters", "active", "createdAt", "updatedAt")
SELECT concat('hq_', "id"), "id", concat('HQ-', left("id", 12)), 'Headquarters', 'IT', 'Europe/Rome', 'EUR', true, true, now(), now()
FROM "Company" c
WHERE NOT EXISTS (
  SELECT 1 FROM "Location" l
  WHERE l."companyId" = c."id" AND l."active" = true AND l."deletedAt" IS NULL
);

WITH ranked_locations AS (
  SELECT "id", row_number() OVER (
    PARTITION BY "companyId"
    ORDER BY "isHeadquarters" DESC, "createdAt" ASC, "id" ASC
  ) AS position
  FROM "Location"
  WHERE "active" = true AND "deletedAt" IS NULL
)
UPDATE "Location" location
SET "isHeadquarters" = ranked_locations.position = 1
FROM ranked_locations
WHERE location."id" = ranked_locations."id";

-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "defaultLocationId" TEXT;

UPDATE "Membership" membership
SET "defaultLocationId" = location."id"
FROM "Location" location
WHERE membership."companyId" = location."companyId"
  AND membership."defaultLocationId" IS NULL
  AND location."isHeadquarters" = true
  AND location."active" = true
  AND location."deletedAt" IS NULL;

UPDATE "ModuleDefinition"
SET "status" = 'AVAILABLE', "mandatory" = true
WHERE "code" = 'CORE_LOCATIONS';

INSERT INTO "CompanyModule" ("id", "companyId", "moduleDefinitionId", "enabled", "enabledAt", "createdAt", "updatedAt")
SELECT concat('core_locations_', c."id"), c."id", definition."id", true, now(), now(), now()
FROM "Company" c
JOIN "ModuleDefinition" definition ON definition."code" = 'CORE_LOCATIONS'
WHERE NOT EXISTS (
  SELECT 1 FROM "CompanyModule" cm
  WHERE cm."companyId" = c."id" AND cm."moduleDefinitionId" = definition."id"
);

-- CreateIndex
CREATE INDEX "Membership_companyId_defaultLocationId_idx" ON "Membership"("companyId", "defaultLocationId");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_companyId_defaultLocationId_fkey" FOREIGN KEY ("companyId", "defaultLocationId") REFERENCES "Location"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
