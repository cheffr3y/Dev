import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { invoiceSchema, reviewSchema, invoiceMatches, type InvoiceReview } from "./invoice-options";
import { buildCostMap, foodCostPct } from "./costing";
import { convertQty } from "./units";
import { json } from "./prep-workflow";
export async function invoicePreview(db: PrismaClient, id: string, raw?: unknown) {
  const draft = await db.invoiceImport.findUniqueOrThrow({ where: { id } });
  const extracted = invoiceSchema.parse(draft.extracted);
  const [items, vendors, recipes, menus, quotes] = await Promise.all([
    db.item.findMany({ include: { vendor: { select: { name: true } } }, orderBy: { name: "asc" } }), db.vendor.findMany({ orderBy: { name: "asc" } }),
    db.recipe.findMany({ include: { items: { include: { item: true } }, components: true } }), db.menuRollout.findMany({ where: { status: "ACTIVE" }, include: { items: true } }), db.vendorQuote.findMany({ where: { active: true, quotedAt: { gte: new Date(Date.now()-90*86400000) } }, include: { vendor: { select: { name: true } } } }),
  ]);
  const review = raw ? reviewSchema.parse(raw) : null;
  if (review) {
    if (!["USD", "UNKNOWN"].includes(extracted.currency.toUpperCase())) throw new Error("Confirm this invoice's currency is USD before applying catalog prices.");
    if (!vendors.some(vendor => vendor.id === review.vendorId)) throw new Error("Choose an existing vendor.");
    if (new Set(review.decisions.map(row => row.itemId)).size !== review.decisions.length || new Set(review.decisions.map(row => row.line)).size !== review.decisions.length) throw new Error("Review duplicate ingredient or invoice-line selections separately.");
    for (const row of review.decisions) {
      const item = items.find(item => item.id === row.itemId), line = extracted.lines[row.line];
      if (!item || !line || line.unitPrice == null || line.unitPrice <= 0 || (line.quantity != null && line.quantity <= 0)) throw new Error("Only positive product purchase lines can update prices.");
      if (item.unitCost !== row.expectedCost || item.unit !== row.expectedUnit || item.updatedAt.toISOString() !== row.expectedUpdatedAt) throw new Error(`${item.name} changed since review. Reload the invoice review.`);
    }
  }
  const proposed = new Map(review?.decisions.map(row => [row.itemId, row.unitCost]) ?? []);
  function validRecipe(id: string, useProposed: boolean, path = new Set<string>()): boolean {
    const recipe = recipes.find(recipe => recipe.id === id);
    if (!recipe || path.has(id) || recipe.yieldQty <= 0 || recipe.items.length + recipe.components.length === 0) return false;
    const next = new Set(path).add(id);
    return recipe.items.every(line => (useProposed ? proposed.get(line.itemId) ?? line.item.unitCost : line.item.unitCost) > 0 && convertQty(line.quantity,line.unit,line.item.unit) != null) && recipe.components.every(line => { const child = recipes.find(recipe => recipe.id === line.childId); return child && convertQty(line.quantity,line.unit,child.yieldUnit) != null && validRecipe(child.id,useProposed,next); });
  }
  const before = buildCostMap(recipes), after = buildCostMap(recipes.map(recipe => ({ ...recipe, items: recipe.items.map(line => ({ ...line, item: { ...line.item, unitCost: proposed.get(line.itemId) ?? line.item.unitCost } })) })));
  const affected = recipes.filter(recipe => before.get(recipe.id) !== after.get(recipe.id));
  const impact = affected.map(recipe => ({ id: recipe.id, name: recipe.name, before: before.get(recipe.id) ?? 0, after: after.get(recipe.id) ?? 0, needsReview: !validRecipe(recipe.id,false) || !validRecipe(recipe.id,true), beforeFcp: validRecipe(recipe.id,false) && recipe.menuPrice && recipe.menuPrice > 0 ? foodCostPct((before.get(recipe.id) ?? 0)/recipe.yieldQty,recipe.menuPrice) : null, afterFcp: validRecipe(recipe.id,true) && recipe.menuPrice && recipe.menuPrice > 0 ? foodCostPct((after.get(recipe.id) ?? 0)/recipe.yieldQty,recipe.menuPrice) : null }));
  const menuImpact = menus.flatMap(menu => menu.items.filter(line => affected.some(recipe => recipe.id === line.recipeId)).map(line => { const recipe = recipes.find(recipe => recipe.id === line.recipeId)!; const price = line.menuPrice ?? recipe.menuPrice; return { menu: menu.name, dish: line.menuTitle ?? recipe.name, needsReview: !validRecipe(recipe.id,false) || !validRecipe(recipe.id,true), beforeFcp: validRecipe(recipe.id,false) && price && price > 0 ? foodCostPct(before.get(recipe.id)!/recipe.yieldQty,price) : null, afterFcp: validRecipe(recipe.id,true) && price && price > 0 ? foodCostPct(after.get(recipe.id)!/recipe.yieldQty,price) : null }; }));
  const signature = createHash("sha256").update(JSON.stringify({ review, catalog: items.map(item => [item.id,item.updatedAt]), recipes: recipes.map(recipe => [recipe.id,recipe.updatedAt]), menus })).digest("hex");
  return { draft, extracted, items, vendors, matches: extracted.lines.map(line => invoiceMatches(line, extracted.vendorName, items)), impact, menuImpact, signature, quotes: items.map(item => ({ itemId: item.id, options: quotes.filter(quote => quote.itemId === item.id).map(quote => { const ratio = convertQty(1,quote.unit,item.unit); return { vendor: quote.vendor.name, cost: ratio != null && ratio > 0 ? quote.unitCost/ratio : null, date: quote.quotedAt }; }).filter(quote => quote.cost != null).sort((a,b) => a.cost! - b.cost!) })) };
}
export async function applyInvoice(db: PrismaClient, actorId: string, id: string, raw: unknown, signature: string) {
  const review: InvoiceReview = reviewSchema.parse(raw);
  return db.$transaction(async tx => {
    const actor = await tx.user.findUnique({ where: { id: actorId } });
    if (!actor || actor.role === "STAFF") throw new Error("Manager access required.");
    const existing = await tx.invoiceImport.findUniqueOrThrow({ where: { id } });
    if (existing.appliedAt) return { applied: true };
    // Repeat the entire preview in the same serializable transaction as the writes.
    const preview = await invoicePreview(tx as unknown as PrismaClient, id, review);
    if (preview.signature !== signature) throw new Error("Prices or recipes changed since preview. Preview again before applying.");
    for (const row of review.decisions) {
      const line = preview.extracted.lines[row.line], item = preview.items.find(item => item.id === row.itemId)!;
      await tx.vendorQuote.upsert({ where: { itemId_vendorId: { itemId: row.itemId, vendorId: review.vendorId } }, create: { itemId: row.itemId, vendorId: review.vendorId, unit: item.unit, unitCost: row.unitCost, sku: line.sku, packSize: line.packSize, quotedAt: new Date(), invoiceId: id }, update: { unit: item.unit, unitCost: row.unitCost, sku: line.sku, packSize: line.packSize, quotedAt: new Date(), invoiceId: id, active: true } });
      await tx.item.update({ where: { id: row.itemId }, data: { unitCost: row.unitCost, priceUpdatedAt: new Date(), vendorId: review.vendorId, ...(line.sku ? {sku:line.sku} : {}), ...(line.packSize ? { packSize: line.packSize } : {}) } });
    }
    await tx.invoiceImport.update({ where: { id }, data: { appliedAt: new Date(), appliedBy: actor.id, review: json({ ...review, signature, before: preview.items.filter(item => review.decisions.some(row => row.itemId === item.id)), impact: preview.impact, menuImpact: preview.menuImpact }) } });
    return { applied: true };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}
