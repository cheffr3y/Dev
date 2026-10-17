// Uses only the disposable fixtures served by scripts/test-prep-postgres.sh.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
const { chromium } = await import(process.env.PREP_PLAYWRIGHT_MODULE || "playwright");
const base = "http://localhost:3107";
const browser = await chromium.launch({ headless: true, ...(process.env.PREP_BROWSER_EXECUTABLE ? { executablePath: process.env.PREP_BROWSER_EXECUTABLE } : {}) });
const contexts = [];
async function login(role) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  contexts.push(context);
  const page = await context.newPage(); page.setDefaultTimeout(10000); page.setDefaultNavigationTimeout(10000);
  await page.goto(`${base}/login`); await page.getByLabel("Email").fill(`${role}@local.test`); await page.getByLabel("Password").fill("local-smoke-only");
  await page.getByRole("button", { name: "Sign in", exact: true }).click(); await page.waitForURL(`${base}/`);
  return page;
}
async function save(page, form, name) {
  const response = page.waitForResponse(response => response.request().method() === "POST");
  await form.getByRole("button", { name, exact: true }).click(); await response;
}
async function screenshot(page, name) {
  if (process.env.INGREDIENT_REVIEW_DIR) { await mkdir(process.env.INGREDIENT_REVIEW_DIR, { recursive: true }); await page.screenshot({ path: join(process.env.INGREDIENT_REVIEW_DIR, name), fullPage: true }); }
}
try {
  const page = await login("manager");
  await page.goto(`${base}/items?q=roma&flag=duplicates`);
  const oldRow = page.getByRole("row").filter({ hasText: "Roma Tomato" }).filter({ has: page.getByRole("cell", { name: "ROMA", exact: true }) });
  const keptRow = page.getByRole("row").filter({ hasText: "ROMA-KEEP" });
  const sourcePath = await oldRow.getByRole("link", { name: "edit / usage", exact: true }).getAttribute("href");
  const targetPath = await keptRow.getByRole("link", { name: "edit / usage", exact: true }).getAttribute("href");
  const source = sourcePath.split("/").at(-1), target = targetPath.split("/").at(-1);
  await page.goto(base + targetPath);
  const ingredient = page.locator("#ingredientForm");
  await ingredient.getByLabel("Pack quantity", { exact: true }).fill("160");
  await ingredient.getByLabel("Pack unit", { exact: true }).fill("oz");
  await ingredient.getByLabel("Usable yield factor").fill("0.9");
  await save(page, ingredient, "Save"); await page.reload();
  assert.equal(await ingredient.getByLabel("Pack quantity", { exact: true }).inputValue(), "160");
  await page.getByRole("link", { name: "Cleanup test salad", exact: true }).waitFor();
  await screenshot(page, "ingredient-editor.png");
  await page.goto(`${base}/recipes`);
  const soupPath = await page.getByRole("link", { name: "Cleanup test soup", exact: true }).getAttribute("href");
  await page.goto(base + soupPath);
  await page.getByText("Edit ingredient", { exact: true }).click();
  const line = page.locator("form").filter({ has: page.getByRole("button", { name: "Save ingredient line", exact: true }) });
  await line.getByLabel("Quantity", { exact: true }).fill("3");
  await line.locator('textarea[name="note"]').fill("finely diced");
  await save(page, line, "Save ingredient line");
  await page.getByRole("status").filter({ hasText: "Ingredient line saved." }).waitFor();
  await page.reload();
  await page.getByText("finely diced", { exact: true }).last().waitFor();
  console.log("Full ingredient editor persists structured pack data; recipe lines edit quantities and notes directly.");
  await page.goto(`${base}/items/merge?source=${source}&target=${target}`);
  await page.getByRole("heading", { name: "Compare and replace", exact: true }).waitFor();
  await page.getByRole("cell").filter({ hasText: /^24 oz/ }).waitFor();
  await screenshot(page, "duplicate-comparison.png");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Apply reviewed replacement", exact: true }).click();
  await page.waitForURL(`${base}/items/cleanup?done=1`);
  await page.getByRole("status").waitFor();
  await page.goto(base + soupPath);
  await page.getByRole("row").filter({ hasText: "Tomato, Roma" }).filter({ hasText: "finely diced" }).waitFor();
  await page.getByText("finely diced", { exact: true }).last().waitFor();
  const soupRow = page.getByRole("row").filter({ hasText: "Tomato, Roma" }).filter({ hasText: "finely diced" });
  assert.match(await soupRow.innerText(), /3 oz/);
  await page.goto(`${base}/items?q=roma`);
  assert.equal(await page.locator(`a[href="${sourcePath}"]`).count(), 0);
  const kept = page.getByRole("row").filter({ hasText: "ROMA-KEEP" });
  assert.equal((await kept.getByRole("cell").nth(9).innerText()).trim(), "2");
  await screenshot(page, "ingredient-list.png");
  console.log("Reviewed consolidation replaces two recipes, converts/sums matching quantities, retains prep notes and removes only the confirmed duplicate.");
  const staff = await login("staff"); await staff.goto(`${base}/items/cleanup`); await staff.waitForURL(`${base}/`);
  await staff.goto(base + targetPath); assert.equal(await staff.locator("#ingredientForm").count(), 0);
  console.log("Cleanup writes and full ingredient editing remain manager-only; staff can inspect usage.");
} catch (error) {
  for (const context of contexts) for (const page of context.pages()) { console.error("Cleanup browser check stopped at", page.url()); await screenshot(page, "cleanup-failure.png"); }
  throw error;
} finally { for (const context of contexts) await context.close(); await browser.close(); }
