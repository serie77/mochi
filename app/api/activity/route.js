import { readJson } from "../../../lib/store.js";
import { recentActivity } from "../../../lib/ledger.js";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = recentActivity(40);
  const log = readJson("decisions.json", []).slice(-40).reverse();
  return Response.json({ ok: true, rows, log });
}
