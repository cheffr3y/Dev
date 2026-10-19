import test from "node:test";
import assert from "node:assert/strict";
import { advanceHomestead as step, createHomestead, homesteadSchema, importHomestead, isRipe, FRIENDS, FRIEND_IDS, PROJECT_IDS, CROP_IDS, TOOL_IDS, type HomesteadState, type HomesteadAction } from "./homestead";

const tick = (s: HomesteadState, count = 1) => { for (let i = 0; i < count; i++) s = step(s, { type: "tick" }).state; return s; };
const click = (r: number, c: number): HomesteadAction => ({ type: "tile", r, c });

test("starter garden validates, and transitions do not mutate the previous save", () => {
  const original = createHomestead(), before = structuredClone(original);
  homesteadSchema.parse(original);
  const result = step(original, click(2, 2));
  assert.deepEqual(original, before);
  assert.equal(result.state.resources.coins, 63);
  assert.equal(result.state.resources.crops, 6);
  assert.equal(result.state.grid[14].crop, null);
});

test("harvesting with Plant keeps the selected tool and seed in the saved state", () => {
  let s = step(createHomestead(), { type: "seed", seed: "clover" }).state;
  s = step(s, click(2, 2)).state;
  assert.equal(s.selectedTool, "plant"); assert.equal(s.selectedSeed, "clover");
  s = step(s, click(2, 2)).state;
  assert.deepEqual(s.grid[14].crop, { id: "clover", growth: 0 });
});

test("watering gives one double-growth boost, cannot be spammed, and crop durations differ", () => {
  let s = step(createHomestead(), { type: "seed", seed: "pumpkin" }).state;
  s = step(s, click(0, 0)).state;
  s = step(s, { type: "tool", tool: "water" }).state;
  s = step(s, click(0, 0)).state;
  const once = structuredClone(s);
  s = step(s, click(0, 0)).state;
  assert.deepEqual(s, once); assert.equal(s.grid[0].crop?.growth, 0);
  s = tick(s); assert.equal(s.grid[0].crop?.growth, 2); assert.equal(s.grid[0].watered, false);
  assert.equal(isRipe(s.grid[0]), false);
  s = tick(s); assert.equal(isRipe(s.grid[0]), true);
});

test("companion rewards match the guide, only once per day, and renew at morning", () => {
  for (const id of FRIEND_IDS) {
    let s = createHomestead(); s.companions[id].unlocked = true;
    const before = { ...s.resources };
    s = step(s, { type: "pet", id }).state;
    assert.equal(s.resources.coins - before.coins, FRIENDS[id].coins);
    assert.equal(s.resources.wood - before.wood, FRIENDS[id].wood);
    const gift = { ...s.resources };
    s = step(s, { type: "pet", id }).state; assert.deepEqual(s.resources, gift);
    s = tick(s, 4); s = step(s, { type: "pet", id }).state;
    assert.equal(s.resources.coins, gift.coins + FRIENDS[id].coins);
  }
});

test("planting or tilling an occupied companion tile is rejected", () => {
  for (const tool of ["plant", "hoe", "water"] as const) {
    const s = step(createHomestead(), { type: "tool", tool }).state;
    assert.deepEqual(step(s, click(3, 2)).state.grid[20], s.grid[20]);
  }
});

test("pond restoration relocates planted crops and displaced companions", () => {
  let s = createHomestead();
  s.grid[28] = { ...s.grid[28], terrain: "soil", debris: null, crop: { id: "clover", growth: 1 }, watered: true };
  s.grid[20].companion = null; s.grid[29].companion = "chick";
  s = step(s, { type: "restore", id: "hippo_pond" }).state;
  assert.equal(s.grid[28].terrain, "pond"); assert.equal(s.grid[28].crop, null);
  assert.ok(s.grid.some(t => t.crop?.id === "clover" && t.crop.growth === 1 && t.watered));
  assert.ok(s.grid.some(t => t.companion === "chick" && t.terrain !== "pond"));
  homesteadSchema.parse(s);
});

test("a full meadow blocks destructive pond construction without charging materials", () => {
  const s = createHomestead();
  s.grid.forEach(t => { t.terrain = "soil"; t.debris = null; t.companion = null; t.crop = { id: "pumpkin", growth: 0 }; });
  const result = step(s, { type: "restore", id: "hippo_pond" });
  assert.equal(result.state, s); assert.match(result.message, /Clear a little space/);
});

test("restorations are one-time, expansion order never shrinks the grid, and cannot overspend", () => {
  let s = createHomestead(); s.resources = { wood: 100, stone: 100, coins: 200, crops: 0 };
  s = step(s, { type: "restore", id: "flower_arch" }).state;
  assert.equal(s.gridSize, 8); assert.equal(s.companions.capybara.unlocked, true);
  s = step(s, { type: "restore", id: "cozy_barn" }).state;
  assert.equal(s.gridSize, 8); assert.equal(s.grid.length, 64);
  const before = structuredClone(s);
  assert.deepEqual(step(s, { type: "restore", id: "cozy_barn" }).state, before);
  s.resources.wood = 0;
  assert.equal(step(s, { type: "restore", id: "hippo_pond" }).state, s);
  homesteadSchema.parse(s);
});

test("friend unlocks require ripe crops and stay unlocked after harvest", () => {
  let s = createHomestead(); s.grid[0] = { ...s.grid[0], terrain: "soil", crop: { id: "sunberry", growth: 0 } };
  s = tick(s); assert.equal(s.companions.fox.unlocked, false);
  s = tick(s); assert.equal(s.companions.fox.unlocked, true);
  s = step(s, click(0, 0)).state; s = step(s, click(2, 2)).state;
  assert.equal(s.companions.fox.unlocked, true);
});

test("welcome parcel is once only; daily foraging works even with a fully planted meadow", () => {
  let s = step(createHomestead(), { type: "gift" }).state;
  assert.equal(s.resources.wood, 37); assert.equal(s.resources.coins, 155);
  assert.deepEqual(step(s, { type: "gift" }).state.resources, s.resources);
  s.grid.forEach(t => { t.terrain = "soil"; t.debris = null; t.companion = null; t.crop = { id: "sunberry", growth: 0 }; });
  s = step(s, { type: "forage" }).state;
  const wood = s.resources.wood;
  assert.equal(step(s, { type: "forage" }).state.resources.wood, wood);
  s = tick(s, 4); s = step(s, { type: "forage" }).state;
  assert.equal(s.resources.wood, wood + 3);
});

test("imports preserve original HTML progress and repair hidden companion overlaps", () => {
  const s = createHomestead();
  const old = { ...s, version: 1, lastSavedAt: 1,
    grid: s.grid.map(t => ({ ...t, crop: t.crop ? { id: t.crop.id, stage: isRipe(t) ? 3 : 2 } : null })),
    companions: Object.fromEntries(FRIEND_IDS.map(id => [id, { ...s.companions[id], petsToday: 0 }])),
  };
  old.grid[20].terrain = "soil"; old.grid[20].crop = { id: "sunberry", stage: 2 };
  const imported = importHomestead(old);
  assert.equal(imported.version, 2); assert.deepEqual(imported.resources, s.resources);
  assert.equal(imported.grid[20].companion, null);
  assert.ok(imported.grid.some(t => t.companion === "chick"));
  assert.equal(imported.grid[14].crop?.growth, 2);
  assert.equal(imported.carePackageClaimed, true);
});

test("save validation rejects corrupt coordinates, entities, versions, and resources", () => {
  const bad = [
    { ...createHomestead(), version: 100 }, { ...createHomestead(), grid: [] },
    { ...createHomestead(), resources: { coins: -1, wood: 0, stone: 0, crops: 0 } },
    { ...createHomestead(), selectedSeed: "<script>" },
  ];
  const duplicate = createHomestead(); duplicate.grid[1] = duplicate.grid[0]; bad.push(duplicate);
  const crop = createHomestead(); crop.grid[0].crop = { id: "pumpkin", growth: 0 }; bad.push(crop);
  for (const input of bad) assert.throws(() => importHomestead(input));
});

test("mixed long-running gameplay always yields a valid save", () => {
  let s = createHomestead();
  for (let i = 0; i < 400; i++) {
    const actions: HomesteadAction[] = [
      { type: "tick" }, { type: "seed", seed: CROP_IDS[i % 4] }, click(i % s.gridSize, (i * 3) % s.gridSize),
      { type: "tool", tool: TOOL_IDS[i % 5] }, click((i * 2) % s.gridSize, i % s.gridSize),
      { type: "restore", id: PROJECT_IDS[i % 3] }, { type: "pet", id: FRIEND_IDS[i % 6] }, { type: "forage" }, { type: "sell" },
    ];
    for (const action of actions) { s = step(s, action).state; homesteadSchema.parse(s); }
  }
});
