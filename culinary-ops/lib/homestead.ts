import { z } from "zod";

export const CROPS = {
  sunberry: { name: "Sunberry", icon: "🍓", ticks: 2, crops: 2, coins: 8, hint: "Grow two to invite Bramble." },
  pumpkin: { name: "Cozy Pumpkin", icon: "🎃", ticks: 3, crops: 3, coins: 14, hint: "A pond-side favorite of Moo Deng." },
  clover: { name: "Star Clover", icon: "🍀", ticks: 2, crops: 2, coins: 10, hint: "Biscuit’s favorite pasture snack." },
  hibiscus: { name: "Hibiscus", icon: "🌺", ticks: 2, crops: 0, coins: 15, hint: "Two blooms bring Mallow to visit." },
} as const;
export type CropId = keyof typeof CROPS;
export const CROP_IDS = Object.keys(CROPS) as CropId[];
export const PROJECTS = {
  hippo_pond: { name: "Pygmy Hippo Pond", icon: "🪷", wood: 10, stone: 8, coins: 25, hint: "A little spring for a little hippo. Adds two pond tiles." },
  cozy_barn: { name: "Redwood Cozy Barn", icon: "🏡", wood: 16, stone: 10, coins: 45, hint: "A warm hay loft for Biscuit. Opens a 7 × 7 meadow." },
  flower_arch: { name: "Wisteria Meadow Arch", icon: "🌸", wood: 22, stone: 16, coins: 80, hint: "A flower-covered welcome for Yuzu. Opens an 8 × 8 sanctuary." },
} as const;
export type ProjectId = keyof typeof PROJECTS;
export const PROJECT_IDS = Object.keys(PROJECTS) as ProjectId[];
export const FRIENDS = {
  chick: { name: "Pip", species: "Speckled chick", icon: "🐥", coins: 5, wood: 0, hint: "Your friend from the very first morning." },
  hippo: { name: "Moo Deng", species: "Pygmy hippo", icon: "🦛", coins: 12, wood: 0, hint: "Restore the pond and ripen one pumpkin." },
  fox: { name: "Bramble", species: "Mossy fox kit", icon: "🦊", coins: 8, wood: 3, hint: "Have two ripe sunberries growing together." },
  calf: { name: "Biscuit", species: "Highland calf", icon: "🐄", coins: 15, wood: 0, hint: "Restore the barn and grow one ripe clover." },
  sheep: { name: "Mallow", species: "Cloud sheep", icon: "🐑", coins: 12, wood: 0, hint: "Let two hibiscus flowers bloom together." },
  capybara: { name: "Yuzu", species: "Onsen capybara", icon: "🦫", coins: 20, wood: 0, hint: "Build the Wisteria Meadow Arch." },
} as const;
export type FriendId = keyof typeof FRIENDS;
export const FRIEND_IDS = Object.keys(FRIENDS) as FriendId[];
export const TOOLS = {
  gather: { name: "Gather", icon: "⛏️", hint: "Clear branches and stones, or harvest a ripe crop." },
  hoe: { name: "Till", icon: "🚜", hint: "Turn empty grass into soil, or return empty soil to grass." },
  plant: { name: "Plant", icon: "🌱", hint: "Choose a seed, then tap empty ground. Seeds are free." },
  water: { name: "Water", icon: "💧", hint: "Water once for double growth at the next time step." },
  pet: { name: "Befriend", icon: "🤚", hint: "Pet a friend for a gift once each garden day." },
} as const;
export type ToolId = keyof typeof TOOLS;
export const TOOL_IDS = Object.keys(TOOLS) as ToolId[];
export const PHASES = [
  { name: "Morning", icon: "🌤️" }, { name: "Afternoon", icon: "☀️" },
  { name: "Golden hour", icon: "🌅" }, { name: "Starry night", icon: "🌙" },
] as const;

const amount = z.number().int().min(0).max(1_000_000_000);
const cropId = z.enum(["sunberry", "pumpkin", "clover", "hibiscus"]);
const friendId = z.enum(["chick", "hippo", "fox", "calf", "sheep", "capybara"]);
const friendSchema = z.object({ unlocked: z.boolean(), hearts: z.number().int().min(0).max(5), lastGiftDay: amount });
const tileSchema = z.object({
  r: z.number().int().min(0).max(7), c: z.number().int().min(0).max(7),
  terrain: z.enum(["grass", "soil", "pond"]), watered: z.boolean(),
  debris: z.enum(["wood", "stone", "weeds"]).nullable(),
  crop: z.object({ id: cropId, growth: z.number().int().min(0).max(3) }).nullable(),
  companion: friendId.nullable(),
});
export const homesteadSchema = z.object({
  version: z.literal(2), day: z.number().int().min(1).max(1_000_000_000),
  timeIndex: z.number().int().min(0).max(3), gridSize: z.number().int().min(6).max(8),
  resources: z.object({ wood: amount, stone: amount, crops: amount, coins: amount }),
  selectedTool: z.enum(["gather", "hoe", "plant", "water", "pet"]), selectedSeed: cropId,
  projects: z.object({ hippo_pond: z.boolean(), cozy_barn: z.boolean(), flower_arch: z.boolean() }),
  companions: z.object({ chick: friendSchema, hippo: friendSchema, fox: friendSchema, calf: friendSchema, sheep: friendSchema, capybara: friendSchema }),
  grid: z.array(tileSchema).min(36).max(64),
  carePackageClaimed: z.boolean(), lastForageDay: amount,
}).superRefine((state, ctx) => {
  const invalid = (message: string) => ctx.addIssue({ code: "custom", message });
  const coords = new Set<string>();
  const placed = new Set<string>();
  if (state.grid.length !== state.gridSize ** 2) invalid("Incomplete meadow.");
  if (state.gridSize !== (state.projects.flower_arch ? 8 : state.projects.cozy_barn ? 7 : 6)) invalid("Meadow size does not match restorations.");
  if (!state.companions.chick.unlocked) invalid("Pip must be unlocked.");
  if (state.lastForageDay > state.day) invalid("Foraging date is in the future.");
  for (const friend of Object.values(state.companions)) {
    if (friend.lastGiftDay > state.day) invalid("Gift date is in the future.");
  }
  for (const tile of state.grid) {
    const key = `${tile.r},${tile.c}`;
    if (coords.has(key) || tile.r >= state.gridSize || tile.c >= state.gridSize) invalid("Invalid meadow coordinates.");
    coords.add(key);
    if (tile.crop && (tile.terrain !== "soil" || tile.crop.growth > CROPS[tile.crop.id].ticks)) invalid("Invalid crop.");
    if (tile.watered && tile.terrain !== "soil") invalid("Only soil can be watered.");
    if (tile.debris && tile.terrain !== "grass") invalid("Debris must be on grass.");
    if ([tile.debris, tile.crop, tile.companion].filter(Boolean).length > 1) invalid("Occupied tiles cannot overlap.");
    const pond = state.projects.hippo_pond && tile.r === 4 && (tile.c === 4 || tile.c === 5);
    if ((tile.terrain === "pond") !== pond) invalid("Invalid pond location.");
    if (tile.companion) {
      if (placed.has(tile.companion) || !state.companions[tile.companion].unlocked) invalid("Invalid visiting friend.");
      if (tile.terrain === "pond" && tile.companion !== "hippo") invalid("Only Moo Deng swims in the pond.");
      placed.add(tile.companion);
    }
  }
});
export type HomesteadState = z.infer<typeof homesteadSchema>;
export type Tile = HomesteadState["grid"][number];
export type HomesteadSave = { state: HomesteadState; revision: number };

function emptyTile(r: number, c: number): Tile {
  return { r, c, terrain: "grass", watered: false, debris: null, crop: null, companion: null };
}
export function createHomestead(): HomesteadState {
  const grid = Array.from({ length: 36 }, (_, i) => emptyTile(Math.floor(i / 6), i % 6));
  for (const i of [1, 17, 24, 33]) grid[i].debris = "wood";
  for (const i of [4, 18, 34]) grid[i].debris = "stone";
  for (const i of [9, 28]) grid[i].debris = "weeds";
  grid[14] = { ...grid[14], terrain: "soil", crop: { id: "sunberry", growth: 2 } };
  grid[15] = { ...grid[15], terrain: "soil", crop: { id: "pumpkin", growth: 1 } };
  grid[20].companion = "chick";
  return {
    version: 2, day: 1, timeIndex: 0, gridSize: 6,
    resources: { wood: 12, stone: 8, crops: 4, coins: 55 },
    selectedTool: "gather", selectedSeed: "sunberry",
    projects: { hippo_pond: false, cozy_barn: false, flower_arch: false },
    companions: Object.fromEntries(FRIEND_IDS.map(id => [id, { unlocked: id === "chick", hearts: id === "chick" ? 2 : 0, lastGiftDay: 0 }])) as HomesteadState["companions"],
    grid, carePackageClaimed: false, lastForageDay: 0,
  };
}

// Accept the original HTML's JSON export as well as native Mise backups.
// Legacy overlaps are repaired; unknown/malformed data is rejected, never rendered.
export function importHomestead(input: unknown): HomesteadState {
  const legacySchema = z.object({
    version: z.literal(1), day: z.number().int().min(1).max(1_000_000_000),
    grid: z.array(tileSchema.omit({ crop: true }).extend({
      crop: z.object({ id: cropId, stage: z.number().int().min(1).max(3) }).nullable(),
    })).min(36).max(64),
    companions: z.record(friendId, z.object({ unlocked: z.boolean(), hearts: z.number().int().min(0).max(5), petsToday: amount })),
  }).passthrough();
  if (input && typeof input === "object" && "version" in input && input.version === 1) {
    const old = legacySchema.parse(input);
    const migrated = {
      ...old, version: 2, carePackageClaimed: true, lastForageDay: 0,
      companions: Object.fromEntries(FRIEND_IDS.map(id => [id, {
        unlocked: old.companions[id].unlocked, hearts: old.companions[id].hearts, lastGiftDay: 0,
      }])),
      grid: old.grid.map(tile => ({ ...tile,
        watered: tile.terrain === "soil" && tile.watered,
        companion: tile.crop || tile.debris || tile.terrain === "pond" && tile.companion !== "hippo" ? null : tile.companion,
        crop: tile.crop ? { id: tile.crop.id, growth: Math.round((tile.crop.stage - 1) / 2 * CROPS[tile.crop.id].ticks) } : null,
      })),
    };
    const state = homesteadSchema.parse(migrated);
    placeFriends(state);
    return state;
  }
  return homesteadSchema.parse(input);
}

export function isRipe(tile: Tile) { return !!tile.crop && tile.crop.growth >= CROPS[tile.crop.id].ticks; }
export function tileDescription(tile: Tile): string {
  const content = tile.companion ? `${FRIENDS[tile.companion].name}, ${FRIENDS[tile.companion].species}`
    : tile.crop ? `${CROPS[tile.crop.id].name}, ${isRipe(tile) ? "ready to harvest" : `growing ${tile.crop.growth}/${CROPS[tile.crop.id].ticks}`}${tile.watered ? ", watered" : ""}`
    : tile.debris ? `fallen ${tile.debris}` : tile.terrain === "pond" ? "lily pond" : `empty ${tile.terrain}`;
  return `Row ${tile.r + 1}, column ${tile.c + 1}: ${content}`;
}

function placeFriends(state: HomesteadState) {
  for (const id of FRIEND_IDS) {
    if (!state.companions[id].unlocked || state.grid.some(t => t.companion === id)) continue;
    const empty = state.grid.filter(t => !t.crop && !t.debris && !t.companion && (id === "hippo" || t.terrain !== "pond"));
    const tile = id === "hippo" ? empty.find(t => t.terrain === "pond") ?? empty[0] : empty[0];
    if (tile) tile.companion = id;
  }
}
function unlockFriends(state: HomesteadState) {
  const count = (id: CropId) => state.grid.filter(t => t.crop?.id === id && isRipe(t)).length;
  const eligible = { chick: true, hippo: state.projects.hippo_pond && count("pumpkin") > 0,
    fox: count("sunberry") >= 2, calf: state.projects.cozy_barn && count("clover") > 0,
    sheep: count("hibiscus") >= 2, capybara: state.projects.flower_arch };
  const newcomers: string[] = [];
  for (const id of FRIEND_IDS) {
    if (eligible[id] && !state.companions[id].unlocked) {
      state.companions[id] = { unlocked: true, hearts: 1, lastGiftDay: 0 };
      newcomers.push(FRIENDS[id].name);
    }
  }
  placeFriends(state);
  return newcomers.length ? ` ${newcomers.join(" and ")} arrived!` : "";
}
function expand(state: HomesteadState, size: number) {
  if (state.gridSize >= size) return;
  const oldSize = state.gridSize;
  const grid = [];
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    const tile = state.grid.find(t => t.r === r && t.c === c) ?? emptyTile(r, c);
    if ((r >= oldSize || c >= oldSize) && (r + c) % 3 === 0) tile.debris = (r + c) % 2 ? "wood" : "stone";
    grid.push(tile);
  }
  state.gridSize = size;
  state.grid = grid;
}
export type HomesteadAction =
  | { type: "tool"; tool: ToolId } | { type: "seed"; seed: CropId }
  | { type: "tile"; r: number; c: number } | { type: "pet"; id: FriendId }
  | { type: "restore"; id: ProjectId } | { type: "tick" } | { type: "sell" }
  | { type: "forage" } | { type: "gift" };

function pet(state: HomesteadState, id: FriendId): string {
  const friend = state.companions[id];
  if (!friend.unlocked) return FRIENDS[id].hint;
  if (friend.lastGiftDay === state.day) return `${FRIENDS[id].name} is happy to see you. Another gift tomorrow!`;
  friend.hearts = Math.min(5, friend.hearts + 1);
  friend.lastGiftDay = state.day;
  state.resources.coins += FRIENDS[id].coins;
  state.resources.wood += FRIENDS[id].wood;
  return `${FRIENDS[id].name} brought ${FRIENDS[id].coins} coins${FRIENDS[id].wood ? ` and ${FRIENDS[id].wood} wood` : ""}. Thank you, friend!`;
}
function harvest(state: HomesteadState, tile: Tile) {
  const crop = CROPS[tile.crop!.id];
  state.resources.crops += crop.crops;
  state.resources.coins += crop.coins;
  tile.crop = null;
  tile.watered = false;
  return `Picked ${crop.name}: +${crop.coins} coins${crop.crops ? ` and ${crop.crops} harvests` : ""}.`;
}
function useTile(state: HomesteadState, tile: Tile) {
  const tool = state.selectedTool;
  if (tile.companion) return tool === "gather" || tool === "pet" ? pet(state, tile.companion) : `${FRIENDS[tile.companion].name} is resting here. Choose another tile.`;
  if (tool === "pet") return "Tap a visiting friend, or choose one in the field guide.";
  if (tile.terrain === "pond") return "The spring ripples gently. A lovely spot for Moo Deng.";
  if (tile.debris) {
    if (tool !== "gather") return "Use Gather to clear this spot first.";
    const kind = tile.debris;
    if (kind === "weeds") state.resources.coins += 3;
    else state.resources[kind] += 2;
    tile.debris = null;
    return kind === "weeds" ? "Cleared wild weeds and found 3 coins." : `Gathered 2 ${kind}.`;
  }
  if (tool === "gather") return isRipe(tile) ? harvest(state, tile) : tile.crop ? "Still growing. Water for a boost, then let time pass." : "Choose Plant to sow a seed here.";
  if (tool === "plant") {
    if (isRipe(tile)) return harvest(state, tile);
    if (tile.crop) return "A little sprout is already growing here.";
    tile.terrain = "soil";
    tile.crop = { id: state.selectedSeed, growth: 0 };
    return `Planted ${CROPS[state.selectedSeed].name}. A little water will help it along.`;
  }
  if (tool === "hoe") {
    if (tile.crop) return "Let this crop finish growing before changing the soil.";
    tile.terrain = tile.terrain === "grass" ? "soil" : "grass";
    tile.watered = false;
    return tile.terrain === "soil" ? "Soft soil, ready for something good." : "Restored a little patch of meadow.";
  }
  if (tile.terrain !== "soil") return "Plant a seed before watering this spot.";
  if (tile.watered) return "Already watered. It will grow twice as fast at the next time step.";
  if (isRipe(tile)) return "This crop is ready to harvest.";
  tile.watered = true;
  return "Watered! Double growth at the next time step.";
}

// A pure transition keeps timers and React renders from awarding duplicate gifts.
export function advanceHomestead(previous: HomesteadState, action: HomesteadAction): { state: HomesteadState; message: string } {
  const state = structuredClone(previous);
  let message = "";
  if (action.type === "tool") { state.selectedTool = action.tool; message = TOOLS[action.tool].hint; }
  if (action.type === "seed") { state.selectedSeed = action.seed; state.selectedTool = "plant"; message = `Selected ${CROPS[action.seed].name}. Tap empty ground to plant.`; }
  if (action.type === "tile") {
    const tile = state.grid.find(t => t.r === action.r && t.c === action.c);
    message = tile ? useTile(state, tile) : "Choose a spot in your meadow.";
  }
  if (action.type === "pet") message = pet(state, action.id);
  if (action.type === "sell") {
    const coins = state.resources.crops * 5;
    state.resources.coins += coins;
    state.resources.crops = 0;
    message = coins ? `Farmstand sale: +${coins} coins. Thank you for growing!` : "Your basket is empty. Harvest something ripe first.";
  }
  if (action.type === "forage") {
    if (state.lastForageDay === state.day) message = "You’ve explored the woods today. Come back tomorrow.";
    else { state.lastForageDay = state.day; state.resources.wood += 3; state.resources.stone += 2; message = "A walk in the woods: +3 wood and +2 stone."; }
  }
  if (action.type === "gift") {
    if (state.carePackageClaimed) message = "Your welcome parcel has already been collected.";
    else {
      state.carePackageClaimed = true;
      state.resources.wood += 25; state.resources.stone += 25; state.resources.crops += 10; state.resources.coins += 100;
      message = "Welcome parcel: 25 wood, 25 stone, 10 harvests and 100 coins. Make yourself at home!";
    }
  }
  if (action.type === "tick") {
    state.timeIndex = (state.timeIndex + 1) % 4;
    if (!state.timeIndex) state.day++;
    let grew = 0;
    for (const tile of state.grid) {
      if (tile.crop && !isRipe(tile)) {
        tile.crop.growth = Math.min(CROPS[tile.crop.id].ticks, tile.crop.growth + (tile.watered ? 2 : 1));
        grew++;
      }
      tile.watered = false;
    }
    // Deterministic regrowth and wandering: repeatable across tests and previews.
    const empty = state.grid.filter(t => t.terrain === "grass" && !t.crop && !t.debris && !t.companion);
    if (empty.length && state.grid.filter(t => t.debris).length < 5) {
      empty[(state.day * 4 + state.timeIndex) % empty.length].debris = (state.day + state.timeIndex) % 2 ? "wood" : "stone";
    }
    for (const id of FRIEND_IDS) {
      const tile = state.grid.find(t => t.companion === id);
      if (!tile) continue;
      const neighbors = state.grid.filter(t => Math.abs(t.r - tile.r) + Math.abs(t.c - tile.c) === 1 && !t.companion && !t.crop && !t.debris && (id === "hippo" ? t.terrain === tile.terrain : t.terrain !== "pond"));
      if (neighbors.length) { neighbors[(state.day + state.timeIndex) % neighbors.length].companion = id; tile.companion = null; }
    }
    message = grew ? `${grew} little ${grew === 1 ? "patch grew" : "patches grew"}. Take your time; there’s no rush.` : "A little time passes. The meadow is doing its thing.";
  }
  if (action.type === "restore") {
    const project = PROJECTS[action.id];
    if (state.projects[action.id]) return { state: previous, message: "Already restored, and looking lovely." };
    if (state.resources.wood < project.wood || state.resources.stone < project.stone || state.resources.coins < project.coins) return { state: previous, message: "Gather a few more materials for this restoration." };
    if (action.id === "hippo_pond") {
      const pond = state.grid.filter(t => t.r === 4 && (t.c === 4 || t.c === 5));
      const relocations = state.grid.filter(t => !pond.includes(t) && !t.crop && !t.companion && !t.debris && t.terrain !== "pond");
      if (relocations.length < pond.filter(t => t.crop).length) return { state: previous, message: "Clear a little space first so we can move the plants beside the new pond." };
      for (const tile of pond) {
        if (tile.crop) {
          const target = relocations.shift()!;
          target.terrain = "soil"; target.crop = tile.crop; target.watered = tile.watered;
        }
        tile.crop = null; tile.debris = null; tile.companion = null; tile.watered = false; tile.terrain = "pond";
      }
    }
    state.resources.wood -= project.wood; state.resources.stone -= project.stone; state.resources.coins -= project.coins;
    state.projects[action.id] = true;
    if (action.id === "cozy_barn") expand(state, 7);
    if (action.id === "flower_arch") expand(state, 8);
    message = `${project.name} restored!${action.id === "hippo_pond" ? " Any plants in its path were moved safely." : " Your meadow has room to grow."}`;
  }
  message += unlockFriends(state);
  return { state, message };
}
