ALTER TABLE "InvoiceDocument" ADD COLUMN "ocrDraft" JSONB, ADD COLUMN "ocrRevision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "InvoicePurchaseLine" ADD COLUMN "ocrLineKey" TEXT, ADD COLUMN "rawCode" TEXT, ADD COLUMN "billedUnitPrice" DOUBLE PRECISION;
CREATE UNIQUE INDEX "InvoicePurchaseLine_invoiceDocumentId_ocrLineKey_key" ON "InvoicePurchaseLine"("invoiceDocumentId","ocrLineKey");
CREATE TABLE "InvoiceItemAlias" (
 "id" TEXT PRIMARY KEY, "vendorId" TEXT REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "rawCode" TEXT, "normalizedOcrText" TEXT NOT NULL, "tokens" TEXT[] NOT NULL,
 "itemId" TEXT REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE,
 "isIgnored" BOOLEAN NOT NULL DEFAULT false, "defaultUnit" TEXT, "defaultPackQty" DOUBLE PRECISION, "defaultPackUnit" TEXT,
 "hitCount" INTEGER NOT NULL DEFAULT 1, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "InvoiceItemAlias_vendorId_rawCode_key" ON "InvoiceItemAlias"("vendorId","rawCode");
CREATE UNIQUE INDEX "InvoiceItemAlias_vendorId_normalizedOcrText_key" ON "InvoiceItemAlias"("vendorId","normalizedOcrText");
CREATE UNIQUE INDEX invoice_alias_global_code ON "InvoiceItemAlias"("rawCode") WHERE "vendorId" IS NULL AND "rawCode" IS NOT NULL;
CREATE UNIQUE INDEX invoice_alias_global_text ON "InvoiceItemAlias"("normalizedOcrText") WHERE "vendorId" IS NULL;
CREATE TABLE "InvoiceCatalogState" (
 "itemId" TEXT PRIMARY KEY REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "baselineCost" DOUBLE PRECISION NOT NULL, "baselineUnit" TEXT NOT NULL, "lineId" TEXT, "lineRevision" INTEGER,
 "appliedCost" DOUBLE PRECISION NOT NULL, "appliedUnit" TEXT NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "InvoicePriceChange" (
 "id" TEXT PRIMARY KEY, "itemId" TEXT NOT NULL, "invoiceDocumentId" TEXT NOT NULL, "triggerLineId" TEXT NOT NULL,
 "sourceLineId" TEXT, "beforeCost" DOUBLE PRECISION NOT NULL, "afterCost" DOUBLE PRECISION NOT NULL,
 "unit" TEXT NOT NULL, "actorId" TEXT NOT NULL, "reason" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "InvoicePriceChange_itemId_createdAt_idx" ON "InvoicePriceChange"("itemId","createdAt");
CREATE FUNCTION invoice_price_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Invoice price changes are retained'; END; $$;
CREATE TRIGGER invoice_price_history_immutable BEFORE UPDATE OR DELETE ON "InvoicePriceChange" FOR EACH ROW EXECUTE FUNCTION invoice_price_history_immutable();
CREATE TABLE "InvoiceLearningEvent" ("id" TEXT PRIMARY KEY,"actorId" TEXT NOT NULL,"requestHash" TEXT NOT NULL,"result" JSONB NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "InvoiceOcrDecision" ("id" TEXT PRIMARY KEY,"documentId" TEXT NOT NULL REFERENCES "InvoiceDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE,"lineKey" TEXT NOT NULL,"facts" JSONB NOT NULL,"actorId" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX "InvoiceOcrDecision_documentId_lineKey_key" ON "InvoiceOcrDecision"("documentId","lineKey");
