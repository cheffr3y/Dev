CREATE TABLE "AccountingMapping" ("id" TEXT PRIMARY KEY, "kind" TEXT NOT NULL CHECK ("kind" IN ('CATEGORY','VENUE','LABOR')), "sourceKey" TEXT NOT NULL, "code" TEXT NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL);
CREATE UNIQUE INDEX "AccountingMapping_kind_sourceKey_key" ON "AccountingMapping"("kind", "sourceKey");
CREATE TABLE "InvoiceImport" ("id" TEXT PRIMARY KEY, "fileHash" TEXT NOT NULL UNIQUE, "filename" TEXT NOT NULL, "extracted" JSONB NOT NULL, "createdBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "appliedAt" TIMESTAMP(3), "appliedBy" TEXT, "review" JSONB);
CREATE TABLE "VendorQuote" ("id" TEXT PRIMARY KEY, "itemId" TEXT NOT NULL REFERENCES "Item"("id") ON DELETE RESTRICT, "vendorId" TEXT NOT NULL REFERENCES "Vendor"("id") ON DELETE RESTRICT, "sku" TEXT, "packSize" TEXT, "unit" TEXT NOT NULL, "unitCost" DOUBLE PRECISION NOT NULL CHECK ("unitCost" >= 0 AND "unitCost" < 'Infinity'::float8), "quotedAt" TIMESTAMP(3) NOT NULL, "invoiceId" TEXT NOT NULL REFERENCES "InvoiceImport"("id") ON DELETE RESTRICT, "active" BOOLEAN NOT NULL DEFAULT true);
CREATE UNIQUE INDEX "VendorQuote_itemId_vendorId_key" ON "VendorQuote"("itemId", "vendorId");
CREATE INDEX "VendorQuote_itemId_idx" ON "VendorQuote"("itemId");
CREATE FUNCTION preserve_applied_invoice() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
IF TG_OP = 'DELETE' OR OLD."appliedAt" IS NOT NULL OR NEW."id" IS DISTINCT FROM OLD."id" OR NEW."filename" IS DISTINCT FROM OLD."filename" OR NEW."fileHash" IS DISTINCT FROM OLD."fileHash" OR NEW."extracted" IS DISTINCT FROM OLD."extracted" OR NEW."createdBy" IS DISTINCT FROM OLD."createdBy" OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN RAISE EXCEPTION 'Invoice source and applied reviews are preserved'; END IF;
RETURN NEW; END $$;
CREATE TRIGGER "InvoiceImport_preserve" BEFORE UPDATE OR DELETE ON "InvoiceImport" FOR EACH ROW EXECUTE FUNCTION preserve_applied_invoice();

ALTER TABLE "InvoiceImport" ADD CONSTRAINT "InvoiceImport_review_complete" CHECK (("appliedAt" IS NULL AND "appliedBy" IS NULL AND "review" IS NULL) OR ("appliedAt" IS NOT NULL AND "appliedBy" IS NOT NULL AND "review" IS NOT NULL));
