CREATE TABLE "InvoiceReviewDraft" (
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "documentId" TEXT NOT NULL REFERENCES "InvoiceDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "payload" JSONB NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  PRIMARY KEY ("userId", "documentId")
);
