// strict grammar for tweets addressed to mochi. no model ever reads a tweet.
//   @mochi gift @friend 50 ribbons
//   @mochi send @friend 5 ribbons        (send / tip / gift are the same)
//   @mochi gift @friend hair-midnight    (an item id from the wardrobe)
//   @mochi claim 0xYourWallet            (link your handle to your wallet, releases gifts held for you)
import { itemById } from "./catalog.js";
import { addr as checksum } from "./chain.js";

const HANDLE = "@([A-Za-z0-9_]{1,15})";
const MAX_RIBBONS = 1_000_000;

export function parseCommand(text, botHandle) {
  if (!text) return null;
  let t = String(text).replace(/https?:\/\/\S+/g, " ").replace(/\s+/g, " ").trim();
  const bot = String(botHandle || "").replace(/^@/, "").toLowerCase();
  // drop every leading mention (x prepends reply chains); the bot must be among them
  const lead = t.match(/^(?:@[A-Za-z0-9_]{1,15}\s+)+/);
  if (!lead) return null;
  const mentioned = lead[0].toLowerCase().split(/\s+/).filter(Boolean);
  if (bot && !mentioned.includes("@" + bot)) return null;
  t = t.slice(lead[0].length).trim();

  let m = t.match(new RegExp(`^(?:gift|send|tip)\\s+${HANDLE}\\s+(\\d{1,7})\\s*ribbons?\\s*[.!]?$`, "i"));
  if (m) return ribbons(m[1], m[2]);
  m = t.match(new RegExp(`^(?:gift|send|tip)\\s+(\\d{1,7})\\s*ribbons?\\s+to\\s+${HANDLE}\\s*[.!]?$`, "i"));
  if (m) return ribbons(m[2], m[1]);
  m = t.match(new RegExp(`^gift\\s+${HANDLE}\\s+([a-z]+-[a-z-]+)\\s*[.!]?$`, "i"));
  if (m) {
    const it = itemById(m[2].toLowerCase());
    if (!it || it.base) return { kind: "error", error: "that item is not in the wardrobe" };
    return { kind: "gift", to: m[1].toLowerCase(), itemId: it.id };
  }
  m = t.match(/^(?:claim|link)\s+(0x[0-9a-fA-F]{40})\s*[.!]?$/i);
  if (m) {
    const a = checksum(m[1]);
    return a ? { kind: "claim", address: a } : { kind: "error", error: "that address does not check out" };
  }
  return null;
}

function ribbons(handle, n) {
  const amount = Number(n);
  if (!(amount >= 1) || amount > MAX_RIBBONS) return { kind: "error", error: "amount out of range" };
  return { kind: "gift", to: handle.toLowerCase(), ribbons: amount };
}
