import { launchBrowser, browserBaseUrl } from "../harness.mjs";
// Run against PREP_BROWSER_SMOKE=1 scripts/test-prep-postgres.sh only.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";


const base = browserBaseUrl();
const output = process.env.RECIPE_REVIEW_DIR || "/tmp/recipe-costing-review";
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
page.setDefaultTimeout(10000);
await mkdir(output, { recursive: true });

async function openRecipe(name) {
  await page.goto(`${base}/recipes`);
  await page.getByRole("link", { name, exact: true }).click();
  await page.getByRole("heading", { name, exact: true }).waitFor();
  return page.url();
}

async function setYield(qty, unit) {
  const form = page.locator("#recipeForm");
  await form.locator('[name="yieldQty"]').fill(String(qty));
  await form.locator('[name="yieldUnit"]').fill(unit);
  const response = page.waitForResponse((response) => response.request().method() === "POST");
  await form.getByRole("button", { name: "Save changes", exact: true }).click();
  await response;
  await page.reload();
}

try {
  await page.goto(`${base}/login`);
  await page.getByLabel("Email").fill("manager@local.test");
  await page.getByLabel("Password").fill("local-smoke-only");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(`${base}/`);

  const soup = await openRecipe("Cleanup test soup");
  await setYield(5, "lb");
  await page.getByText("Cost / lb", { exact: true }).waitFor();
  await page.getByRole("link", { name: "Print Recipe Card", exact: true }).click();
  assert.equal(await page.getByRole("heading", { name: "Recipe Costing", exact: true }).count(), 0);
  assert.ok(!(await page.locator(".recipe-dossier").innerText()).includes("$"));
  await page.getByRole("navigation", { name: "Recipe print content" }).getByRole("link", { name: "With costing", exact: true }).click();
  const costs = page.locator(".recipe-costing");
  await costs.getByText("Cost / lb", { exact: true }).waitFor();
  assert.match(await costs.innerText(), /\$0\.25/);
  assert.match(await costs.innerText(), /\$0\.05/);
  await page.getByRole("button", { name: "4 times standard batch", exact: true }).click();
  assert.equal(new URL(page.url()).searchParams.get("costs"), "1");
  await page.locator(".recipe-specs").getByText("20 lb", { exact: true }).waitFor();
  assert.match(await costs.innerText(), /\$1\.00/);
  assert.match(await costs.innerText(), /\$0\.05/);
  const ingredient = costs.getByRole("row").filter({ hasText: "Roma Tomato" });
  assert.match(await ingredient.innerText(), /8 oz/);
  await page.locator(".recipe-dossier").screenshot({ path: join(output, "batch-costing.png") });
  await page.emulateMedia({ media: "print" });
  assert.equal(await page.getByRole("button", { name: "Print recipe with costing", exact: true }).isVisible(), false);
  assert.equal(await costs.isVisible(), true);
  await page.pdf({ path: join(output, "batch-costing.pdf"), preferCSSPageSize: true, printBackground: true });
  await page.emulateMedia({ media: "screen" });
  await page.getByRole("navigation", { name: "Recipe print content" }).getByRole("link", { name: "Kitchen copy", exact: true }).click();
  assert.equal(new URL(page.url()).searchParams.get("scale"), "4");
  await costs.waitFor({ state: "detached" });
  assert.equal(await costs.count(), 0);
  console.log("Kitchen/costing toggle and 4x batch quantities, totals, fixed rates, and print visibility passed.");

  for (const [qty, unit, label, amount] of [[1000, "gram", "g", "$0.00025"], [4, "servings", "serving", "$0.0625"]]) {
    await page.goto(soup);
    await setYield(qty, unit);
    await page.getByText(`Cost / ${label}`, { exact: true }).waitFor();
    await page.getByRole("link", { name: "Print with Costing", exact: true }).click();
    await costs.getByText(`Cost / ${label}`, { exact: true }).waitFor();
    assert.ok((await costs.innerText()).includes(amount));
  }
  await page.goto(`${base}/recipes`);
  const row = page.getByRole("row").filter({ hasText: "Cleanup test soup" });
  assert.match(await row.innerText(), /\$0\.0625 \/ serving/);
  console.log("Gram precision, serving labels, direct costing link, and catalog rate labels passed.");

  await openRecipe("Allergen test soup");
  await page.getByRole("link", { name: "Print with Costing", exact: true }).click();
  await costs.getByText("Cost / qt", { exact: true }).waitFor();
  await page.getByRole("button", { name: "2 times standard batch", exact: true }).click();
  const component = costs.getByRole("row").filter({ hasText: "Allergen test sauce" });
  await component.getByText("2 qt", { exact: true }).waitFor();
  assert.match(await component.innerText(), /2 qt/);
  assert.match(await component.innerText(), /\$2\.00 \/ qt/);
  assert.match(await component.innerText(), /\$4\.00/);
  await page.locator(".recipe-dossier").screenshot({ path: join(output, "subrecipe-costing.png") });
  await page.emulateMedia({ media: "print" });
  await page.pdf({ path: join(output, "subrecipe-costing.pdf"), preferCSSPageSize: true, printBackground: true });
  console.log("Nested sub-recipe unit costs and 2x batch totals passed. Review files:", output);
} catch (error) {
  await page.screenshot({ path: join(output, "failure.png"), fullPage: true });
  console.error("Recipe costing check stopped at", page.url());
  throw error;
} finally {
  await browser.close();
}
