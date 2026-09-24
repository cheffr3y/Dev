// Run against scripts/test-prep-postgres.sh with PREP_BROWSER_SMOKE=1.
// PREP_PLAYWRIGHT_MODULE may point to a bundled Playwright index.mjs.
import assert from "node:assert/strict";
const { chromium } = await import(
  process.env.PREP_PLAYWRIGHT_MODULE || "playwright"
);
const base = "http://localhost:3107";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PREP_BROWSER_EXECUTABLE
    ? { executablePath: process.env.PREP_BROWSER_EXECUTABLE }
    : {}),
});
const contexts = [];
async function login(role) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });
  contexts.push(context);
  const page = await context.newPage();
  await page.goto(`${base}/login`);
  await page.getByLabel("Email").fill(`${role}@local.test`);
  await page.getByLabel("Password").fill("local-smoke-only");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(`${base}/`);
  return page;
}
try {
  const staff = await login("staff");
  await staff.goto(`${base}/prep-orders?date=2026-12-01`);
  assert.equal(
    await staff
      .getByRole("link", { name: "Closeout & Accounting", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await staff.getByText("Borracho Beans", { exact: true }).count(),
    1,
  );
  await staff.goto(`${base}/prep-orders/requests?date=2026-12-02`);
  assert.equal(
    await staff.locator("select[name=destinationVenueId] option").count(),
    1,
  );
  await staff.getByRole("button", { name: "Start order" }).click();
  await staff.waitForURL(/prep-orders\/[a-z0-9]+$/);
  await staff.getByPlaceholder("Search recipes…").fill("Borracho");
  await staff.getByRole("button").filter({ hasText: "Borracho Beans" }).click();
  await staff.locator("input[name=requestedQty]").fill("2");
  await staff.locator("select[name=requestedUnit]").selectOption("qt");
  await staff.getByRole("button", { name: "Add", exact: true }).click();
  await staff.getByRole("button", { name: "Edit", exact: true }).waitFor();
  await staff.getByRole("button", { name: "Edit", exact: true }).click();
  const edit = staff
    .locator("form")
    .filter({ has: staff.getByRole("button", { name: "Save", exact: true }) });
  await edit.locator("input[name=requestedQty]").fill("3");
  await edit.getByRole("button", { name: "Save", exact: true }).click();
  await staff.getByText("Butcher · 3 qt", { exact: false }).waitFor();
  console.log("Chef ordering, editing and assigned venue checks passed.");
  const manager = await login("manager");
  for (const page of [staff, manager]) {
    for (const path of [
      "/prep-orders/closeout",
      "/prep-orders/report",
      "/prep-orders/transfers/missing",
    ]) {
      await page.goto(base + path);
      await page.waitForURL(`${base}/prep-orders`);
    }
    for (const extension of ["export", "export-xlsx"]) {
      const response = await page.request.get(
        `${base}/prep-orders/report/${extension}?from=2026-12-01&to=2026-12-01`,
      );
      assert.equal(response.status(), 403);
    }
  }
  await manager.goto(`${base}/prep-orders?date=2026-12-01`);
  await manager
    .getByRole("button", { name: "Print prep sheet", exact: true })
    .click();
  await manager.waitForURL(/\/packet$/);
  await staff.goto(manager.url());
  assert.equal(await staff.getByText("Packet unavailable").count(), 0);
  console.log(
    "Manager packet generation, chef reprint and admin-only route/export checks passed.",
  );
  const admin = await login("admin");
  await admin.goto(`${base}/prep-orders/closeout?date=2026-12-01`);
  const beans = admin
    .locator("form[data-worksheet-row]")
    .filter({
      has: admin.getByRole("heading", { name: "Borracho Beans", exact: true }),
    });
  const sauce = admin
    .locator("form[data-worksheet-row]")
    .filter({
      has: admin.getByRole("heading", { name: "Sauce", exact: true }),
    });
  assert.equal(
    await beans.getByLabel("Made (qt)", { exact: true }).inputValue(),
    "",
  );
  await sauce.getByLabel("Made (qt)", { exact: true }).fill("9");
  await sauce.getByLabel("Cook", { exact: true }).fill("Keep my edit");
  await sauce.getByLabel("Production notes").fill("Do not lose this note");
  await beans.getByRole("button", { name: "Use ordered quantities" }).click();
  await beans.getByLabel("Cook", { exact: true }).fill("Jeff");
  await beans
    .getByLabel("Production notes")
    .fill("Brewpub supplied the bacon.");
  const destination = beans
    .locator("div.rounded-lg")
    .filter({
      has: admin.getByRole("heading", { name: "Foxtown Brewing", exact: true }),
    });
  await destination.locator("summary").click();
  await destination
    .getByRole("button", { name: "+ Supplied ingredient", exact: true })
    .click();
  await destination
    .getByLabel("Supplied ingredient", { exact: true })
    .selectOption({ label: "Bacon" });
  await destination.getByLabel("Supplied quantity", { exact: true }).fill("1");
  await destination
    .getByLabel("Supply note", { exact: true })
    .fill("Brewpub supplied the bacon.");
  await beans.locator("summary").filter({ hasText: "Labor" }).first().click();
  await beans.getByLabel("Dishwasher minutes", { exact: true }).fill("20");
  const actionRequest = admin.waitForRequest(
    (r) => r.method() === "POST" && r.headers()["next-action"],
  );
  await beans.getByRole("button", { name: "Preview charges" }).click();
  const captured = await actionRequest;
  await beans.getByRole("heading", { name: "Charges for this item" }).waitFor();
  const replay = await manager.request.post(captured.url(), {
    headers: {
      "next-action": captured.headers()["next-action"],
      "content-type": captured.headers()["content-type"],
    },
    data: captured.postData(),
    maxRedirects: 0,
  });
  assert.ok(
    (replay.headers()["x-action-redirect"] || "").startsWith("/prep-orders"),
    "manager must not invoke admin preview",
  );
  admin.once("dialog", (d) => d.dismiss());
  await admin
    .getByRole("link", { name: "View prep list", exact: true })
    .click();
  assert.ok(admin.url().includes("/closeout"));
  await beans.getByRole("button", { name: "Save item results" }).click();
  await admin.getByText("Made 8 qt", { exact: false }).waitFor();
  assert.equal(
    await sauce.getByLabel("Made (qt)", { exact: true }).inputValue(),
    "9",
  );
  assert.equal(
    await sauce.getByLabel("Cook", { exact: true }).inputValue(),
    "Keep my edit",
  );
  assert.equal(
    await sauce.getByLabel("Production notes").inputValue(),
    "Do not lose this note",
  );
  console.log(
    "Cost preview, forbidden action replay, unsaved warning and preservation across row saves passed.",
  );
  await sauce.getByRole("button", { name: "Use ordered quantities" }).click();
  await sauce.locator("summary").filter({ hasText: "Labor" }).first().click();
  await sauce.getByLabel("Dishwasher minutes", { exact: true }).fill("0");
  await sauce.getByRole("button", { name: "Preview charges" }).click();
  await sauce.getByRole("button", { name: "Save item results" }).click();
  await admin
    .getByText("All ordered items have results", { exact: false })
    .waitFor();
  await admin.getByRole("button", { name: "Finish day", exact: true }).click();
  await admin.getByText("Day finished", { exact: true }).waitFor();
  await admin.getByRole("link", { name: "Review & export accounting" }).click();
  await admin.waitForURL(/\/report\?from=2026-12-01&to=2026-12-01/);
  for (const extension of ["export", "export-xlsx"]) {
    const response = await admin.request.get(
      `${base}/prep-orders/report/${extension}?from=2026-12-01&to=2026-12-01`,
    );
    assert.equal(response.status(), 200);
    const bytes = await response.body();
    if (extension === "export")
      assert.ok(bytes.toString().includes("Brewpub supplied the bacon."));
    else assert.equal(bytes.subarray(0, 2).toString(), "PK");
  }
  console.log("Daily finish and accounting CSV/Excel downloads passed.");
} finally {
  for (const context of contexts) await context.close();
  await browser.close();
}
