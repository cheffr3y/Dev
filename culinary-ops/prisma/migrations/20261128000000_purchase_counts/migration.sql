-- On-hand counts for the Combined purchasing list. Additive only.
CREATE TABLE "PurchaseCount" (
    "id" TEXT NOT NULL,
    "fromDate" TEXT NOT NULL,
    "toDate" TEXT NOT NULL,
    "includeUndated" BOOLEAN NOT NULL DEFAULT false,
    "sourceIds" TEXT[],
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PurchaseCount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PurchaseCountLine" (
    "id" TEXT NOT NULL,
    "countId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "onHand" DOUBLE PRECISION NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PurchaseCountLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PurchaseCountLine_onHand_check" CHECK ("onHand" >= 0)
);

CREATE INDEX "PurchaseCount_createdAt_idx" ON "PurchaseCount"("createdAt");
CREATE UNIQUE INDEX "PurchaseCountLine_countId_itemId_unit_key" ON "PurchaseCountLine"("countId", "itemId", "unit");
CREATE INDEX "PurchaseCountLine_itemId_idx" ON "PurchaseCountLine"("itemId");
ALTER TABLE "PurchaseCountLine" ADD CONSTRAINT "PurchaseCountLine_countId_fkey" FOREIGN KEY ("countId") REFERENCES "PurchaseCount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchaseCountLine" ADD CONSTRAINT "PurchaseCountLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
