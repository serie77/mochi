// sign-in with an evm wallet: nonce -> personal_sign -> httponly cookie. no passwords, no custody.
import crypto from "crypto";
import { verifyMessage } from "viem";
import { readJson, writeJson } from "./store.js";
import { addr as checksum } from "./chain.js";

export const COOKIE = "mochi_session";
const TTL_MS = 30 * 24 * 3600 * 1000;
const NONCE_TTL_MS = 10 * 60 * 1000;

function secret() {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  const f = readJson("auth-secret.json", null);
  if (f?.secret) return f.secret;
  const s = crypto.randomBytes(32).toString("hex");
  writeJson("auth-secret.json", { secret: s });
  return s;
}

const b64u = (b) => Buffer.from(b).toString("base64url");

export function issueNonce(address) {
  const a = checksum(address);
  if (!a) throw new Error("bad address");
  const nonce = crypto.randomBytes(12).toString("hex");
  const issued = new Date().toISOString();
  const message = `mochi wants to sign you in.\n\nwallet: ${a}\nchain: 4663\nnonce: ${nonce}\nissued: ${issued}\n\nthis signature costs nothing and moves nothing.`;
  const all = readJson("nonces.json", {});
  const now = Date.now();
  for (const k of Object.keys(all)) if (all[k].exp < now) delete all[k];
  all[a] = { message, exp: now + NONCE_TTL_MS };
  writeJson("nonces.json", all);
  return { address: a, message };
}

export async function verifySignature(address, signature) {
  const a = checksum(address);
  if (!a) throw new Error("bad address");
  const all = readJson("nonces.json", {});
  const n = all[a];
  if (!n || n.exp < Date.now()) throw new Error("sign-in expired, try again");
  const ok = await verifyMessage({ address: a, message: n.message, signature });
  if (!ok) throw new Error("signature did not match");
  delete all[a];
  writeJson("nonces.json", all);
  return signToken(a);
}

export function signToken(address) {
  const payload = b64u(JSON.stringify({ a: address, e: Date.now() + TTL_MS }));
  const sig = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== "string") return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const want = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  if (want.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return null;
  try {
    const { a, e } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!a || e < Date.now()) return null;
    return checksum(a);
  } catch {
    return null;
  }
}

export function sessionOf(req) {
  const raw = req.headers.get("cookie") || "";
  const m = raw.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return m ? verifyToken(decodeURIComponent(m[1])) : null;
}

export function cookieHeader(token) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return token
    ? `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TTL_MS / 1000}${secure}`
    : `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export const unauthorized = () => Response.json({ ok: false, error: "sign in first" }, { status: 401 });
