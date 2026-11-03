ALTER TABLE "Item" ADD COLUMN "eachLabel" TEXT NOT NULL DEFAULT 'each', ADD COLUMN "eachWeightOz" DOUBLE PRECISION, ADD COLUMN "densityGPerMl" DOUBLE PRECISION, ADD COLUMN "usableCosting" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "measurementReviewedAt" TIMESTAMP(3), ADD COLUMN "measurementRevision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "InvoicePurchaseLine" ADD COLUMN "measurementSnapshot" JSONB;
ALTER TABLE "InvoiceDocument" ADD COLUMN "reviewState" TEXT NOT NULL DEFAULT 'NEEDS_REVIEW', ADD COLUMN "candidateLineCount" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "reviewedCandidateCount" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "reviewCompletedAt" TIMESTAMP(3), ADD COLUMN "reviewedLineRevision" INTEGER, ADD COLUMN "reviewedOcrRevision" INTEGER, ADD COLUMN "reviewedBy" TEXT;
CREATE INDEX "InvoiceDocument_reviewState_createdAt_idx" ON "InvoiceDocument"("reviewState","createdAt");
CREATE TABLE "IngredientMeasurementChange" ("id" TEXT PRIMARY KEY,"itemId" TEXT NOT NULL,"actorId" TEXT NOT NULL,"requestHash" TEXT NOT NULL,"before" JSONB NOT NULL,"after" JSONB NOT NULL,"impact" JSONB NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "IngredientMeasurementChange_itemId_createdAt_idx" ON "IngredientMeasurementChange"("itemId","createdAt");
CREATE FUNCTION protect_ingredient_measurement_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Measurement history is retained; append a new reviewed change'; END $$;
CREATE TRIGGER ingredient_measurement_history BEFORE UPDATE OR DELETE ON "IngredientMeasurementChange" FOR EACH ROW EXECUTE FUNCTION protect_ingredient_measurement_history();
-- Derive review metadata for archived documents; financial records are untouched.
WITH facts AS (
 SELECT d."id", COUNT(l.line) AS candidates,
 COUNT(l.line) FILTER (WHERE p."id" IS NOT NULL OR o."documentId" IS NOT NULL) AS resolved,
 COUNT(l.line) FILTER (WHERE p."id" IS NULL AND o."documentId" IS NULL AND CASE WHEN jsonb_typeof(l.line->'warnings')='array' THEN jsonb_array_length(l.line->'warnings')>0 ELSE false END) AS issues,
 (SELECT count(*) FROM "InvoicePurchaseLine" x WHERE x."invoiceDocumentId"=d."id") AS saved
 FROM "InvoiceDocument" d LEFT JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(d."ocrDraft"->'lines')='array' THEN d."ocrDraft"->'lines' ELSE '[]'::jsonb END) l(line) ON true
 LEFT JOIN "InvoicePurchaseLine" p ON p."invoiceDocumentId"=d."id" AND p."ocrLineKey"=l.line->>'key'
 LEFT JOIN "InvoiceOcrDecision" o ON o."documentId"=d."id" AND o."lineKey"=l.line->>'key' GROUP BY d."id"
) UPDATE "InvoiceDocument" d SET "candidateLineCount"=f.candidates,"reviewedCandidateCount"=f.resolved,"reviewState"=CASE WHEN f.candidates=f.resolved AND (f.candidates>0 OR f.saved>0) THEN 'READY' WHEN f.issues>0 THEN 'NEEDS_ATTENTION' WHEN f.resolved>0 OR f.saved>0 THEN 'IN_PROGRESS' ELSE 'NEEDS_REVIEW' END FROM facts f WHERE f."id"=d."id";
