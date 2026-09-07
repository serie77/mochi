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
  try {
    const items = await withLock(async () => {
      // ownership is checked under the same lock that gifts take items away under,
      // so you can never end up wearing something you no longer own
      const own = new Set(await inventoryOf(a));
      const bySlot = {};
      for (const id of want) {
        const it = itemById(id);
        if (!it) throw new Error("unknown item");
        if (!it.base && !own.has(id)) throw new Error("you do not own that");
        bySlot[it.slot] = id;
      }
      const out = SLOTS.map((s) => bySlot[s]).filter(Boolean);
      const all = await readJson("customs.json", {});
      if (out.length) all[a] = out;
      else delete all[a];
      await writeJson("customs.json", all);
      return out;
    });
    return Response.json({ ok: true, equipped: items, look: lookFromItems(items) });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 400 });
  }
}
