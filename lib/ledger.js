// ribbons, inventory, handles, escrow. every mutation runs under the cross-process lock.
import { readJson, writeJson, withLock } from "./store.js";
import { itemById } from "./catalog.js";

const HISTORY_CAP = 5000;
const GIFT_CAP = 2000;

const norm = (h) => String(h || "").replace(/^@/, "").toLowerCase();

function load() {
  return {
    ledger: readJson("ledger.json", { balances: {}, history: [] }),
    inventory: readJson("inventory.json", {}),
    handles: readJson("handles.json", {}),
    escrow: readJson("escrow.json", {}),
    gifts: readJson("gifts.json", []),
    customs: readJson("customs.json", {}),
  };
}
function save(s, touched) {
  if (touched.has("customs")) writeJson("customs.json", s.customs);
  if (touched.has("ledger")) {
    s.ledger.history = s.ledger.history.slice(-HISTORY_CAP);
    writeJson("ledger.json", s.ledger);
  }
  if (touched.has("inventory")) writeJson("inventory.json", s.inventory);
  if (touched.has("handles")) writeJson("handles.json", s.handles);
  if (touched.has("escrow")) writeJson("escrow.json", s.escrow);
  if (touched.has("gifts")) writeJson("gifts.json", s.gifts.slice(-GIFT_CAP));
}

// run fn(state, touch) atomically; fn may throw to abort (nothing is written)
export function mutate(fn) {
  return withLock(async () => {
    const s = load();
    const touched = new Set();
    const out = await fn(s, (k) => touched.add(k));
    save(s, touched);
    return out;
  });
}

/* ---- pure helpers on a loaded state (used inside mutate) ---- */

export function credit(s, touch, addr, n, kind, ref) {
  n = Math.floor(n);
  if (!(n > 0)) return;
  s.ledger.balances[addr] = (s.ledger.balances[addr] || 0) + n;
  s.ledger.history.push({ t: Date.now(), addr, delta: n, kind, ref: ref ?? null });
  touch("ledger");
}

export function debit(s, touch, addr, n, kind, ref) {
  n = Math.floor(n);
  if (!(n > 0)) throw new Error("amount must be positive");
  const bal = s.ledger.balances[addr] || 0;
  if (bal < n) throw new Error("not enough ribbons");
  s.ledger.balances[addr] = bal - n;
  if (!s.ledger.balances[addr]) delete s.ledger.balances[addr];
  s.ledger.history.push({ t: Date.now(), addr, delta: -n, kind, ref: ref ?? null });
  touch("ledger");
}

export function grantItem(s, touch, addr, itemId) {
  if (!itemById(itemId)) throw new Error("no such item");
  const inv = (s.inventory[addr] ||= []);
  if (inv.includes(itemId)) return false;
  inv.push(itemId);
  touch("inventory");
  return true;
}

export function takeItem(s, touch, addr, itemId) {
  const inv = s.inventory[addr] || [];
  const i = inv.indexOf(itemId);
  if (i < 0) throw new Error("you do not own that");
  inv.splice(i, 1);
  if (!inv.length) delete s.inventory[addr];
  touch("inventory");
  // she cannot keep wearing what was given away
  const worn = s.customs[addr];
  if (worn?.includes(itemId)) {
    const next = worn.filter((x) => x !== itemId);
    if (next.length) s.customs[addr] = next;
    else delete s.customs[addr];
    touch("customs");
  }
}

export function addrOfHandle(s, handle) {
  return s.handles[norm(handle)] || null;
}

export function handleOfAddr(s, addr) {
  for (const [h, a] of Object.entries(s.handles)) if (a === addr) return h;
  return null;
}

// deliver ribbons / an item to an x handle: straight to the wallet if linked, else escrow
export function deliverToHandle(s, touch, handle, { ribbons = 0, itemId = null }, kind, ref) {
  const h = norm(handle);
  const to = addrOfHandle(s, h);
  if (to) {
    if (ribbons) credit(s, touch, to, ribbons, kind, ref);
    if (itemId) grantItem(s, touch, to, itemId);
    return { to, escrowed: false };
  }
  const e = (s.escrow[h] ||= { ribbons: 0, items: [] });
  if (ribbons) e.ribbons += ribbons;
  if (itemId) e.items.push(itemId);
  touch("escrow");
  return { to: null, escrowed: true };
}

// link a handle to a wallet (proof came from the x poller: the author tweeted it) and release escrow
export function linkHandle(s, touch, handle, addr) {
  const h = norm(handle);
  const prev = handleOfAddr(s, addr);
  if (prev && prev !== h) delete s.handles[prev];
  s.handles[h] = addr;
  touch("handles");
  const e = s.escrow[h];
  let released = { ribbons: 0, items: 0 };
  if (e) {
    if (e.ribbons) credit(s, touch, addr, e.ribbons, "escrow", h);
    for (const id of e.items) grantItem(s, touch, addr, id);
    released = { ribbons: e.ribbons, items: e.items.length };
    delete s.escrow[h];
    touch("escrow");
  }
  return released;
}

export function logGift(s, touch, gift) {
  s.gifts.push({ t: Date.now(), ...gift });
  touch("gifts");
}

/* ---- reads ---- */

export function ribbonsOf(addr) {
  return readJson("ledger.json", { balances: {} }).balances[addr] || 0;
}
export function inventoryOf(addr) {
  return readJson("inventory.json", {})[addr] || [];
}
export function leaderboard(n = 20) {
  const b = readJson("ledger.json", { balances: {} }).balances;
  return Object.entries(b)
    .sort((x, y) => y[1] - x[1])
    .slice(0, n)
    .map(([addr, ribbons]) => ({ addr, ribbons }));
}
export function totals() {
  const l = readJson("ledger.json", { balances: {}, history: [] });
  let minted = 0;
  for (const h of l.history) if (h.delta > 0 && h.kind === "epoch") minted += h.delta;
  return { minted, wallets: Object.keys(l.balances).length };
}
export function historyOf(addr, n = 50) {
  return readJson("ledger.json", { history: [] })
    .history.filter((h) => h.addr === addr)
    .slice(-n)
    .reverse();
}
export function recentActivity(n = 40) {
  const l = readJson("ledger.json", { history: [] }).history.slice(-n * 2);
  const g = readJson("gifts.json", []).slice(-n);
  const rows = [
    ...l.map((h) => ({ t: h.t, action: h.kind, wallet: h.addr, amount: h.delta, ref: h.ref })),
    ...g.map((x) => ({ t: x.t, action: "gift", wallet: x.from, amount: x.ribbons || null, ref: x.itemId || x.to })),
  ];
  return rows.sort((a, b) => b.t - a.t).slice(0, n);
}
export { norm as normHandle };
