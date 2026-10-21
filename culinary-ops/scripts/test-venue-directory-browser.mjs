import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { VENUE_DIRECTORY } from "../lib/venue-directory.ts";

assert.equal(process.env.VENUE_DISPOSABLE_DB, "1");
const database = new URL(process.env.DATABASE_URL);
assert.equal(database.hostname, "127.0.0.1");
assert.equal(database.pathname, "/venue_test");
const prisma = new PrismaClient();
const directory = await prisma.venue.findMany({ where: { standardKey: { not: null } } });
assert.equal(directory.length, 12);
for (const expected of VENUE_DIRECTORY) {
  const actual = directory.find(venue => venue.standardKey === expected.key);
  assert.equal(actual?.name, expected.name);
  assert.equal(actual.parentId, expected.parentKey ? directory.find(venue => venue.standardKey === expected.parentKey).id : null);
}
assert.equal(directory.find(venue => venue.standardKey === "foxtown-brewpub").id, "venue-exact-brew");
assert.equal(directory.find(venue => venue.standardKey === "foxtown-heritage-meats").id, "venue-old-meats");
assert.equal(directory.find(venue => venue.standardKey === "foxtown-heritage-meats").code, "HM");
assert.equal(directory.find(venue => venue.standardKey === "station").code, "STA2");
const oldBrew = await prisma.venue.findUniqueOrThrow({ where: { id: "venue-old-brew" } });
assert.equal(oldBrew.standardKey, null);
assert.equal(oldBrew.name, "Foxtown Brewpub");
assert.equal((await prisma.venue.findUniqueOrThrow({ where: { id: "venue-ambiguous-banquets" } })).name, "Banquets");
assert.equal((await prisma.venue.findUniqueOrThrow({ where: { id: "venue-ambiguous-landing" } })).name, "Foxtown Landing");
assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: "venue-legacy-user" } })).homeVenueId, oldBrew.id);
assert.equal((await prisma.event.findUniqueOrThrow({ where: { id: "venue-legacy-event" } })).venueId, oldBrew.id);
assert.deepEqual((await prisma.inventoryItem.findMany({ orderBy: { id: "asc" } })).map(row => [row.venueId, row.quantity, row.par]), [["venue-exact-brew", 11, 12], [oldBrew.id, 7, 10]]);
assert.deepEqual((await prisma.prepPacketSnapshot.findUniqueOrThrow({ where: { id: "venue-history-snapshot" } })).contents, { venueId: oldBrew.id, venueName: "Foxtown Brewing", cost: 123.45 });
console.log("Migration preserves IDs, codes, separate stock, user/event assignments, ambiguous labels and frozen snapshots.");

const passwordHash = await bcrypt.hash("local-smoke-only", 4);
await prisma.user.createMany({ data: ["ADMIN", "MANAGER", "STAFF"].map(role => ({ name: role, email: `${role.toLowerCase()}@local.test`, passwordHash, role, homeVenueId: role === "MANAGER" ? oldBrew.id : directory[0].id })) });
const { chromium } = await import(process.env.PREP_PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true, ...(process.env.PREP_BROWSER_EXECUTABLE ? { executablePath: process.env.PREP_BROWSER_EXECUTABLE } : {}) });
const output = process.env.VENUE_REVIEW_DIR || "/tmp/venue-directory-review";
await mkdir(output, { recursive: true });
const contexts = [];
const errors = [];
let admin;
async function login(role) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: "America/Chicago" });
  contexts.push(context);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${process.env.AUTH_URL}/login`);
  await page.getByLabel("Email").fill(`${role}@local.test`);
  await page.getByLabel("Password").fill("local-smoke-only");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(`${process.env.AUTH_URL}/`);
  return page;
}
async function assertDirectory(select) {
  await select.waitFor({ state: "attached" });
  const result = await select.evaluate(element => ({
    options: Array.from(element.options).filter(option => option.value).map(option => option.textContent),
    groups: Array.from(element.querySelectorAll("optgroup")).map(group => ({ name: group.label, names: Array.from(group.querySelectorAll("option")).map(option => option.textContent) })),
  }));
  assert.deepEqual(result.options, VENUE_DIRECTORY.map(venue => venue.name));
  assert.deepEqual(result.groups.map(group => group.name), ["The Annex", "The Station"]);
}
async function save(page, form, name) {
  const request = page.waitForResponse(response => response.request().method() === "POST");
  await form.getByRole("button", { name, exact: true }).click();
  await (await request).finished();
  await page.waitForLoadState("domcontentloaded");
}
try {
  admin = await login("admin");
  for (const [route, selector] of [
    ["/to-go", '#new-to-go-rollup select[name="venueId"]'],
    ["/menus", 'select[name="venueId"]'],
    ["/events", 'select[name="venueId"]'],
    ["/banquets", 'select[name="venueId"]'],
    ["/festivals", 'select[name="venueId"]'],
    ["/admin/users", 'select[name="homeVenueId"]'],
    ["/prep-orders/requests", 'select[name="destinationVenueId"]'],
    ["/prep-orders/closeout", 'select[name="venueId"]'],
  ]) {
    await admin.goto(`${process.env.AUTH_URL}${route}`);
    await assertDirectory(admin.locator(selector).first());
  }
  await admin.goto(`${process.env.AUTH_URL}/prep-orders/report`);
  const report = admin.locator('select[name="venue"]');
  assert.ok((await report.locator("option").allTextContents()).includes("Banquets (legacy)"));
  assert.ok((await report.locator("option").allTextContents()).includes("Foxtown Landing (legacy)"));

  // Existing legacy selections survive an unrelated holiday settings save.
  await admin.goto(`${process.env.AUTH_URL}/to-go/venue-legacy-rollup`);
  await admin.getByText("Rollout settings", { exact: true }).click();
  const settings = admin.locator("#to-go-settings");
  assert.equal(await settings.locator('select[name="venueId"]').inputValue(), "venue-ambiguous-banquets");
  await settings.locator("details > summary").click();
  await settings.getByLabel("Planning notes").fill("Keep the original location while reviewing.");
  await save(admin, settings, "Save rollout settings");
  assert.equal((await prisma.toGoRollup.findUniqueOrThrow({ where: { id: "venue-legacy-rollup" } })).venueId, "venue-ambiguous-banquets");

  await admin.goto(`${process.env.AUTH_URL}/prep-orders/venue-legacy-request`);
  const requestSettings = admin.locator('form').filter({ has: admin.locator('select[name="destinationVenueId"]') });
  assert.equal(await requestSettings.locator('select[name="destinationVenueId"]').inputValue(), oldBrew.id);
  await requestSettings.getByLabel("Notes", { exact: true }).fill("Preserve legacy destination while editing notes.");
  await save(admin, requestSettings, "Save changes");
  assert.equal((await prisma.prepOrder.findUniqueOrThrow({ where: { id: "venue-legacy-request" } })).destinationVenueId, oldBrew.id);

  // A newly created holiday plan can select a room under its parent.
  await admin.goto(`${process.env.AUTH_URL}/to-go`);
  await admin.getByText("+ New HMR Rollout", { exact: true }).click();
  const create = admin.locator("#new-to-go-rollup");
  await create.getByLabel("Name", { exact: true }).fill("Room-specific holiday plan");
  await create.getByLabel("Start with", { exact: true }).selectOption("blank");
  const renards = directory.find(venue => venue.standardKey === "renards");
  await create.getByLabel("Venue", { exact: true }).selectOption(renards.id);
  await save(admin, create, "Create HMR rollout");
  await admin.waitForURL(/\/to-go\/[^/]+$/);
  const created = await prisma.toGoRollup.findFirstOrThrow({ where: { name: "Room-specific holiday plan" } });
  assert.equal(created.venueId, renards.id);

  await admin.goto(`${process.env.AUTH_URL}/venues`);
  await admin.getByRole("heading", { name: "Venues & Rooms", exact: true }).waitFor();
  assert.equal(await admin.getByRole("button", { name: "Add venue", exact: true }).count(), 0);
  assert.equal(await admin.locator('input[name="name"]').count(), 0);
  await admin.screenshot({ path: `${output}/directory.png`, fullPage: true });
  await admin.goto(`${process.env.AUTH_URL}/to-go`);
  await admin.getByText("+ New HMR Rollout", { exact: true }).click();
  await admin.screenshot({ path: `${output}/holiday-selector.png`, fullPage: true });

  // A legacy home venue still resolves its own stock; it must not silently
  // become the first standard venue after an upgrade.
  const manager = await login("manager");
  await manager.goto(`${process.env.AUTH_URL}/inventory`);
  assert.match(await manager.locator("body").innerText(), /Legacy stock item/);
  assert.equal(await manager.getByRole("row").filter({ hasText: "Legacy stock item" }).locator('input[name="quantity"]').inputValue(), "7");
  const staff = await login("staff");
  await staff.goto(`${process.env.AUTH_URL}/venues`);
  await staff.waitForURL(`${process.env.AUTH_URL}/`);
  await admin.setViewportSize({ width: 390, height: 844 });
  await admin.goto(`${process.env.AUTH_URL}/venues`);
  assert.ok(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await admin.screenshot({ path: `${output}/directory-mobile.png`, fullPage: true });
  assert.deepEqual(errors, []);
  console.log(`Grouped selectors across eight workflows, retained history filters, safe legacy edits, room selection, role checks and mobile layout passed. Review: ${output}`);
} catch (error) {
  if (admin) await admin.screenshot({ path: `${output}/failure.png`, fullPage: true });
  throw error;
} finally {
  await Promise.all(contexts.map(context => context.close()));
  await browser.close();
  await prisma.$disconnect();
}
