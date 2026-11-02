import test from "node:test";
import assert from "node:assert/strict";
import { inspectorStack, patchUrl } from "./url-state";

test("URL patches preserve other filters and anchors, encode values and remove cleared keys", () => {
  const href = patchUrl("https://example.test/recipes?q=sauce&category=Prep&new=1#costs", { q: "salt & pepper", inspect: ["recipe:r/1", "item:i:2"] });
  const url = new URL(href, "https://example.test");
  assert.equal(url.searchParams.get("q"), "salt & pepper");
  assert.equal(url.searchParams.get("new"), "1");
  assert.equal(url.hash, "#costs");
  assert.deepEqual(inspectorStack(url.searchParams), [{ kind: "recipe", id: "r/1" }, { kind: "item", id: "i:2" }]);
  const cleared = new URL(patchUrl(url.href, { inspect: null, category: "" }), url);
  assert.equal(cleared.searchParams.has("inspect"), false);
  assert.equal(cleared.searchParams.has("category"), false);
  assert.equal(cleared.searchParams.get("q"), "salt & pepper");
});

test("malformed inspector targets cannot request unsupported entity kinds", () => {
  assert.deepEqual(inspectorStack(new URLSearchParams("inspect=vendor:1&inspect=recipe:&inspect=item:valid")), [{ kind: "item", id: "valid" }]);
});
