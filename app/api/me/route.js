import { cfg, readJson } from "../../../lib/store.js";
import { sessionOf } from "../../../lib/auth.js";
import { ribbonsOf, inventoryOf, historyOf } from "../../../lib/ledger.js";
import { protocol, lookFromItems } from "../../../lib/protocol.js";
import { balanceOf } from "../../../lib/chain.js";
import { vaultPosition } from "../../../lib/vault.js";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const a = sessionOf(req);
  if (!a) return Response.json({ ok: true, address: null });
  const c = cfg();
  const p = protocol();
  const equipped = readJson("customs.json", {})[a] || [];
  const handles = readJson("handles.json", {});
  const handle = Object.keys(handles).find((h) => handles[h] === a) || null;
  let tokenBalance = null;
  if (c.tokenCa) {
    try {
      tokenBalance = Number(await balanceOf(c.tokenCa, a)) / 1e18;
    } catch {}
  }
  let usdgBalance = null;
  try {
    usdgBalance = Number(await balanceOf(c.usdgCa, a)) / 1e6;
  } catch {}
  let vault = null;
  if (c.vaultCa) {
    vault = await vaultPosition(a).catch(() => null);
  }
  const gifts = readJson("gifts.json", [])
    .filter((g) => g.from === a || g.to === a || (handle && g.to === "@" + handle))
    .slice(-30)
    .reverse();
  return Response.json({
    ok: true,
    address: a,
    ribbons: ribbonsOf(a),
    inventory: inventoryOf(a),
    equipped,
    look: lookFromItems(equipped),
    vote: p.votes[a] || null,
    handle,
    tokenBalance,
    usdgBalance,
    vault,
    history: historyOf(a, 40),
    gifts,
  });
}
