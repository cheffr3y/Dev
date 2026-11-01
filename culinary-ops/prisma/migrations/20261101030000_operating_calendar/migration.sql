CREATE TABLE "OperatingDay" (
  "id" TEXT PRIMARY KEY, "venueId" TEXT NOT NULL REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "businessDate" TIMESTAMP(3) NOT NULL, "grossSalesCents" INTEGER CHECK ("grossSalesCents" >= 0),
  "laborCents" INTEGER CHECK ("laborCents" >= 0), "foodReviewed" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT NOT NULL DEFAULT '', "revision" INTEGER NOT NULL DEFAULT 0, "history" JSONB NOT NULL DEFAULT '[]',
  "createdBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OperatingDay_venueId_businessDate_key" UNIQUE ("venueId", "businessDate")
);
CREATE TABLE "OperatingFoodExpense" (
  "id" TEXT PRIMARY KEY, "venueId" TEXT NOT NULL REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "invoiceDate" TIMESTAMP(3) NOT NULL, "amountCents" INTEGER NOT NULL, "description" TEXT NOT NULL,
  "invoiceDocumentId" TEXT UNIQUE REFERENCES "InvoiceDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "invoiceReferenceKey" TEXT UNIQUE, "voided" BOOLEAN NOT NULL DEFAULT false, "revision" INTEGER NOT NULL DEFAULT 0,
  "history" JSONB NOT NULL DEFAULT '[]', "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "OperatingFoodExpense_venueId_invoiceDate_idx" ON "OperatingFoodExpense"("venueId", "invoiceDate");
CREATE FUNCTION protect_operating_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Operating records are retained; correct or void the entry'; END IF;
  IF NEW."createdBy" IS DISTINCT FROM OLD."createdBy" OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
     OR NEW."id" IS DISTINCT FROM OLD."id" OR NEW."revision" <> OLD."revision" + 1
     OR jsonb_array_length(NEW."history") <> jsonb_array_length(OLD."history") + 1
     OR (NEW."history" - (jsonb_array_length(NEW."history") - 1)) IS DISTINCT FROM OLD."history" THEN
    RAISE EXCEPTION 'Operating changes must preserve original facts and append review history';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER operating_day_history BEFORE UPDATE OR DELETE ON "OperatingDay" FOR EACH ROW EXECUTE FUNCTION protect_operating_history();
CREATE TRIGGER operating_expense_history BEFORE UPDATE OR DELETE ON "OperatingFoodExpense" FOR EACH ROW EXECUTE FUNCTION protect_operating_history();
ALTER TABLE "InvoiceDocument" ADD COLUMN "lineRevision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "OperatingFoodExpense" ADD COLUMN "invoiceLineRevision" INTEGER;
CREATE TABLE "InvoicePurchaseLine" (
  "id" TEXT PRIMARY KEY, "invoiceDocumentId" TEXT NOT NULL REFERENCES "InvoiceDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "itemId" TEXT REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE, "itemName" TEXT,
  "vendorId" TEXT NOT NULL REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "venueId" TEXT NOT NULL REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "invoiceDate" TIMESTAMP(3) NOT NULL, "description" TEXT NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL CHECK ("quantity" > 0), "purchaseUnit" TEXT NOT NULL,
  "packQty" DOUBLE PRECISION NOT NULL CHECK ("packQty" > 0), "packUnit" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL, "normalizedUnit" TEXT, "normalizedUnitCost" DOUBLE PRECISION,
  "countsAsFood" BOOLEAN NOT NULL DEFAULT true, "voided" BOOLEAN NOT NULL DEFAULT false,
  "revision" INTEGER NOT NULL DEFAULT 0, "history" JSONB NOT NULL DEFAULT '[]', "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "InvoicePurchaseLine_itemId_invoiceDate_idx" ON "InvoicePurchaseLine"("itemId", "invoiceDate");
CREATE INDEX "InvoicePurchaseLine_invoiceDocumentId_idx" ON "InvoicePurchaseLine"("invoiceDocumentId");
CREATE TRIGGER invoice_purchase_history BEFORE UPDATE OR DELETE ON "InvoicePurchaseLine" FOR EACH ROW EXECUTE FUNCTION protect_operating_history();
