-- Promote the existing CRM catalog entry without enabling it for any company.
UPDATE "ModuleDefinition"
SET "status" = 'AVAILABLE'
WHERE "code" = 'CORE_CRM'
  AND "status" = 'FUTURE';
