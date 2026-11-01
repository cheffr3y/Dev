import assert from "node:assert/strict";
import { launchBrowser, browserBaseUrl } from "../harness.mjs";

const base = browserBaseUrl(), browser = await launchBrowser(), errors = [];
try {
  const guest = await browser.newPage();
  for (const route of ["/homestead", "/trivia"]) {
    await guest.goto(base + route);
    assert.equal(new URL(guest.url()).pathname, "/login");
  }
  await guest.goto(base + "/play");
  assert.equal(new URL(guest.url()).pathname, "/play", "public trivia joining stays public");
  await guest.close();

  for (const role of ["staff", "manager", "admin"]) {
    const context = await browser.newContext({ viewport: { width: role === "staff" ? 390 : 1440, height: 1000 } });
    const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
    await page.goto(base + "/login");
    await page.getByLabel("Email").fill(`${role}@local.test`);
    await page.getByLabel("Password").fill("local-smoke-only");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL(base + "/");
    await page.goto(base + "/homestead");
    await page.getByRole("heading", { name: /Willowbrook Acre/ }).waitFor();
    assert.equal(await page.locator(".games-shell").count(), 1);
    assert.equal(await page.locator(".ops-theme").count(), 0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.getByRole("navigation", { name: "Break room" }).getByRole("link", { name: "Trivia", exact: true }).click();
    await page.getByRole("heading", { name: "Trivia", exact: true }).waitFor();
    assert.equal(await page.locator(".ops-theme").count(), 0);
    await page.getByRole("link", { name: "Back to kitchen", exact: true }).click();
    await page.getByRole("heading", { name: "Morning Pulse", exact: true }).waitFor();
    assert.ok(await page.locator(".ops-theme").count() >= 1);
    assert.equal(await page.locator(".games-shell").count(), 0);
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log("Game shells passed: all roles, mobile layout, authentication, public join URLs, and return to operations.");
} finally { await browser.close(); }
