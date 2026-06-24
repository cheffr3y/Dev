"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, type AppUser } from "@/lib/session";
import { money } from "@/lib/costing";
import { unitLabel } from "@/lib/units";
import { generateProdCode } from "@/lib/prep";
import { allergenLabels, parseAllergens, serializeAllergens } from "@/lib/allergens";

const recipeSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  category: z.string().trim().min(1).default("Other"),
  station: z.string().trim().optional(),
  yieldQty: z.coerce.number().positive().default(1),
  yieldUnit: z.string().trim().min(1).default("servings"),
  menuPrice: z.coerce.number().min(0).optional(),
  instructions: z.string().trim().optional(),
  prepMinutes: z.coerce.number().int().min(0).optional(),
  cookMinutes: z.coerce.number().int().min(0).optional(),
  shelfLife: z.string().trim().optional(),
  storage: z.string().trim().optional(),
  allergens: z.string().trim().optional(),
  criticalNotes: z.string().trim().optional(),
  holdLifeDays: z.coerce.number().int().min(0).optional(),
});

// Method steps are submitted as repeated `step` fields by the inline editor;
// fall back to a single `instructions` textarea for the quick-create form.
function readInstructions(formData: FormData): string | undefined {
  const steps = formData
    .getAll("step")
    .map((s) => String(s).trim())
    .filter(Boolean);
  if (steps.length > 0) return steps.join("\n");
  const raw = formData.get("instructions");
  return raw ? String(raw) : undefined;
}

// Allergens post as repeated `allergen` checkboxes (canonical keys). Inherited
// ones are disabled in the UI and never submitted, so this captures only the
// recipe's own selections. Falls back to a legacy `allergens` string field.
function readAllergens(formData: FormData): string | undefined {
  const boxes = formData.getAll("allergen").map((s) => String(s));
  if (boxes.length > 0) return serializeAllergens(boxes) || undefined;
  const legacy = formData.get("allergens");
  return legacy ? serializeAllergens(parseAllergens(String(legacy))) || undefined : undefined;
}

function parseRecipe(formData: FormData) {
  const d = recipeSchema.parse({
    name: formData.get("name"),
    category: formData.get("category") || "Other",
    station: formData.get("station") || undefined,
    yieldQty: formData.get("yieldQty") || 1,
    yieldUnit: formData.get("yieldUnit") || "servings",
    menuPrice: formData.get("menuPrice") || undefined,
    instructions: readInstructions(formData),
    prepMinutes: formData.get("prepMinutes") || undefined,
    cookMinutes: formData.get("cookMinutes") || undefined,
    shelfLife: formData.get("shelfLife") || undefined,
    storage: formData.get("storage") || undefined,
    allergens: readAllergens(formData),
    criticalNotes: formData.get("criticalNotes") || undefined,
    holdLifeDays: formData.get("holdLifeDays") || undefined,
  });
  return {
    name: d.name,
    category: d.category,
    station: d.station || null,
    yieldQty: d.yieldQty,
    yieldUnit: d.yieldUnit,
    menuPrice: d.menuPrice ?? null,
    instructions: d.instructions || null,
    prepMinutes: d.prepMinutes ?? null,
    cookMinutes: d.cookMinutes ?? null,
    shelfLife: d.shelfLife || null,
    storage: d.storage || null,
    allergens: d.allergens || null,
    criticalNotes: d.criticalNotes || null,
    holdLifeDays: d.holdLifeDays ?? null,
  };
}

// --- Changelog -----------------------------------------------------------

async function logChange(
  recipeId: string,
  user: AppUser,
  summary: string,
  detail?: string,
) {
  await prisma.recipeChange.create({
    data: { recipeId, summary, detail: detail || null, userId: user.id, userName: user.name || null },
  });
}

// Human-readable labels + formatters for the fields we diff on save.
const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  category: "Category",
  station: "Station",
  yieldQty: "Yield qty",
  yieldUnit: "Yield unit",
  menuPrice: "Menu price",
  instructions: "Method",
  prepMinutes: "Prep time",
  cookMinutes: "Cook time",
  shelfLife: "Shelf life",
  storage: "Storage",
  allergens: "Allergens",
  criticalNotes: "Critical notes",
  holdLifeDays: "Hold life (days)",
};

function fmt(field: string, v: unknown): string {
  if (v == null || v === "") return "—";
  if (field === "menuPrice") return money(Number(v));
  if (field === "instructions") {
    const n = String(v).split(/\r?\n/).filter((s) => s.trim()).length;
    return `${n} step${n === 1 ? "" : "s"}`;
  }
  if (field === "allergens") {
    return allergenLabels(parseAllergens(String(v))) || "—";
  }
  // Multi-line free-text fields read better as one line in the changelog diff.
  if (field === "storage" || field === "criticalNotes") {
    return String(v).split(/\r?\n/).map((s) => s.trim()).filter(Boolean).join(" · ");
  }
  return String(v);
}

// Compare the saved data against the previous row and describe what changed.
function diffRecipe(prev: Record<string, unknown>, next: Record<string, unknown>): string[] {
  const lines: string[] = [];
  for (const key of Object.keys(FIELD_LABELS)) {
    const a = prev[key] ?? null;
    const b = next[key] ?? null;
    if (key === "instructions") {
      if ((a ?? "") !== (b ?? "")) lines.push(`${FIELD_LABELS[key]} updated`);
      continue;
    }
    if (a !== b) lines.push(`${FIELD_LABELS[key]}: ${fmt(key, a)} → ${fmt(key, b)}`);
  }
  return lines;
}

// --- Recipe CRUD ---------------------------------------------------------

export async function createRecipe(formData: FormData) {
  const user = await requireRole("MANAGER");
  const data = parseRecipe(formData);
  // Auto-generate the 3-char production code (hands-off; ban O/I/L; unique).
  const existing = await prisma.recipe.findMany({ select: { prodCode: true } });
  const prodCode = generateProdCode(data.name, new Set(existing.map((r) => r.prodCode)));
  const recipe = await prisma.recipe.create({ data: { ...data, prodCode } });
  await logChange(recipe.id, user, "Recipe created", `Production code: ${prodCode}`);
  revalidatePath("/recipes");
  redirect(`/recipes/${recipe.id}`);
}

export async function updateRecipe(formData: FormData) {
  const user = await requireRole("MANAGER");
  const id = String(formData.get("id"));
  const prev = await prisma.recipe.findUnique({ where: { id } });
  const data = parseRecipe(formData);
  await prisma.recipe.update({ where: { id }, data });

  if (prev) {
    const changes = diffRecipe(prev as Record<string, unknown>, data as Record<string, unknown>);
    if (changes.length > 0) {
      await logChange(id, user, "Edited details", changes.join("\n"));
    }
  }
  revalidatePath(`/recipes/${id}`);
}

export async function deleteRecipe(formData: FormData) {
  await requireRole("MANAGER");
  const id = String(formData.get("id"));

  // The schema deliberately RESTRICTs deleting a recipe that's part of
  // operational/historical truth (production ledger, event/banquet plans, or
  // another recipe's build). Count those references up front and surface a
  // clear message instead of letting the Postgres FK violation crash the
  // request. Ingredients, changelog, and this recipe's own sub-recipe links
  // cascade away on their own.
  const [prepLines, eventItems, banquetItems, usedIn] = await Promise.all([
    prisma.prepOrderLine.count({ where: { recipeId: id } }),
    prisma.eventMenuItem.count({ where: { recipeId: id } }),
    prisma.banquetMenuItem.count({ where: { recipeId: id } }),
    prisma.recipeComponent.count({ where: { childId: id } }),
  ]);

  const plural = (n: number, one: string, many = `${one}s`) =>
    `${n} ${n === 1 ? one : many}`;
  const blockers: string[] = [];
  if (prepLines) blockers.push(plural(prepLines, "prep order line"));
  if (eventItems) blockers.push(plural(eventItems, "event"));
  if (banquetItems) blockers.push(plural(banquetItems, "banquet"));
  if (usedIn) blockers.push(`${plural(usedIn, "recipe")} (as a sub-recipe)`);

  if (blockers.length > 0) {
    const list = new Intl.ListFormat("en", { type: "conjunction" }).format(blockers);
    throw new Error(
      `Can't delete this recipe — it's still used by ${list}. Remove it from those first.`,
    );
  }

  await prisma.recipe.delete({ where: { id } });
  revalidatePath("/recipes");
  redirect("/recipes");
}

// --- Ingredients ---------------------------------------------------------

const lineSchema = z.object({
  recipeId: z.string().min(1),
  itemId: z.string().min(1, "Pick an item"),
  quantity: z.coerce.number().min(0).default(0),
  unit: z.string().trim().min(1).default("each"),
});

export async function addRecipeItem(formData: FormData) {
  const user = await requireRole("MANAGER");
  const d = lineSchema.parse({
    recipeId: formData.get("recipeId"),
    itemId: formData.get("itemId"),
    quantity: formData.get("quantity") || 0,
    unit: formData.get("unit") || "each",
  });
  const existing = await prisma.recipeItem.findUnique({
    where: { recipeId_itemId: { recipeId: d.recipeId, itemId: d.itemId } },
  });
  const item = await prisma.item.findUnique({ where: { id: d.itemId } });
  await prisma.recipeItem.upsert({
    where: { recipeId_itemId: { recipeId: d.recipeId, itemId: d.itemId } },
    create: d,
    update: { quantity: d.quantity, unit: d.unit },
  });
  const label = `${item?.name ?? "ingredient"} (${d.quantity} ${unitLabel(d.unit)})`;
  await logChange(
    d.recipeId,
    user,
    existing ? "Updated ingredient" : "Added ingredient",
    label,
  );
  revalidatePath(`/recipes/${d.recipeId}`);
}

export async function removeRecipeItem(formData: FormData) {
  const user = await requireRole("MANAGER");
  const id = String(formData.get("id"));
  const recipeId = String(formData.get("recipeId"));
  const existing = await prisma.recipeItem.findUnique({ where: { id }, include: { item: true } });
  await prisma.recipeItem.delete({ where: { id } });
  await logChange(recipeId, user, "Removed ingredient", existing?.item.name);
  revalidatePath(`/recipes/${recipeId}`);
}

// --- Sub-recipes ---------------------------------------------------------

const componentSchema = z.object({
  parentId: z.string().min(1),
  childId: z.string().min(1, "Pick a recipe"),
  quantity: z.coerce.number().positive().default(1),
  unit: z.string().trim().min(1).default("serving"),
});

export async function addSubRecipe(formData: FormData) {
  const user = await requireRole("MANAGER");
  const d = componentSchema.parse({
    parentId: formData.get("parentId"),
    childId: formData.get("childId"),
    quantity: formData.get("quantity") || 1,
    unit: formData.get("unit") || "serving",
  });

  if (d.childId === d.parentId) {
    throw new Error("A recipe can't be a sub-recipe of itself.");
  }
  // Guard against cycles: the new child must not already use the parent.
  if (await usesRecipe(d.childId, d.parentId)) {
    throw new Error("That would create a circular sub-recipe reference.");
  }

  const child = await prisma.recipe.findUnique({ where: { id: d.childId } });
  await prisma.recipeComponent.upsert({
    where: { parentId_childId: { parentId: d.parentId, childId: d.childId } },
    create: d,
    update: { quantity: d.quantity, unit: d.unit },
  });
  await logChange(d.parentId, user, "Added sub-recipe", `${child?.name ?? "recipe"} (${d.quantity} ${d.unit})`);
  revalidatePath(`/recipes/${d.parentId}`);
}

export async function removeSubRecipe(formData: FormData) {
  const user = await requireRole("MANAGER");
  const id = String(formData.get("id"));
  const parentId = String(formData.get("parentId"));
  const existing = await prisma.recipeComponent.findUnique({ where: { id }, include: { child: true } });
  await prisma.recipeComponent.delete({ where: { id } });
  await logChange(parentId, user, "Removed sub-recipe", existing?.child.name);
  revalidatePath(`/recipes/${parentId}`);
}

// Does `recipeId` (transitively) already contain `targetId` as a component?
async function usesRecipe(recipeId: string, targetId: string): Promise<boolean> {
  const seen = new Set<string>();
  const stack = [recipeId];
  while (stack.length) {
    const current = stack.pop()!;
    if (current === targetId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    const components = await prisma.recipeComponent.findMany({
      where: { parentId: current },
      select: { childId: true },
    });
    for (const c of components) stack.push(c.childId);
  }
  return false;
}
