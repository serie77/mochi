import { cfg, readJson } from "../../../lib/store.js";

export const dynamic = "force-dynamic";

export async function GET() {
  const entries = await readJson("feed.json", []);
  return Response.json({
    ok: true,
    username: cfg().xUsername || null,
    entries: entries.slice(-60).reverse(),
  });
}
