import { launchBrowser, browserBaseUrl } from "../harness.mjs";
// Run with PREP_BROWSER_SMOKE=1 scripts/test-prep-postgres.sh serving fixtures.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const base = browserBaseUrl();
const browser = await launchBrowser();
const contexts = [];
async function login(role) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  contexts.push(context);
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.setDefaultNavigationTimeout(10000);
  await page.goto(`${base}/login`);
  await page.getByLabel("Email").fill(`${role}@local.test`);
  await page.getByLabel("Password").fill("local-smoke-only");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(`${base}/`);
  return page;
}
async function save(form) {
  const response = form.page().waitForResponse(response => response.request().method() === "POST");
  await form.getByRole("button", { name: "Save", exact: true }).click();
  await response;
}
async function editCream(page) {
  await page.goto(`${base}/items`);
  const row = page.getByRole("row").filter({ hasText: "Allergen test cream" });
  const href = await row.getByRole("link", { name: "edit / usage", exact: true }).getAttribute("href");
  await page.goto(base + href);
  return page.locator("#ingredientForm");
}
try {
  const manager = await login("manager");
  await manager.goto(`${base}/items`);
  await manager.getByRole("heading", { name: "Ingredients", exact: true }).waitFor();
  assert.ok(await manager.getByRole("link", { name: "Ingredients", exact: true }).count());
  const edit = await editCream(manager);
  await edit.getByRole("checkbox", { name: "Milk", exact: true }).check();
  await edit.getByRole("checkbox", { name: "Soy", exact: true }).check();
  await save(edit);
  console.log("Ingredient allergen edit saved.");
  await manager.goto(`${base}/items`);
  const creamRow = manager.getByRole("row").filter({ hasText: "Allergen test cream" });
  await creamRow.getByRole("list", { name: "Ingredient allergens" }).getByText("Milk", { exact: true }).waitFor();
  await manager.goto(`${base}/recipes`);
  const soupPath = await manager.getByRole("link", { name: "Allergen test soup", exact: true }).getAttribute("href");
  await manager.goto(base + soupPath);
  const soupUrl = manager.url();
  const form = manager.locator("#recipeForm");
  for (const key of ["milk", "soy", "mustard"]) {
    const checkbox = form.locator(`input[name="allergen"][value="${key}"]`);
    assert.equal(await checkbox.isChecked(), true);
    assert.equal(await checkbox.isDisabled(), true);
  }
  assert.equal(await form.locator('input[value="wheat"]').isChecked(), true);
  assert.deepEqual(await form.evaluate(el => new FormData(el).getAll("allergen")), ["wheat"]);
  console.log("Nested ingredient tags are locked; only the manual selection submits.");
  const saveRecipe = manager.waitForResponse(response => response.request().method() === "POST");
  await form.getByRole("button", { name: "Save changes", exact: true }).click();
  await saveRecipe;
  console.log("Recipe save completed.");
  await manager.reload();
  assert.equal(await form.locator('input[value="wheat"]').isChecked(), true);
  await manager.goto(`${soupUrl}/print`);
  const profile = manager.locator(".recipe-specs > div").last();
  for (const label of ["Milk", "Wheat", "Soy", "Mustard"]) assert.ok((await profile.innerText()).includes(label));
  assert.equal((await profile.innerText()).includes("Eggs"), false);
  if (process.env.INGREDIENT_REVIEW_DIR) {
    await mkdir(process.env.INGREDIENT_REVIEW_DIR, { recursive: true });
    await manager.locator(".recipe-dossier").screenshot({ path: join(process.env.INGREDIENT_REVIEW_DIR, "inherited-allergen-print.png") });
  }
  const clear = await editCream(manager);
  await clear.getByRole("checkbox", { name: "Milk", exact: true }).uncheck();
  await clear.getByRole("checkbox", { name: "Soy", exact: true }).uncheck();
  await save(clear);
  await manager.goto(`${base}/items`);
  await manager.getByRole("row").filter({ hasText: "Allergen test cream" }).getByText("None recorded", { exact: true }).waitFor();
  await manager.goto(`${soupUrl}/print`);
  const afterClear = await profile.innerText();
  assert.ok(afterClear.includes("Wheat") && afterClear.includes("Mustard"));
  assert.ok(!afterClear.includes("Milk") && !afterClear.includes("Soy"));
  console.log("Ingredient saves and clearing propagate through nested recipes and prints; manual tags survive recipe saves.");

  await manager.goto(`${base}/items`);
  await manager.getByText("+ Add ingredient", { exact: true }).click();
  const create = manager.locator("form").filter({ has: manager.getByRole("button", { name: "Add ingredient", exact: true }) });
  const newIngredient = `Allergen test mayonnaise ${Date.now()}`;
  await create.getByLabel("Name", { exact: true }).fill(newIngredient);
  await create.getByRole("checkbox", { name: "Eggs", exact: true }).check();
  const created = manager.waitForResponse(response => response.request().method() === "POST");
  await create.getByRole("button", { name: "Add ingredient", exact: true }).click();
  await created;
  const newRow = manager.getByRole("row").filter({ hasText: newIngredient });
  await newRow.getByRole("list", { name: "Ingredient allergens" }).getByText("Eggs", { exact: true }).waitFor();
  console.log("New ingredient allergen tags persisted.");
  if (process.env.INGREDIENT_REVIEW_DIR) {
    await manager.getByText("+ Add ingredient", { exact: true }).click();
    await manager.screenshot({ path: join(process.env.INGREDIENT_REVIEW_DIR, "ingredients.png"), fullPage: true });
  }
  const staff = await login("staff");
  await staff.goto(`${base}/items`);
  assert.equal(await staff.getByText("+ Add ingredient", { exact: true }).count(), 0);
  assert.equal(await staff.getByRole("link", { name: "edit / usage", exact: true }).count(), 0);
  await staff.getByRole("row").filter({ hasText: newIngredient }).getByText("Eggs", { exact: true }).waitFor();
  await staff.goto(soupUrl);
  await staff.getByText("Wheat, Mustard", { exact: true }).waitFor();
  console.log("Ingredient creation persists tags; staff can read ingredients and inherited recipe allergens without editing controls.");
} catch (error) {
  for (const context of contexts) for (const page of context.pages()) {
    console.error("Browser check stopped at", page.url());
    if (process.env.INGREDIENT_REVIEW_DIR) {
      await mkdir(process.env.INGREDIENT_REVIEW_DIR, { recursive: true });
      await page.screenshot({ path: join(process.env.INGREDIENT_REVIEW_DIR, "failure.png"), fullPage: true });
    }
  }
  throw error;
} finally {
  for (const context of contexts) await context.close();
  await browser.close();
}
