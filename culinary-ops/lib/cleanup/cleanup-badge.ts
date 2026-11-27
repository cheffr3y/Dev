import type { Prisma } from "@prisma/client";
import { ALLERGEN_REVIEW_DAYS } from "../recipes/costing";

// The sidebar Cleanup badge: ingredients used in a recipe that need a label
// check (never reviewed / over ALLERGEN_REVIEW_DAYS) or have no price.
// Same rules as the Cleanup page, kept to one cheap count query.
export function cleanupBadgeWhere(now = new Date()): Prisma.ItemWhereInput {
  const reviewCutoff = new Date(now.getTime() - ALLERGEN_REVIEW_DAYS * 86400000);
  return {
    recipeItems: { some: {} },
    OR: [{ allergenReviewedAt: null }, { allergenReviewedAt: { lte: reviewCutoff } }, { unitCost: { lte: 0 } }],
  };
}
