import { issueNonce } from "../../../../lib/auth.js";

export const dynamic = "force-dynamic";

export async function POST(req) {
  const body = await req.json().catch(() => null);
  try {
    return Response.json({ ok: true, ...issueNonce(String(body?.address || "")) });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 400 });
  }
}
