// Run with MENU_ROLLOUT_BROWSER_SMOKE=1 PREP_BROWSER_SMOKE=1
// scripts/test-prep-postgres.sh. All records live in its disposable database.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const url = new URL(process.env.DATABASE_URL || "postgresql://invalid");
assert.equal(process.env.PREP_DISPOSABLE_DB, "1");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.pathname, "/prep_workflow_test");
const prisma = new PrismaClient();
const { chromium } = await import(process.env.PREP_PLAYWRIGHT_MODULE || "playwright");
const base = "http://localhost:3107";
const output = process.env.MENU_REVIEW_DIR || "/tmp/menu-rollout-review";
await mkdir(output, { recursive: true });
const stamp = Date.now().toString(36);
const vendor = await prisma.vendor.create({ data: { name: "Atelier Market" } });
const itemNames = ["Leeks", "Spinach", "Herbs", "Shallot", "Lemon", "White beans", "Cider vinegar", "Olive oil", "Bread", "Cream", "Butter", "Yogurt", "Black pepper", "Sea salt", "Coriander"];
const items = await Promise.all(itemNames.map((name, i) => prisma.item.create({ data: {
  name, category: i < 5 ? "Produce" : i < 9 ? "Dry Goods" : i < 12 ? "Dairy" : "Spices & Seasonings",
  unit: "lb", unitCost: 2, vendorId: vendor.id, sku: `AT-${i}`, gcode: `G-${i}`, packSize: "4 x 1 lb",
  allergens: i >= 9 && i < 12 ? "milk" : null,
  priceUpdatedAt: i === 1 ? new Date("2025-01-01") : new Date(),
} })));
const unpriced = await prisma.item.create({ data: { name: "Unpriced seed oil", unit: "qt", unitCost: 0, vendorId: vendor.id } });
const foundation = await prisma.recipe.create({ data: { name: "Botanical Base", prodCode: `B${stamp}`, yieldQty: 1, yieldUnit: "qt", instructions: "Blend — Pulse the prepared herbs for 15 seconds.", items: { create: { itemId: unpriced.id, quantity: 1, unit: "qt" } } } });
const child = await prisma.recipe.create({ data: { name: "House Herb Emulsion", prodCode: `E${stamp}`, yieldQty: 2, yieldUnit: "qt", instructions: "Emulsify — Blend the base under high shear for 1 minute.", components: { create: { childId: foundation.id, quantity: 1, unit: "qt" } } } });
const dish = await prisma.recipe.create({ data: {
  name: "Autumn Greens & Warm Herb Emulsion", prodCode: `D${stamp}`, yieldQty: 10, yieldUnit: "each", menuPrice: 15,
  category: "Salad", station: "Garde Manger", prepMinutes: 20, cookMinutes: 10, shelfLife: "2 days refrigerated", storage: "Keep covered and labelled.\nHold dressing separately.", criticalNotes: "Use clean utensils. Label and date each container.",
  instructions: [
    "Prepare — Wash and drain the greens. Trim the leeks and reserve the tender leaves.",
    "Blanch — Lower the greens into boiling water for 15 seconds, then transfer to an Ice Bath.",
    "Drain — Squeeze gently and spread the greens on a clean towel until dry.",
    "Warm — Heat the beans over medium heat for 1 minute, stirring gently.",
    "Emulsify — Fold in the house emulsion and season with lemon and salt.",
    "Toast — Cook the bread until golden brown, then cool on a rack.",
    "Plate — Arrange the greens and beans in a shallow bowl. Spoon over the warm dressing.",
    "Finish — Add herbs and toasted crumbs. Check seasoning and send immediately.",
  ].join("\n"),
  items: { create: items.map((item, i) => ({ itemId: item.id, quantity: 2, unit: "oz", note: i % 3 === 0 ? "washed, trimmed and prepared" : null, sortOrder: i })) },
  components: { create: { childId: child.id, quantity: 1, unit: "qt" } },
} });
const second = await prisma.recipe.create({ data: { name: "Seasonal Soup", prodCode: `S${stamp}`, yieldQty: 8, yieldUnit: "each", menuPrice: 12, instructions: "Finish — Fold in the house emulsion and serve.", components: { create: { childId: child.id, quantity: 1, unit: "qt" } } } });
const venue = await prisma.venue.findFirstOrThrow();
const banquet = await prisma.banquet.create({ data: { name: "Atelier Launch Service", venueId: venue.id, date: new Date("2026-10-20T18:00:00Z"), timeLabel: "6–9 pm", guestCount: 24, menuItems: { create: { recipeId: dish.id, orderedQty: 20, unit: "each" } } } });
const browser = await chromium.launch({ headless: true, ...(process.env.PREP_BROWSER_EXECUTABLE ? { executablePath: process.env.PREP_BROWSER_EXECUTABLE } : {}) });
const page = await browser.newPage({ viewport: { width: 1536, height: 1150 } });
page.setDefaultTimeout(10000);
const errors = [];
page.on("pageerror", error => errors.push(error.message));

async function save(form, buttonName) {
  const response = page.waitForResponse(response => response.request().method() === "POST");
  await form.getByRole("button", { name: buttonName, exact: true }).click();
  await response;
  await page.waitForLoadState("networkidle");
}
async function pdf(name) {
  await page.emulateMedia({ media: "print" });
  await page.pdf({ path: join(output, `${name}.pdf`), preferCSSPageSize: true, printBackground: true });
  await page.emulateMedia({ media: "screen" });
}
try {
  await page.goto(`${base}/login`);
  await page.getByLabel("Email").fill("manager@local.test");
  await page.getByLabel("Password").fill("local-smoke-only");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(`${base}/`);
  await page.goto(`${base}/recipes/${dish.id}/print`);
  await page.locator(".recipe-dossier").waitFor();
  assert.equal(await page.locator(".recipe-ingredient").count(), 16);
  assert.ok(!(await page.locator(".recipe-dossier").innerText()).includes("$"));
  assert.equal(await page.locator(".cost-audit-stamp").count(), 0);
  await pdf("recipe-15-ingredients");
  await page.getByRole("link", { name: "4 times standard batch", exact: true }).click();
  await page.locator(".recipe-specs").getByText("40 each", { exact: true }).waitFor();
  assert.match(await page.locator(".recipe-specs").innerText(), /40 each/);
  await pdf("recipe-4x");

  await page.goto(`${base}/recipes/${dish.id}`);
  assert.match(await page.getByRole("status").innerText(), /Unpriced seed oil/);
  const ingredientRow = page.getByRole("row").filter({ hasText: "Leeks" });
  await ingredientRow.getByText("Edit ingredient", { exact: true }).click();
  const ingredientForm = ingredientRow.locator("form").first();
  await ingredientForm.getByLabel("Group (optional)").fill("Blanching Greens");
  await ingredientForm.getByLabel("Sort order").fill("0");
  await save(ingredientForm, "Save ingredient line");
  assert.equal((await prisma.recipeItem.findUniqueOrThrow({ where: { recipeId_itemId: { recipeId: dish.id, itemId: items[0].id } } })).groupName, "Blanching Greens");
  await page.goto(`${base}/recipes/${dish.id}/print`);
  assert.match(await page.locator(".recipe-workspace").innerText(), /Blanching Greens/i);
  assert.match(await page.locator(".recipe-workspace").innerText(), /Ungrouped/i);

  await page.goto(`${base}/menus`);
  await page.getByText("+ New Menu Rollout", { exact: true }).click();
  const headerForm = page.locator("form");
  await headerForm.getByLabel("Name", { exact: true }).fill(`Atelier Autumn Launch ${stamp}`);
  await headerForm.getByLabel("Subtitle").fill("Two dishes · Autumn service");
  await headerForm.getByLabel("Venue", { exact: true }).selectOption(venue.id);
  await save(headerForm, "Create menu rollout →");
  await page.waitForURL(/\/menus\/[^/]+$/);
  const rolloutId = page.url().split("/").at(-1);
  for (const recipe of [dish, second]) {
    const form = page.locator("#new-menu-line");
    await form.getByPlaceholder("Search recipes & builds…").fill(recipe.name);
    await form.getByRole("button", { name: new RegExp(recipe.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).click();
    await form.getByLabel("Section", { exact: true }).fill("Small Plates");
    await form.getByLabel("Menu description / service notes").fill("Seasonal greens, house herbs and warm emulsion.");
    await save(form, "Add recipe to rollout");
    await page.reload();
  }
  await page.getByLabel(`Menu price for ${dish.name}`, { exact: true }).fill("18");
  await page.getByLabel(`Opening par for ${dish.name}`, { exact: true }).fill("2.5");
  const engineeringRow = page.getByRole("row").filter({ has: page.getByRole("link", { name: dish.name, exact: true }) });
  await save(engineeringRow, "Save row");
  const saved = await prisma.menuRolloutItem.findUniqueOrThrow({ where: { rolloutId_recipeId: { rolloutId, recipeId: dish.id } } });
  assert.equal(saved.menuPrice, 18);
  assert.equal(saved.parBatches, 2.5);
  assert.match(await engineeringRow.locator(".menu-opening-yield").innerText(), /Opening: 25 each/);
  await page.screenshot({ path: join(output, "workspace.png"), fullPage: true });
  for (const mode of ["all", "costing", "order-guide", "allergens", "recipes"]) {
    await page.goto(`${base}/menus/${rolloutId}/packet?mode=${mode}`);
    await page.locator(".atelier-cover").waitFor();
    assert.equal(await page.locator(".launch-recipe-sheet").count(), ["all", "recipes"].includes(mode) ? 4 : 0);
    assert.equal(await page.locator("#costing").count(), ["all", "costing"].includes(mode) ? 1 : 0);
    assert.equal(await page.locator("#order-guide").count(), ["all", "order-guide"].includes(mode) ? 1 : 0);
    assert.equal(await page.locator("#allergens").count(), ["all", "allergens"].includes(mode) ? 1 : 0);
    if (["all", "recipes"].includes(mode)) {
      const plated = page.locator(`#dish-${saved.id}`);
      assert.match(await plated.locator(".recipe-hero").innerText(), /2.5× Batch/);
      assert.match(await plated.locator(".recipe-opening-prep").innerText(), /Target yield: 25 each.*Standard batch: 10 each/);
      const leeks = plated.locator(".recipe-ingredient").filter({ hasText: "Leeks" });
      assert.match(await leeks.innerText(), /5 oz/);
      const emulsion = page.locator(`#sub-${child.id}`);
      assert.match(await emulsion.locator(".recipe-hero").innerText(), /1.75× Batch/);
      assert.match(await emulsion.locator(".recipe-opening-prep").innerText(), /Target yield: 3.5 qt.*Standard batch: 2 qt/);
      const baseCard = page.locator(`#sub-${foundation.id}`);
      assert.match(await baseCard.locator(".recipe-opening-prep").innerText(), /Opening prep: 1.75×.*Target yield: 1.75 qt/);
    }
    if (mode === "recipes") {
      assert.equal(await page.locator(".cost-audit-stamp").count(), 0);
      assert.match(await page.locator(`#sub-${foundation.id}`).innerText(), /Used in: Autumn Greens.*Seasonal Soup/);
    }
    if (mode === "costing") assert.match(await page.locator(".cost-audit-stamp").innerText(), /Cost Understated/);
    if (mode === "order-guide") assert.match(await page.locator("#order-guide").innerText(), /AT-0.*G-0/s);
    await pdf(`packet-${mode}`);
  }
  await page.goto(`${base}/banquets/${banquet.id}/prep-sheet`);
  assert.match(await page.locator(".atelier-header").innerText(), /24 guests/);
  assert.ok(await page.locator(".print-sheet table").count() > 0);
  const staff = await browser.newPage();
  await staff.goto(`${base}/login`);
  await staff.getByLabel("Email").fill("staff@local.test");
  await staff.getByLabel("Password").fill("local-smoke-only");
  await staff.getByRole("button", { name: "Sign in", exact: true }).click();
  await staff.waitForURL(`${base}/`);
  await staff.goto(`${base}/menus/${rolloutId}`);
  assert.equal(await staff.locator("#new-menu-line").count(), 0);
  assert.equal(await staff.getByRole("button", { name: "Save row", exact: true }).count(), 0);
  assert.deepEqual(errors, []);
  console.log(`Menu creation, dish edits, grouping, nested audits, five packet modes, staff access, and print checks passed. Review: ${output}`);
} catch (error) {
  await page.screenshot({ path: join(output, "failure.png"), fullPage: true });
  console.error("Menu browser check stopped at", page.url());
  throw error;
} finally {
  await browser.close();
  await prisma.$disconnect();
}
