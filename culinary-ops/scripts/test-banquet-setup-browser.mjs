// Uses only the disposable fixtures served by PREP_BROWSER_SMOKE=1.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(process.env.PREP_PLAYWRIGHT_MODULE || "playwright");
const base = "http://localhost:3107";
const browser = await chromium.launch({ headless: true,
  ...(process.env.PREP_BROWSER_EXECUTABLE ? { executablePath: process.env.PREP_BROWSER_EXECUTABLE } : {}),
});
const contexts = [];
const output = process.env.BANQUET_REVIEW_DIR || "/tmp/banquet-setup-review";
await mkdir(output, { recursive: true });
async function login(role) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, timezoneId: "America/Chicago" });
  contexts.push(context);
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  await page.goto(`${base}/login`);
  await page.getByLabel("Email").fill(`${role}@local.test`);
  await page.getByLabel("Password").fill("local-smoke-only");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(`${base}/`);
  return page;
}
async function save(page) {
  await page.getByRole("button", { name: "Save setup", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Saved to banquet." }).waitFor();
}
try {
  const manager = await login("manager");
  const setupUrl = `${base}/banquets/banquet-setup-smoke/setup`;
  await manager.goto(`${base}/banquets/banquet-setup-smoke`);
  await manager.getByRole("link", { name: "Setup & vessel pull →" }).click();
  await manager.getByRole("button", { name: "Add unassigned BEO food lines" }).click();
  await manager.getByLabel("Station name", { exact: true }).fill("Dinner buffet");
  await manager.getByLabel("Service / ready time").fill("Ready 4:45 pm · Serve 5 pm");
  const rows = manager.locator(".setup-edit-item");
  assert.equal(await rows.count(), 2);
  for (let i = 0; i < 2; i++) {
    const row = rows.nth(i);
    await row.getByRole("button", { name: "+ Add pull item" }).click();
    await row.getByLabel("Pull item name").fill(i ? "  boos   block " : "Boos Block");
    await row.getByLabel("Pull quantity").fill(i ? "1" : "2");
  }
  const shared = manager.getByRole("heading", { name: "Shared station equipment" }).locator("..");
  await shared.getByRole("button", { name: "+ Add pull item" }).click();
  await shared.getByLabel("Pull category").selectOption("equipment");
  await shared.getByLabel("Pull item name").fill("Heatlamp");
  await save(manager);
  await manager.reload();
  assert.equal(await rows.first().getByLabel("Pull quantity").inputValue(), "2");
  await manager.screenshot({ path: `${output}/editor.png`, fullPage: true });
  await manager.getByRole("button", { name: "Pack & pull", exact: true }).click();
  const block = manager.locator("label").filter({ hasText: "Boos Block" });
  assert.match(await block.innerText(), /3 ×/);
  await block.getByRole("checkbox").click();
  await manager.getByRole("status").filter({ hasText: "Saved to banquet." }).waitFor();

  // Staff may verify pieces, but never edit the station plan.
  const staff = await login("staff");
  await staff.goto(setupUrl);
  assert.equal(await staff.getByRole("button", { name: "Edit setup", exact: true }).count(), 0);
  assert.equal(await staff.getByRole("button", { name: "Save setup", exact: true }).count(), 0);
  assert.equal(await staff.locator("label").filter({ hasText: "Boos Block" }).getByRole("checkbox").isChecked(), true);
  await staff.locator("label").filter({ hasText: "Heatlamp" }).getByRole("checkbox").click();
  await staff.getByRole("status").filter({ hasText: "Saved to banquet." }).waitFor();

  // A concurrent packing save must reject stale manager edits.
  await manager.getByRole("button", { name: "Edit setup", exact: true }).click();
  await manager.getByLabel("Station notes").fill("Stale edit must not overwrite packing");
  await manager.getByRole("button", { name: "Save setup", exact: true }).click();
  await manager.getByRole("status").filter({ hasText: "changed in another session" }).waitFor();
  manager.once("dialog", d => d.accept());
  await manager.reload();
  assert.equal(await manager.getByLabel("Station notes").inputValue(), "");
  await rows.first().getByLabel("Pull quantity").fill("4");
  await save(manager);
  await manager.getByRole("button", { name: "Pack & pull", exact: true }).click();
  assert.match(await block.innerText(), /5 ×/);
  assert.equal(await block.getByRole("checkbox").isChecked(), false);
  assert.equal(await manager.locator("label").filter({ hasText: "Heatlamp" }).getByRole("checkbox").isChecked(), true);

  await manager.getByRole("button", { name: "Print preview", exact: true }).click();
  await manager.emulateMedia({ media: "print" });
  assert.equal(await manager.getByRole("button", { name: "Edit setup", exact: true }).isVisible(), false);
  await manager.pdf({ path: `${output}/setup.pdf`, format: "Letter", printBackground: true });
  await manager.locator(".banquet-setup-sheet").screenshot({ path: `${output}/print.png` });
  await manager.emulateMedia({ media: "screen" });
  await manager.setViewportSize({ width: 390, height: 844 });
  await manager.getByRole("button", { name: "Edit setup", exact: true }).click();
  assert.equal(await manager.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await manager.screenshot({ path: `${output}/mobile.png`, fullPage: true });
  await manager.setViewportSize({ width: 1440, height: 1100 });
  await manager.goto(`${base}/banquets/banquet-setup-smoke/packet`);
  await manager.locator(".banquet-setup-sheet").getByText("Consolidated pull checklist").waitFor();
  assert.ok((await manager.locator(".recipe-packet").innerText()).includes("Tuesday, December 1, 2026"));
  await manager.emulateMedia({ media: "print" });
  await manager.pdf({ path: `${output}/cook-packet.pdf`, format: "Letter", printBackground: true });
  await manager.goto(`${base}/banquets/week/2026-11-30/packet`);
  await manager.locator(".banquet-setup-sheet").getByText("Consolidated pull checklist").waitFor();
  // A full banquet must paginate by rows instead of clipping an entire station.
  await manager.emulateMedia({ media: "screen" });
  await manager.goto(setupUrl);
  for (let i = 3; i <= 24; i++) {
    await manager.getByRole("button", { name: "+ Add food / garnish" }).click();
    const item = manager.locator(".setup-edit-item").last();
    await item.getByLabel("Food / item", { exact: true }).fill(`Service selection ${i}`);
    await item.getByLabel("Service notes").fill("Refill from kitchen. Confirm placement with banquet captain.");
    await item.getByRole("button", { name: "+ Add pull item" }).click();
    await item.getByLabel("Pull item name").fill("Square Tray (Small)");
  }
  await save(manager);
  await manager.getByRole("button", { name: "Print preview", exact: true }).click();
  await manager.emulateMedia({ media: "print" });
  await manager.pdf({ path: `${output}/large-setup.pdf`, format: "Letter", printBackground: true });
  console.log("Banquet setup: persistence, aggregation, staff packing, stale-write rejection, quantity invalidation, mobile and both packet integrations passed.");
} catch (error) {
  for (const context of contexts) for (const page of context.pages()) {
    console.error("Stopped at", page.url());
    await page.screenshot({ path: `${output}/failure-${contexts.indexOf(context)}.png`, fullPage: true }).catch(() => {});
  }
  throw error;
} finally {
  for (const context of contexts) await context.close();
  await browser.close();
}
