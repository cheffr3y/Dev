CREATE TABLE "BanquetBaseline" (
  "banquetId" TEXT PRIMARY KEY REFERENCES "Banquet"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "snapshot" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdBy" TEXT NOT NULL
);
CREATE FUNCTION protect_banquet_baseline() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Locked BEO baselines cannot be changed'; END;
$$;
CREATE TRIGGER banquet_baseline_immutable BEFORE UPDATE ON "BanquetBaseline" FOR EACH ROW EXECUTE FUNCTION protect_banquet_baseline();
