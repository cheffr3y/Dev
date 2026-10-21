CREATE TABLE "ToGoRollup" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "venueId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "orderCutoff" TEXT,
  "pickupNotes" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ToGoRollup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ToGoRollupItem" (
  "id" TEXT NOT NULL,
  "rollupId" TEXT NOT NULL,
  "recipeId" TEXT,
  "name" TEXT NOT NULL,
  "section" TEXT NOT NULL DEFAULT 'Sides',
  "description" TEXT,
  "sellingUnit" TEXT,
  "recipeQtyPerUnit" DOUBLE PRECISION,
  "recipeAmountUnit" TEXT,
  "price" DOUBLE PRECISION,
  "packagingCost" DOUBLE PRECISION,
  "forecastQty" DOUBLE PRECISION,
  "productionQty" DOUBLE PRECISION,
  "actualSoldQty" DOUBLE PRECISION,
  "confidence" TEXT NOT NULL DEFAULT 'NEW',
  "packingNotes" TEXT,
  "customerInstructions" TEXT,
  "notes" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ToGoRollupItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ToGoRollupItem_nonnegative" CHECK (
    ("price" IS NULL OR ("price" >= 0 AND "price" < 'Infinity'::float8)) AND
    ("packagingCost" IS NULL OR ("packagingCost" >= 0 AND "packagingCost" < 'Infinity'::float8)) AND
    ("forecastQty" IS NULL OR ("forecastQty" >= 0 AND "forecastQty" < 'Infinity'::float8)) AND
    ("productionQty" IS NULL OR ("productionQty" >= 0 AND "productionQty" < 'Infinity'::float8)) AND
    ("actualSoldQty" IS NULL OR ("actualSoldQty" >= 0 AND "actualSoldQty" < 'Infinity'::float8)) AND
    ("recipeQtyPerUnit" IS NULL OR ("recipeQtyPerUnit" > 0 AND "recipeQtyPerUnit" < 'Infinity'::float8))
  )
);

CREATE INDEX "ToGoRollupItem_rollupId_sortOrder_idx" ON "ToGoRollupItem"("rollupId", "sortOrder");
CREATE INDEX "ToGoRollupItem_recipeId_idx" ON "ToGoRollupItem"("recipeId");
ALTER TABLE "ToGoRollup" ADD CONSTRAINT "ToGoRollup_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ToGoRollupItem" ADD CONSTRAINT "ToGoRollupItem_rollupId_fkey" FOREIGN KEY ("rollupId") REFERENCES "ToGoRollup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ToGoRollupItem" ADD CONSTRAINT "ToGoRollupItem_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
