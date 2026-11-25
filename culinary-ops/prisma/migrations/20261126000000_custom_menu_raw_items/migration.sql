-- Custom Menu lines can be a purchased raw ingredient (e.g. buns) instead of a
-- recipe. Existing rows all have a recipe, so the CHECK holds for them.
ALTER TABLE "CustomMenuItem" ALTER COLUMN "recipeId" DROP NOT NULL;
ALTER TABLE "CustomMenuItem" ADD COLUMN "itemId" TEXT;
ALTER TABLE "CustomMenuItem" ADD CONSTRAINT "CustomMenuItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "CustomMenuItem_itemId_idx" ON "CustomMenuItem"("itemId");
ALTER TABLE "CustomMenuItem" ADD CONSTRAINT "CustomMenuItem_one_source_check" CHECK (num_nonnulls("recipeId", "itemId") = 1);
