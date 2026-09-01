import { sessionOf, unauthorized } from "../../../lib/auth.js";
import { protocol, castVote, tally } from "../../../lib/protocol.js";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const p = protocol();
  const t = tally(p);
  const a = sessionOf(req);
  return Response.json({
    ok: true,
    epoch: p.epoch,
    nextEpochAt: p.nextEpochAt,
    candidates: p.candidates.map((x) => ({ ...x, votes: t[x.id] || 0 })),
    voters: Object.keys(p.votes).length,
    mine: a ? p.votes[a] || null : null,
  });
}

export async function POST(req) {
  const a = sessionOf(req);
  if (!a) return unauthorized();
  const body = await req.json().catch(() => null);
  try {
    const p = await castVote(a, String(body?.candidateId || ""));
    return Response.json({ ok: true, mine: p.votes[a], voters: Object.keys(p.votes).length });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 400 });
  }
}
