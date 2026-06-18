// Allergen catalog + helpers.
//
// A recipe stores only the allergens introduced by *its own* ingredients, as a
// comma-separated list of the canonical keys below (e.g. "milk,wheat,sesame").
// The allergens shown to cooks are the *effective* set: a recipe's own
// allergens unioned with those of every sub-recipe it's built from, computed on
// the fly so a sub-recipe edit always propagates upward.

export type AllergenGroup = "major" | "common";

export type Allergen = {
  key: string;
  label: string;
  group: AllergenGroup;
  hint?: string;
};

// FDA "Big 9" major allergens, then a few that come up constantly on the line.
export const ALLERGENS: Allergen[] = [
  { key: "milk", label: "Milk", group: "major" },
  { key: "eggs", label: "Eggs", group: "major" },
  { key: "fish", label: "Fish", group: "major" },
  { key: "shellfish", label: "Shellfish", group: "major", hint: "Crustacean" },
  { key: "tree_nuts", label: "Tree Nuts", group: "major" },
  { key: "peanuts", label: "Peanuts", group: "major" },
  { key: "wheat", label: "Wheat", group: "major" },
  { key: "soy", label: "Soy", group: "major" },
  { key: "sesame", label: "Sesame", group: "major" },
  { key: "gluten", label: "Gluten", group: "common" },
  { key: "allium", label: "Allium", group: "common", hint: "Onion / garlic" },
  { key: "mustard", label: "Mustard", group: "common" },
  { key: "sulfites", label: "Sulfites", group: "common" },
];

export const MAJOR_ALLERGENS = ALLERGENS.filter((a) => a.group === "major");
export const COMMON_ALLERGENS = ALLERGENS.filter((a) => a.group === "common");

const LABELS = new Map(ALLERGENS.map((a) => [a.key, a.label]));
const VALID = new Set(ALLERGENS.map((a) => a.key));

// Map legacy / free-text values onto canonical keys so older comma-separated
// entries (e.g. "dairy, tree nut") keep working after the switch to checkboxes.
const SYNONYMS: Record<string, string> = {
  dairy: "milk",
  cream: "milk",
  butter: "milk",
  cheese: "milk",
  egg: "eggs",
  crustacean: "shellfish",
  crustaceans: "shellfish",
  shrimp: "shellfish",
  prawn: "shellfish",
  crab: "shellfish",
  lobster: "shellfish",
  "tree nut": "tree_nuts",
  treenut: "tree_nuts",
  treenuts: "tree_nuts",
  nut: "tree_nuts",
  nuts: "tree_nuts",
  almond: "tree_nuts",
  walnut: "tree_nuts",
  pecan: "tree_nuts",
  cashew: "tree_nuts",
  peanut: "peanuts",
  soya: "soy",
  soybean: "soy",
  soybeans: "soy",
  onion: "allium",
  garlic: "allium",
  shallot: "allium",
  leek: "allium",
  "onion/garlic": "allium",
  sulfite: "sulfites",
  sulphite: "sulfites",
  sulphites: "sulfites",
};

function normalizeAllergen(raw: string): string | null {
  const k = raw.trim().toLowerCase();
  if (!k) return null;
  const underscored = k.replace(/[\s-]+/g, "_");
  if (VALID.has(underscored)) return underscored;
  return SYNONYMS[k] ?? SYNONYMS[underscored] ?? null;
}

// Parse a stored allergen string into a de-duplicated list of valid keys in the
// canonical catalog order. Unknown tokens are dropped.
export function parseAllergens(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const found = new Set<string>();
  for (const part of raw.split(",")) {
    const key = normalizeAllergen(part);
    if (key) found.add(key);
  }
  return ALLERGENS.filter((a) => found.has(a.key)).map((a) => a.key);
}

// Serialize selected keys back to storage form (canonical order, valid only).
export function serializeAllergens(keys: Iterable<string>): string {
  const set = new Set(keys);
  return ALLERGENS.filter((a) => set.has(a.key))
    .map((a) => a.key)
    .join(",");
}

export function allergenLabel(key: string): string {
  return LABELS.get(key) ?? key;
}

// Comma-joined human labels, e.g. "Milk, Wheat, Sesame".
export function allergenLabels(keys: string[]): string {
  return keys.map(allergenLabel).join(", ");
}

// Minimal shape needed to walk the sub-recipe tree.
export type AllergenNode = {
  name?: string;
  allergens: string | null;
  components: { childId: string }[];
};

// Effective allergens for a recipe: its own plus every sub-recipe's, recursively
// (cycle-safe), returned in canonical order.
export function effectiveAllergens(
  rootId: string,
  byId: Map<string, AllergenNode>,
): string[] {
  const acc = new Set<string>();
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const node = byId.get(id);
    if (!node) return;
    for (const k of parseAllergens(node.allergens)) acc.add(k);
    for (const c of node.components) visit(c.childId);
  };
  visit(rootId);
  return ALLERGENS.filter((a) => acc.has(a.key)).map((a) => a.key);
}

// Allergens contributed by a recipe's sub-recipes (recursively), excluding its
// own manual selections. Maps each inherited key to the name of a direct
// sub-recipe that introduces it, for an "via <sub-recipe>" note in the editor.
export function inheritedAllergenSources(
  rootId: string,
  byId: Map<string, AllergenNode>,
): Map<string, string> {
  const sources = new Map<string, string>();
  const root = byId.get(rootId);
  if (!root) return sources;
  const own = new Set(parseAllergens(root.allergens));
  const seen = new Set<string>([rootId]);
  const visit = (id: string, viaName: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const node = byId.get(id);
    if (!node) return;
    for (const k of parseAllergens(node.allergens)) {
      if (!own.has(k) && !sources.has(k)) sources.set(k, viaName);
    }
    for (const c of node.components) visit(c.childId, viaName);
  };
  for (const c of root.components) {
    const child = byId.get(c.childId);
    visit(c.childId, child?.name ?? "sub-recipe");
  }
  return sources;
}
