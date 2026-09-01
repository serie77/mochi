// the wardrobe. three kinds of item, all rendered live on the vrm (see app/character-vrm.js):
//   hue     - retints a slot's textures (hair, eyes, top, bottom, shoes, ribbon)
//   pattern - composites a fabric print onto the top's texture (stripes, dots, checker)
//   mesh    - real 3d headwear attached to her head bone (ears, halo, hat, glasses, horns)
// base items are her original look and cost nothing. prices are in ribbons.

export const SLOTS = ["hair", "eyes", "top", "bottom", "shoes", "extras", "headwear", "outfit"];

// full outfit swaps: alternate vrm models exported from vroid studio.
// to add one: export the SAME character with a different outfit from vroid studio,
// drop the file at public/models/<file>.vrm, and add a line here, e.g.:
//   ["school uniform", "/models/mochi-school.vrm", "epic"],
// colors, patterns and headwear all still apply on top of any outfit.
const OUTFITS = [
  ["her tennis set", null, "base"],
];

const TIER_PRICE = { base: 0, common: 20, rare: 60, epic: 150 };

const HUES = {
  hair: [
    ["rose", null, "base"],
    ["cherry", 0, "common"],
    ["peach", 22, "common"],
    ["honey", 45, "rare"],
    ["matcha", 120, "rare"],
    ["seafoam", 165, "rare"],
    ["sky", 205, "common"],
    ["midnight", 240, "epic"],
    ["lilac", 275, "common"],
    ["magenta", 305, "rare"],
  ],
  eyes: [
    ["violet", null, "base"],
    ["ruby", 355, "rare"],
    ["amber", 40, "common"],
    ["jade", 140, "common"],
    ["glacier", 195, "common"],
    ["sapphire", 225, "rare"],
    ["orchid", 290, "epic"],
  ],
  top: [
    ["plum", null, "base"],
    ["crimson", 350, "common"],
    ["apricot", 25, "common"],
    ["mustard", 50, "rare"],
    ["moss", 110, "common"],
    ["teal", 175, "rare"],
    ["cobalt", 220, "epic"],
    ["ink", 255, "rare"],
    ["fuchsia", 315, "common"],
  ],
  bottom: [
    ["plum", null, "base"],
    ["wine", 345, "common"],
    ["clay", 20, "common"],
    ["olive", 80, "rare"],
    ["pine", 150, "common"],
    ["navy", 230, "epic"],
    ["grape", 280, "rare"],
  ],
  shoes: [
    ["plum", null, "base"],
    ["scarlet", 0, "common"],
    ["tan", 35, "common"],
    ["forest", 130, "rare"],
    ["ocean", 200, "common"],
    ["indigo", 250, "rare"],
  ],
  extras: [
    ["pink ribbon", null, "base"],
    ["red ribbon", 355, "common"],
    ["gold ribbon", 48, "epic"],
    ["mint ribbon", 160, "rare"],
    ["blue ribbon", 215, "common"],
    ["violet ribbon", 270, "rare"],
  ],
};

// fabric prints for the top: [name, patternKind, hueDeg, tier]
const PATTERNS = [
  ["striped", "stripes", 330, "rare"],
  ["sailor striped", "stripes", 215, "rare"],
  ["polka dot", "dots", 300, "rare"],
  ["mint dotted", "dots", 160, "rare"],
  ["checkered", "checker", 270, "epic"],
  ["ember checkered", "checker", 15, "epic"],
];

// real 3d headwear: [name, meshId, tier]
const MESHES = [
  ["bare", null, "base"],
  ["round glasses", "glasses", "common"],
  ["devil horns", "horns", "rare"],
  ["witch hat", "witch-hat", "rare"],
  ["halo", "halo", "epic"],
  ["cat ears", "cat-ears", "epic"],
];

export const ITEMS = [];
for (const slot of Object.keys(HUES)) {
  for (const [name, hue, tier] of HUES[slot]) {
    ITEMS.push({
      id: `${slot}-${name.replace(/\s+/g, "-")}`,
      slot,
      name,
      kind: "hue",
      hue,
      tier,
      price: TIER_PRICE[tier],
      base: tier === "base",
    });
  }
}
for (const [name, pattern, hue, tier] of PATTERNS) {
  ITEMS.push({
    id: `top-${name.replace(/\s+/g, "-")}`,
    slot: "top",
    name,
    kind: "pattern",
    pattern,
    hue,
    tier,
    price: TIER_PRICE[tier],
    base: false,
  });
}
for (const [name, mesh, tier] of MESHES) {
  ITEMS.push({
    id: `headwear-${name.replace(/\s+/g, "-")}`,
    slot: "headwear",
    name,
    kind: "mesh",
    mesh,
    tier,
    price: TIER_PRICE[tier],
    base: tier === "base",
  });
}

for (const [name, model, tier] of OUTFITS) {
  ITEMS.push({
    id: `outfit-${name.replace(/\s+/g, "-")}`,
    slot: "outfit",
    name,
    kind: "model",
    model,
    tier,
    price: TIER_PRICE[tier],
    base: tier === "base",
  });
}

const BY_ID = new Map(ITEMS.map((i) => [i.id, i]));
export const itemById = (id) => BY_ID.get(id) || null;
export const baseItem = (slot) => ITEMS.find((i) => i.slot === slot && i.base);
export const itemsForSlot = (slot) => ITEMS.filter((i) => i.slot === slot);

// renderer config for a set of equipped item ids:
//   { hues: {slot: deg}, patterns: {slot: {pattern, hue}}, meshes: ["halo", ...] }
export function lookConfig(itemIds) {
  const hues = {};
  const patterns = {};
  const meshes = [];
  let model = null;
  for (const id of itemIds || []) {
    const it = itemById(id);
    if (!it) continue;
    if (it.kind === "hue" && it.hue != null) hues[it.slot] = it.hue;
    if (it.kind === "pattern") patterns[it.slot] = { pattern: it.pattern, hue: it.hue };
    if (it.kind === "mesh" && it.mesh) meshes.push(it.mesh);
    if (it.kind === "model" && it.model) model = it.model;
  }
  return { hues, patterns, meshes, model };
}

export function lookName(itemIds) {
  const hair = itemById((itemIds || []).find((id) => id.startsWith("hair-")));
  const top = itemById((itemIds || []).find((id) => id.startsWith("top-")));
  const head = itemById((itemIds || []).find((id) => id.startsWith("headwear-")));
  const core = `${hair?.name || "rose"} ${top?.name || "plum"}`;
  return head && !head.base ? `${core}, ${head.name}` : core;
}

// deterministic candidate looks for an epoch (seeded so the site and engine agree)
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

export function candidatesFor(epoch, n = 4) {
  const r = rng(epoch * 2654435761 + 97);
  const seen = new Set();
  const out = [];
  let guard = 0;
  while (out.length < n && guard++ < 100) {
    const ids = SLOTS.map((slot) => {
      const pool = itemsForSlot(slot);
      // bias toward keeping some slots original so looks read as outfits, not noise;
      // headwear stays bare more often so hats feel special when they win
      if (slot === "outfit" && pool.length <= 1) return baseItem(slot).id;
      const keepBase = slot === "headwear" ? 0.55 : slot === "outfit" ? 0.6 : 0.3;
      if (r() < keepBase) return baseItem(slot).id;
      return pool[Math.floor(r() * pool.length)].id;
    });
    const name = lookName(ids);
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ id: `e${epoch}-${out.length + 1}`, name, items: ids, ...lookConfig(ids) });
  }
  return out;
}

export const BASE_LOOK = {
  id: "base",
  name: "rose plum",
  items: SLOTS.map((s) => baseItem(s).id),
  ...lookConfig([]),
};
