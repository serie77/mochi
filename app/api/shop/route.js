import { sessionOf, unauthorized } from "../../../lib/auth.js";
import { ITEMS, SLOTS, itemById } from "../../../lib/catalog.js";
import { mutate, debit, grantItem } from "../../../lib/ledger.js";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ ok: true, slots: SLOTS, items: ITEMS });
}

export async function POST(req) {
  const a = await sessionOf(req);
  if (!a) return unauthorized();
  const body = await req.json().catch(() => null);
  const it = itemById(String(body?.itemId || ""));
  if (!it || it.base) return Response.json({ ok: false, error: "that item is not for sale" }, { status: 400 });
  try {
    const r = await mutate(async (s, touch) => {
      if ((s.inventory[a] || []).includes(it.id)) throw new Error("you already own that");
      debit(s, touch, a, it.price, "buy", it.id);
      grantItem(s, touch, a, it.id);
      return { ribbons: s.ledger.balances[a] || 0, inventory: s.inventory[a] };
    });
    return Response.json({ ok: true, ...r });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 400 });
  }
}
