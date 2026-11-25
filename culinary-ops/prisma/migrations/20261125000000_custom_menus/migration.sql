-- Custom Menus: one-off menus with costed and kitchen packets. Additive only.
CREATE TABLE "CustomMenu" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subtitle" TEXT,
    "date" TIMESTAMP(3),
    "serviceTime" TEXT,
    "venueId" TEXT,
    "guestCount" INTEGER NOT NULL DEFAULT 0,
    "pricePerGuest" DOUBLE PRECISION,
    "targetFcp" DOUBLE PRECISION NOT NULL DEFAULT 30,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "serviceNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomMenu_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomMenuItem" (
    "id" TEXT NOT NULL,
    "customMenuId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "section" TEXT NOT NULL DEFAULT 'Main',
    "menuTitle" TEXT,
    "menuDescription" TEXT,
    "portionQty" DOUBLE PRECISION,
    "portionUnit" TEXT,
    "totalQty" DOUBLE PRECISION,
    "totalUnit" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomMenuItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomMenuItem_customMenuId_idx" ON "CustomMenuItem"("customMenuId");

ALTER TABLE "CustomMenu" ADD CONSTRAINT "CustomMenu_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomMenuItem" ADD CONSTRAINT "CustomMenuItem_customMenuId_fkey" FOREIGN KEY ("customMenuId") REFERENCES "CustomMenu"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomMenuItem" ADD CONSTRAINT "CustomMenuItem_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
