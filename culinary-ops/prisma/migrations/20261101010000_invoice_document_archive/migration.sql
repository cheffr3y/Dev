CREATE TABLE "InvoiceDocument" (
 "id" TEXT PRIMARY KEY, "fileHash" TEXT NOT NULL UNIQUE, "filename" TEXT NOT NULL,
 "mime" TEXT NOT NULL CHECK ("mime" IN ('image/jpeg','image/png','application/pdf')), "data" BYTEA NOT NULL, "preview" BYTEA NOT NULL,
 "originalBytes" INTEGER NOT NULL CHECK ("originalBytes" > 0), "storedBytes" INTEGER NOT NULL CHECK ("storedBytes" > 0 AND "storedBytes" <= 8388608),
 "pages" INTEGER NOT NULL CHECK ("pages" BETWEEN 1 AND 20), "createdBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "vendorId" TEXT REFERENCES "Vendor"("id") ON DELETE SET NULL, "invoiceNumber" TEXT, "notes" TEXT,
 CONSTRAINT "InvoiceDocument_stored_length" CHECK (octet_length("data") = "storedBytes")
);
