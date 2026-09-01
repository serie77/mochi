import { verifySignature, cookieHeader } from "../../../../lib/auth.js";

export const dynamic = "force-dynamic";

export async function POST(req) {
  const body = await req.json().catch(() => null);
  try {
    const token = await verifySignature(String(body?.address || ""), String(body?.signature || ""));
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json", "set-cookie": cookieHeader(token) },
    });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 400 });
  }
}
