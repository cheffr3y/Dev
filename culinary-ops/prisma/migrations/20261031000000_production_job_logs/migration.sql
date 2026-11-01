CREATE TABLE "ProductionJob" (
  "id" TEXT NOT NULL,
  "targetKey" TEXT NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('PREP', 'BANQUET')),
  "businessDate" TIMESTAMP(3) NOT NULL,
  "recipeId" TEXT NOT NULL,
  "recipeName" TEXT NOT NULL,
  "contextLabel" TEXT NOT NULL,
  "sourceRef" JSONB NOT NULL,
  "sourceSignature" TEXT NOT NULL,
  "requestLineIds" JSONB NOT NULL,
  "lot" TEXT,
  "expectedQty" DOUBLE PRECISION,
  "expectedUnit" TEXT NOT NULL,
  "printScale" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "cookName" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedByUserId" TEXT NOT NULL,
  "finishedAt" TIMESTAMP(3),
  "finishedByUserId" TEXT,
  "actualQty" DOUBLE PRECISION,
  "actualUnit" TEXT,
  "notes" TEXT,
  "labeledAndDated" BOOLEAN NOT NULL DEFAULT false,
  "reviewedAt" TIMESTAMP(3),
  "reviewedByUserId" TEXT,
  "reviewNote" TEXT,
  "reviewedQty" DOUBLE PRECISION,
  "reviewedUnit" TEXT,
  CONSTRAINT "ProductionJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductionJob_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProductionJob_startedByUserId_fkey" FOREIGN KEY ("startedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProductionJob_finishedByUserId_fkey" FOREIGN KEY ("finishedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProductionJob_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProductionJob_finish_facts" CHECK (
    ("finishedAt" IS NULL AND "finishedByUserId" IS NULL AND "actualQty" IS NULL AND "actualUnit" IS NULL AND NOT "labeledAndDated")
    OR ("finishedAt" IS NOT NULL AND "actualQty" IS NOT NULL AND "actualUnit" IS NOT NULL AND "finishedAt" >= "startedAt" AND "finishedByUserId" IS NOT NULL AND "actualQty" >= 0 AND "actualQty" <= 100000000 AND length(trim("actualUnit")) > 0 AND "labeledAndDated")
  ),
  CONSTRAINT "ProductionJob_review_facts" CHECK (
    ("reviewedAt" IS NULL AND "reviewedByUserId" IS NULL AND "reviewedQty" IS NULL AND "reviewedUnit" IS NULL)
    OR ("reviewedAt" IS NOT NULL AND "finishedAt" IS NOT NULL AND "reviewedAt" >= "finishedAt" AND "reviewedByUserId" IS NOT NULL AND "reviewedQty" IS NOT NULL AND "reviewedQty" >= 0 AND "reviewedQty" <= 100000000 AND "reviewedUnit" IS NOT NULL AND length(trim("reviewedUnit")) > 0)
  )
);
CREATE UNIQUE INDEX "ProductionJob_targetKey_key" ON "ProductionJob"("targetKey");
CREATE INDEX "ProductionJob_businessDate_reviewedAt_idx" ON "ProductionJob"("businessDate", "reviewedAt");
CREATE INDEX "ProductionJob_recipeId_startedAt_idx" ON "ProductionJob"("recipeId", "startedAt");

CREATE FUNCTION protect_production_job() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Production job logs are preserved for review'; END IF;
  IF ROW(NEW."id", NEW."targetKey", NEW."kind", NEW."businessDate", NEW."recipeId", NEW."recipeName", NEW."contextLabel", NEW."sourceRef", NEW."sourceSignature", NEW."requestLineIds", NEW."lot", NEW."expectedQty", NEW."expectedUnit", NEW."printScale", NEW."cookName", NEW."startedAt", NEW."startedByUserId")
    IS DISTINCT FROM ROW(OLD."id", OLD."targetKey", OLD."kind", OLD."businessDate", OLD."recipeId", OLD."recipeName", OLD."contextLabel", OLD."sourceRef", OLD."sourceSignature", OLD."requestLineIds", OLD."lot", OLD."expectedQty", OLD."expectedUnit", OLD."printScale", OLD."cookName", OLD."startedAt", OLD."startedByUserId")
    THEN RAISE EXCEPTION 'Production job start facts are immutable'; END IF;
  IF OLD."finishedAt" IS NOT NULL AND ROW(NEW."finishedAt", NEW."finishedByUserId", NEW."actualQty", NEW."actualUnit", NEW."notes", NEW."labeledAndDated")
    IS DISTINCT FROM ROW(OLD."finishedAt", OLD."finishedByUserId", OLD."actualQty", OLD."actualUnit", OLD."notes", OLD."labeledAndDated")
    THEN RAISE EXCEPTION 'Submitted production facts are immutable'; END IF;
  IF OLD."reviewedAt" IS NOT NULL AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Reviewed production jobs are immutable'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "ProductionJob_protect" BEFORE UPDATE OR DELETE ON "ProductionJob" FOR EACH ROW EXECUTE FUNCTION protect_production_job();
