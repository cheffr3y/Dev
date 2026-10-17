import assert from "node:assert/strict";
import test from "node:test";
import { methodCues } from "./method-cues";

test("method cues retain the parsley recipe's explicit techniques and times", () => {
  assert.deepEqual(methodCues("Blanch Parsley — Submerge parsley in boiling water until bright green, about 15 seconds."), [
    { kind: "technique", label: "Blanch" }, { kind: "technique", label: "Boiling water" },
    { kind: "time", label: "about 15 sec" },
  ]);
  assert.deepEqual(methodCues("Shock Parsley — Transfer immediately to an ice bath until completely cold. 1 minute."), [
    { kind: "technique", label: "Shock" }, { kind: "technique", label: "Ice bath" },
    { kind: "time", label: "1 min" },
  ]);
  assert.deepEqual(methodCues("Incorporate oil — Pulse in olive oil until combined."), [
    { kind: "technique", label: "Pulse" },
  ]);
});

test("cues prioritize explicit time and temperature ranges and cap each step at four", () => {
  assert.deepEqual(methodCues("Bake — Roast at 350–375°F for 20–25 minutes until golden brown."), [
    { kind: "technique", label: "Bake" }, { kind: "time", label: "20–25 min" },
    { kind: "temperature", label: "350–375°F" }, { kind: "endpoint", label: "Golden brown" },
  ]);
  const busy = methodCues("Cool — Chill from 135°F to 70°F within 2 hours, then to 41°F within 4 hours in an ice bath.");
  assert.equal(busy.length, 4);
  assert.deepEqual(busy.filter(cue => cue.kind === "temperature").map(cue => cue.label), ["135°F to 70°F", "41°F"]);
  assert.deepEqual(busy.filter(cue => cue.kind === "time").map(cue => cue.label), ["within 2 hr", "within 4 hr"]);
});

test("duration cues preserve qualifiers, fractions, compound durations and overnight", () => {
  for (const [input, label] of [
    ["Rest for at least 1 1/2 hours.", "at least 1 1/2 hr"],
    ["Rest for ½ hour.", "½ hr"],
    ["Rest for up to 1½ hours.", "up to 1½ hr"],
    ["Rest for 1 hr and 30 min.", "1 hr and 30 min"],
    ["Rest for 10min.", "10 min"],
    ["Chill overnight.", "Overnight"],
  ]) {
    assert.deepEqual(methodCues(input).filter(cue => cue.kind === "time"), [{ kind: "time", label }], input);
  }
});

test("temperature cues preserve limits, negative values, decimal values and degree notation", () => {
  for (const [input, label] of [
    ["Heat to at least 165 ° F.", "at least 165°F"],
    ["Do not exceed 180 degrees Fahrenheit.", "Do not exceed 180°F"],
    ["Freeze at -18°C.", "-18°C"],
    ["Hold at 63.5 degrees Celsius.", "63.5°C"],
  ]) {
    assert.deepEqual(methodCues(input).filter(cue => cue.kind === "temperature"), [{ kind: "temperature", label }], input);
  }
});

test("technique cues recognize accented verbs and specific multiword techniques", () => {
  for (const [input, label] of [
    ["Sauté — Cook the onions until translucent.", "Sauté"],
    ["Puree the soup.", "Purée"],
    ["Emulsify the dressing until smooth.", "Emulsify"],
    ["Deep-fry until golden brown.", "Deep-fry"],
    ["Use a high-shear blender.", "High shear"],
    ["Cook sous vide.", "Sous vide"],
  ]) {
    assert.equal(methodCues(input).find(cue => cue.kind === "technique")?.label, label, input);
  }
});

test("endpoints require a stated result rather than an ingredient description", () => {
  for (const [input, label] of [
    ["Cook until fork tender.", "Fork tender"],
    ["Whisk to soft peaks.", "Soft peaks"],
    ["Whisk until stiff peaks form.", "Stiff peaks"],
    ["Simmer until it coats the back of a spoon.", "Coats spoon"],
    ["Cook the pasta until al dente.", "Al dente"],
  ]) {
    assert.equal(methodCues(input).find(cue => cue.kind === "endpoint")?.label, label, input);
  }
  assert.equal(methodCues("Add smooth peanut butter and golden brown sugar.").filter(cue => cue.kind === "endpoint").length, 0);
});

test("negated techniques, ingredient names and unknown prose do not become cues", () => {
  assert.deepEqual(methodCues("Do not boil. Never use an ice bath. Fold in the cream.").filter(cue => cue.kind === "technique"), [
    { kind: "technique", label: "Fold" },
  ]);
  assert.deepEqual(methodCues("Combine roast beef, toast crumbs and smoked salt."), []);
  assert.deepEqual(methodCues("Do not cook until golden brown."), []);
  assert.deepEqual(methodCues("Squeeze out excess water thoroughly."), []);
  assert.deepEqual(methodCues(""), []);
});

test("repeated cues collapse across headings, prose and unit spellings", () => {
  const source = "Whisk — Whisk for 1 minute. Whisk again for 1 min.";
  assert.deepEqual(methodCues(source), [{ kind: "technique", label: "Whisk" }, { kind: "time", label: "1 min" }]);
});
