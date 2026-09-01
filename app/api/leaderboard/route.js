import { leaderboard } from "../../../lib/ledger.js";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ ok: true, rows: await leaderboard(25) });
}
