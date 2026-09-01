// x (twitter) api v2. posting uses oauth1.0a user context (free tier); reading mentions needs
// a bearer token on a paid tier. no deps.
import crypto from "crypto";

const enc = (s) =>
  encodeURIComponent(s).replace(/[!*'()]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

export function xEnabled() {
  return !!(
    process.env.X_API_KEY &&
    process.env.X_API_SECRET &&
    process.env.X_ACCESS_TOKEN &&
    process.env.X_ACCESS_SECRET
  );
}
export function xReadEnabled() {
  return !!(process.env.X_BEARER_TOKEN && process.env.X_USERNAME);
}

function oauthHeader(method, url) {
  const oauth = {
    oauth_consumer_key: process.env.X_API_KEY,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: process.env.X_ACCESS_TOKEN,
    oauth_version: "1.0",
  };
  const params = Object.keys(oauth).sort().map((k) => `${k}=${enc(oauth[k])}`).join("&");
  const base = [method, enc(url), enc(params)].join("&");
  const key = `${enc(process.env.X_API_SECRET)}&${enc(process.env.X_ACCESS_SECRET)}`;
  oauth.oauth_signature = crypto.createHmac("sha1", key).update(base).digest("base64");
  return "OAuth " + Object.keys(oauth).sort().map((k) => `${k}="${enc(oauth[k])}"`).join(", ");
}

export async function tweet(text, { replyTo } = {}) {
  const url = "https://api.twitter.com/2/tweets";
  const body = { text };
  if (replyTo) body.reply = { in_reply_to_tweet_id: String(replyTo) };
  const r = await fetch(url, {
    method: "POST",
    headers: { authorization: oauthHeader("POST", url), "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.detail || j?.title || `x api ${r.status}`);
  return j.data?.id || null;
}

async function bearer(path) {
  const r = await fetch(`https://api.twitter.com/2${path}`, {
    headers: { authorization: `Bearer ${process.env.X_BEARER_TOKEN}` },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.detail || j?.title || `x api ${r.status}`);
  return j;
}

export async function resolveUserId(username) {
  const j = await bearer(`/users/by/username/${encodeURIComponent(username)}`);
  return j.data?.id || null;
}

// newest-first mentions of the bot: [{ id, text, authorId, username }]
export async function mentions(userId, sinceId) {
  const q = new URLSearchParams({
    max_results: "50",
    "tweet.fields": "author_id,created_at",
    expansions: "author_id",
    "user.fields": "username",
  });
  if (sinceId) q.set("since_id", sinceId);
  const j = await bearer(`/users/${userId}/mentions?${q}`);
  const users = new Map((j.includes?.users || []).map((u) => [u.id, u.username]));
  return (j.data || []).map((t) => ({
    id: t.id,
    text: t.text,
    authorId: t.author_id,
    username: users.get(t.author_id) || null,
  }));
}
