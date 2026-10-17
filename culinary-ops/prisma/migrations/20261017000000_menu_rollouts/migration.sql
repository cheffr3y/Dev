-- AlterTable
ALTER TABLE "RecipeItem" ADD COLUMN     "groupName" TEXT,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "MenuRollout" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subtitle" TEXT,
    "venueId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "targetFcp" DOUBLE PRECISION NOT NULL DEFAULT 28,
    "expectedCovers" INTEGER NOT NULL DEFAULT 100,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuRollout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuRolloutItem" (
    "id" TEXT NOT NULL,
    "rolloutId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "section" TEXT NOT NULL DEFAULT 'Main',
    "menuTitle" TEXT,
    "menuDescription" TEXT,
    "menuPrice" DOUBLE PRECISION,
    "parBatches" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MenuRolloutItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MenuRolloutItem_rolloutId_recipeId_key" ON "MenuRolloutItem"("rolloutId", "recipeId");

-- AddForeignKey
ALTER TABLE "MenuRollout" ADD CONSTRAINT "MenuRollout_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuRolloutItem" ADD CONSTRAINT "MenuRolloutItem_rolloutId_fkey" FOREIGN KEY ("rolloutId") REFERENCES "MenuRollout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuRolloutItem" ADD CONSTRAINT "MenuRolloutItem_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

