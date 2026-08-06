ALTER TABLE "Location" ADD COLUMN "slug" TEXT;

WITH "slug_candidates" AS (
  SELECT
    "id",
    COALESCE(
      NULLIF(TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER("name"), '[^a-z0-9]+', '-', 'g')), ''),
      'location'
    ) AS "base_slug"
  FROM "Location"
)
UPDATE "Location" AS "location"
SET "slug" = LEFT("candidate"."base_slug", 100) || '-' || MD5("location"."id")
FROM "slug_candidates" AS "candidate"
WHERE "candidate"."id" = "location"."id";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Location" WHERE "slug" IS NULL) THEN
    RAISE EXCEPTION 'Location slug backfill incomplete';
  END IF;

  IF EXISTS (SELECT "slug" FROM "Location" GROUP BY "slug" HAVING COUNT(*) > 1) THEN
    RAISE EXCEPTION 'Location slug backfill generated duplicates';
  END IF;

  IF EXISTS (SELECT 1 FROM "Location" WHERE "slug" !~ '^[a-z0-9]+(-[a-z0-9]+)*$') THEN
    RAISE EXCEPTION 'Location slug backfill generated an invalid slug';
  END IF;
END $$;

ALTER TABLE "Location" ALTER COLUMN "slug" SET NOT NULL;

CREATE UNIQUE INDEX "Location_slug_key" ON "Location"("slug");
