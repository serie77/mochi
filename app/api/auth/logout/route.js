import { cookieHeader } from "../../../../lib/auth.js";

export const dynamic = "force-dynamic";

export async function POST() {
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json", "set-cookie": cookieHeader(null) },
  });
}
