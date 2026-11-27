import { launchBrowser, browserBaseUrl } from "../harness.mjs";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

// Dietary tags and allergen review: Needs attention list, ingredient form,
// recipe roll-up and override, and review warnings beside price warnings.
// Uses the event-planning fixtures (Planning tomatoes → sauce → dinner plate).
const url = new URL(process.env.DATABASE_URL || "postgresql://invalid");
assert.equal(process.env.PREP_DISPOSABLE_DB, "1"); assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.pathname, "/prep_workflow_test");
const db = new PrismaClient(), base = browserBaseUrl(), output = "/tmp/dietary-review", errors = [];
await mkdir(output, { recursive: true });
const browser = await launchBrowser();
let page;
async function login(role, viewport = { width: 1440, height: 1000 }) {
  const context = await browser.newContext({ viewport, timezoneId: "America/Chicago" });
  const p = await context.newPage(); p.setDefaultTimeout(15000); p.on("pageerror", error => errors.push(error.message));
  await p.goto(`${base}/login`); await p.getByLabel("Email").fill(`${role}@local.test`); await p.getByLabel("Password").fill("local-smoke-only");
  await p.getByRole("button", { name: "Sign in", exact: true }).click(); await p.waitForURL(`${base}/`); return p;
}
try {
  await db.item.update({ where: { id: "planning-item" }, data: { diet: null, allergenReviewedAt: null } });
  await db.recipe.update({ where: { id: "planning-dish" }, data: { dietOverride: null, dietOverrideNote: null } });
  page = await login("admin");

  // Recipe shows unknown diet and a review warning before anything is tagged.
  const openCompliance = async () => { await page.goto(`${base}/recipes/planning-dish`); await page.getByRole("tab", { name: "HACCP & Compliance" }).click(); };
  await openCompliance();
  const diet = page.getByRole("region", { name: "Diet" });
  await diet.waitFor();
  assert.match(await diet.innerText(), /Not confirmed/); assert.match(await diet.innerText(), /Planning tomatoes/);

  // Needs attention: tag vegan and confirm the label in one step.
  await page.goto(`${base}/items/attention?all=1`);
  await page.getByRole("heading", { name: "Needs attention", exact: true }).waitFor();
  const row = page.locator("li").filter({ has: page.getByRole("link", { name: "Planning tomatoes", exact: true }) });
  await row.getByLabel("Diet for Planning tomatoes").selectOption("vegan");
  await row.getByRole("button", { name: "Label checked" }).click();
  await page.waitForFunction(() => !document.body.innerText.includes("Diet for Planning tomatoes"));
  const item = await db.item.findUniqueOrThrow({ where: { id: "planning-item" } });
  assert.equal(item.diet, "vegan"); assert.ok(item.allergenReviewedAt && Date.now() - item.allergenReviewedAt.getTime() < 60000);
  await page.screenshot({ path: `${output}/needs-attention.png`, fullPage: true });

  // Roll-up through the sub-recipe: dish is vegan, no review warning.
  await openCompliance();
  await diet.waitFor(); assert.match(await diet.innerText(), /Vegan/); assert.doesNotMatch(await diet.innerText(), /review due/i);

  // Override by hand needs a note; with one it saves and is labelled.
  await page.getByLabel("Set diet by hand").selectOption("vegetarian");
  await page.getByLabel("Why (required when set by hand)").fill("Finished with butter on the pass");
  await page.getByRole("button", { name: "Save Changes", exact: true }).click();
  await page.waitForFunction(() => document.body.innerText.includes("Set by hand: Finished with butter on the pass"));
  const dish = await db.recipe.findUniqueOrThrow({ where: { id: "planning-dish" } });
  assert.equal(dish.dietOverride, "vegetarian"); assert.equal(dish.dietOverrideNote, "Finished with butter on the pass");
  assert.match(await diet.innerText(), /Ingredients alone say: Vegan/);
  await page.screenshot({ path: `${output}/recipe-diet.png`, fullPage: true });

  // Ingredient form: review checkbox stamps the date; leaving it off keeps it.
  await db.item.update({ where: { id: "planning-item" }, data: { allergenReviewedAt: new Date("2025-01-01T12:00:00Z") } });
  await page.goto(`${base}/items/planning-item`);
  await page.getByText(/over 6 months ago/).waitFor();
  await page.getByLabel("I checked the allergens and diet against the current product label").check();
  await page.locator("#ingredientForm").getByRole("button", { name: "Save", exact: true }).click();
  await page.getByText(/Last reviewed .*\d{4}\. Reviews are due/).waitFor();
  assert.ok((await db.item.findUniqueOrThrow({ where: { id: "planning-item" } })).allergenReviewedAt.getTime() > Date.now() - 60000);

  // Warnings sit beside price warnings on a prep sheet when review lapses.
  await db.item.update({ where: { id: "planning-item" }, data: { allergenReviewedAt: null } });
  await page.goto(`${base}/banquets/planning-wedding/prep-sheet`);
  await page.getByText(/allergen review due/).first().waitFor();

  // Staff see the list but can't change it.
  const staff = await login("staff");
  await staff.goto(`${base}/items/attention`);
  await staff.getByRole("heading", { name: "Needs attention", exact: true }).waitFor();
  assert.equal(await staff.getByRole("button", { name: "Label checked" }).count(), 0);
  const phone = await login("admin", { width: 390, height: 844 });
  await phone.goto(`${base}/items/attention`);
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await phone.screenshot({ path: `${output}/needs-attention-phone.png`, fullPage: true });
  assert.deepEqual(errors, []);
  console.log(`Needs attention quick review, ingredient label review, recipe roll-up and override, prep-sheet warning, staff read-only and phone layout passed. Review: ${output}`);
} catch (error) { if (page) await page.screenshot({ path: `${output}/failure.png`, fullPage: true }); throw error; }
finally { await browser.close(); await db.$disconnect(); }
