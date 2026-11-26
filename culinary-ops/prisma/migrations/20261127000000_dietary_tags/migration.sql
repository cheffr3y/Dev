-- Dietary tags and allergen review dates. Additive only: every new column is
-- nullable, so existing items read as "not yet tagged" and "never reviewed".
ALTER TABLE "Item" ADD COLUMN "diet" TEXT;
ALTER TABLE "Item" ADD COLUMN "allergenReviewedAt" TIMESTAMP(3);
ALTER TABLE "Item" ADD CONSTRAINT "Item_diet_check" CHECK ("diet" IS NULL OR "diet" IN ('vegan', 'vegetarian', 'neither'));
ALTER TABLE "Recipe" ADD COLUMN "dietOverride" TEXT;
ALTER TABLE "Recipe" ADD COLUMN "dietOverrideNote" TEXT;
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_dietOverride_check" CHECK ("dietOverride" IS NULL OR ("dietOverride" IN ('vegan', 'vegetarian', 'neither') AND length(btrim(coalesce("dietOverrideNote", ''))) > 0));
