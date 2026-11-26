// Read-only review list for the wheat/gluten rule (2026-11-26). Changes nothing.
//   npx tsx scripts/report-gluten-tags.ts
// 1. Ingredients tagged Wheat but not Gluten in the stored data. The app now
//    treats these as containing gluten automatically; listed so you can see
//    what changed on menus and grids.
// 2. Ingredients whose name suggests barley, rye, malt or beer but carry no
//    Gluten tag. Name matching is a hint only: check each product label.
import { prisma } from "../lib/db/prisma";

const GRAIN_HINT = /\b(barley|rye|malt|malted|beer|ale|lager|stout|porter|ipa|pilsner|amber|brewer'?s yeast|seitan|triticale|spelt|farro|bulgur|semolina|couscous)\b/i;

async function main() {
  const items = await prisma.item.findMany({ select: { name: true, allergens: true, category: true }, orderBy: { name: "asc" } });
  const tags = (raw: string | null) => new Set((raw ?? "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean));
  const wheatNoGluten = items.filter((i) => { const t = tags(i.allergens); return t.has("wheat") && !t.has("gluten"); });
  const grainHints = items.filter((i) => GRAIN_HINT.test(i.name) && !tags(i.allergens).has("gluten") && !tags(i.allergens).has("wheat"));
  console.log(`\nTagged Wheat without Gluten (now shown as containing gluten): ${wheatNoGluten.length}`);
  for (const i of wheatNoGluten) console.log(`  - ${i.name} [${i.category}]`);
  console.log(`\nName suggests barley/rye/malt/beer but no Gluten tag (check the label): ${grainHints.length}`);
  for (const i of grainHints) console.log(`  - ${i.name} [${i.category}]`);
}

main().finally(() => prisma.$disconnect());
