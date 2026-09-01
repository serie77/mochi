import { readJson } from "../../../lib/store.js";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = readJson("epochs.json", []);
  return Response.json({ ok: true, rows: rows.slice(-60).reverse() });
}
