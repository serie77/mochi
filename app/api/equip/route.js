// equip owned items (one per slot). base items are always allowed. empty = wear the chain's look.
import { sessionOf, unauthorized } from "../../../lib/auth.js";
import { readJson, writeJson, withLock } from "../../../lib/store.js";
import { itemById, SLOTS } from "../../../lib/catalog.js";
import { inventoryOf } from "../../../lib/ledger.js";
import { lookFromItems } from "../../../lib/protocol.js";

export const dynamic = "force-dynamic";

export async function POST(req) {
  const a = await sessionOf(req);
  if (!a) return unauthorized();
  const body = await req.json().catch(() => null);
  const want = Array.isArray(body?.items) ? body.items.map(String) : [];
  const own = new Set(await inventoryOf(a));
  const bySlot = {};
  for (const id of want) {
    const it = itemById(id);
    if (!it) return Response.json({ ok: false, error: "unknown item" }, { status: 400 });
    if (!it.base && !own.has(id)) return Response.json({ ok: false, error: "you do not own that" }, { status: 400 });
    bySlot[it.slot] = id;
  }
  const items = SLOTS.map((s) => bySlot[s]).filter(Boolean);
  await withLock(async () => {
    const all = await readJson("customs.json", {});
    if (items.length) all[a] = items;
    else delete all[a];
    await writeJson("customs.json", all);
  });
  return Response.json({ ok: true, equipped: items, look: lookFromItems(items) });
}
