// public: what a wallet's mochi looks like (equipped items -> hues). used by the stage.
import { readJson } from "../../../lib/store.js";
import { addr } from "../../../lib/chain.js";
import { lookFromItems, protocol } from "../../../lib/protocol.js";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const w = addr(new URL(req.url).searchParams.get("wallet"));
  if (!w) return Response.json({ ok: true, look: protocol().look, own: false });
  const items = readJson("customs.json", {})[w];
  if (!items?.length) return Response.json({ ok: true, look: protocol().look, own: false });
  return Response.json({ ok: true, look: { ...lookFromItems(items), name: "your look" }, own: true });
}
