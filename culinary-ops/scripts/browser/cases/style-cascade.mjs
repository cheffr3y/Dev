import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { launchBrowser } from "../harness.mjs";

// Use production CSS: Next's chunk ordering and Tailwind layer emission matter.
const directory = ".next/static/chunks";
const chunks = await Promise.all((await readdir(directory)).filter(name => name.endsWith(".css")).sort().map(name => readFile(`${directory}/${name}`, "utf8")));
const css = chunks.filter(text => text.includes("--sched-col-cook") || text.includes(".smoke-card")).join("\n");
assert.ok(css.includes(".smoke-card") && css.includes("--sched-col-cook"), "Build the application before checking its cascade");
const browser = await launchBrowser();
try {
  for (const width of [1500, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    await page.setContent(`<style>${css}</style><div class="ops-theme">
      <div id="card" class="bg-white p-4">Card</div>
      <div class="data-table-scroll overflow-x-auto"><table><thead><tr><th id="header">Heading</th></tr></thead><tbody><tr><td id="cell" class="p-4">Quantity</td></tr></tbody></table></div>
      <div class="print-document"><div class="print-controller no-print" id="controller">Print</div><div id="paper" class="recipe-dossier"><h1 class="recipe-title">Recipe</h1></div></div>
      <div class="workspace-inspector inspector-dossier" id="inspector">Inspector</div>
      <main class="smoking"><div class="smoke-card" id="smoke"><input id="input"><button id="button">Save</button></div></main>
      <div class="smoke-card" id="outside">Unrelated route</div>
    </div>`);
    const value = (id, property) => page.locator(`#${id}`).evaluate((el, prop) => getComputedStyle(el).getPropertyValue(prop), property);
    assert.equal(await value("card", "background-color"), "rgb(21, 31, 48)");
    assert.equal(await value("cell", "padding-top"), "2px", "Operational density overrides utility padding");
    assert.equal(await value("header", "position"), "sticky");
    assert.equal(await value("paper", "background-color"), "rgb(255, 255, 255)");
    assert.equal(await value("smoke", "padding-top"), width === 390 ? "16px" : "22px");
    assert.equal(await value("outside", "padding-top"), "0px", "Smoking styles must not leak outside the workspace");
    assert.equal(await value("input", "font-size"), "16px");
    assert.equal(await value("button", "min-height"), "44px");
    await page.emulateMedia({ media: "print" });
    assert.equal(await value("controller", "display"), "none");
    assert.equal(await value("inspector", "display"), "none");
    assert.equal(await value("paper", "min-width"), "0px");
    assert.equal(await value("paper", "background-color"), "rgb(255, 255, 255)");
    assert.equal(await value("header", "position"), "static");
    await page.close();
  }
  console.log("Production cascade: dark workspace, paper previews, dense tables, mobile smoking controls, route isolation and print resets passed.");
} finally {
  await browser.close();
}
