-- Preserve unresolved global historical series, including their numbering
-- updates, while preventing new global series and scoped-to-global regressions.
CREATE FUNCTION "enforce_document_series_location"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."locationId" IS NULL
     AND (TG_OP = 'INSERT' OR OLD."locationId" IS NOT NULL) THEN
    RAISE EXCEPTION 'New DocumentSeries rows require locationId';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "DocumentSeries_locationId_write_guard"
BEFORE INSERT OR UPDATE OF "locationId" ON "DocumentSeries"
FOR EACH ROW EXECUTE FUNCTION "enforce_document_series_location"();
