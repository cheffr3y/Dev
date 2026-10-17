-- Ingredient tags are additive. Preserve existing manual recipe allergens.
ALTER TABLE "Item" ADD COLUMN "allergens" TEXT;
