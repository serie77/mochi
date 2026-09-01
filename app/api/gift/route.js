// gift ribbons or an owned item to a wallet or an x handle (held until they claim by tweet).
import { sessionOf, unauthorized } from "../../../lib/auth.js";
import { addr } from "../../../lib/chain.js";
import { itemById } from "../../../lib/catalog.js";
import { mutate, debit, credit, takeItem, grantItem, deliverToHandle, logGift, normHandle } from "../../../lib/ledger.js";

export const dynamic = "force-dynamic";

export async function POST(req) {
  const a = sessionOf(req);
  if (!a) return unauthorized();
  const body = await req.json().catch(() => null);
  const to = String(body?.to || "").trim();
  const ribbons = body?.ribbons != null ? Math.floor(Number(body.ribbons)) : 0;
  const itemId = body?.itemId ? String(body.itemId) : null;
  if (!ribbons && !itemId) return Response.json({ ok: false, error: "nothing to send" }, { status: 400 });
  if (ribbons && !(ribbons >= 1 && ribbons <= 1_000_000)) return Response.json({ ok: false, error: "amount out of range" }, { status: 400 });
  if (itemId && (!itemById(itemId) || itemById(itemId).base)) return Response.json({ ok: false, error: "that item cannot be gifted" }, { status: 400 });

  const toAddr = addr(to);
  const toHandle = !toAddr && /^@?[A-Za-z0-9_]{1,15}$/.test(to) ? normHandle(to) : null;
  if (!toAddr && !toHandle) return Response.json({ ok: false, error: "send to a 0x address or an @handle" }, { status: 400 });
  if (toAddr === a) return Response.json({ ok: false, error: "that is you" }, { status: 400 });

  try {
    const r = await mutate(async (s, touch) => {
      if (ribbons) debit(s, touch, a, ribbons, "gift", toAddr || "@" + toHandle);
      if (itemId) takeItem(s, touch, a, itemId);
      let out;
      if (toAddr) {
        if (ribbons) credit(s, touch, toAddr, ribbons, "gift", a);
        if (itemId) grantItem(s, touch, toAddr, itemId);
        out = { to: toAddr, escrowed: false };
      } else {
        out = deliverToHandle(s, touch, toHandle, { ribbons, itemId }, "gift", a);
      }
      logGift(s, touch, { from: a, to: toAddr || "@" + toHandle, ribbons: ribbons || null, itemId, via: "site" });
      return { ...out, ribbons: s.ledger.balances[a] || 0, inventory: s.inventory[a] || [] };
    });
    return Response.json({ ok: true, ...r });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 400 });
  }
}
