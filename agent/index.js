// mochi: the engine. every tick it heartbeats, closes the epoch when it is due (snapshot holders,
// mint ribbons, tally the vote, change her look), reads x mentions for gift/claim commands, and
// posts in her voice. it holds no keys to anything but her x account.
//
//   node agent/index.js               run forever
//   node agent/index.js --once        one tick, then exit
//   node agent/index.js --epoch-now   force the epoch to close on the first tick

import path from "path";
import { cfg, readJson, writeJson, pushCapped } from "../lib/store.js";
import { protocol, runEpoch, mode } from "../lib/protocol.js";
import { vaultStats, vaultCfg } from "../lib/vault.js";
import { mutate, credit, debit, takeItem, grantItem, addrOfHandle, deliverToHandle, linkHandle, logGift } from "../lib/ledger.js";
import { itemById } from "../lib/catalog.js";
import { parseCommand } from "../lib/x-commands.js";
import { compose } from "./persona.js";
import { tweet, xEnabled, xReadEnabled, mentions, resolveUserId } from "./x.js";

try {
  process.loadEnvFile(path.join(process.cwd(), ".env"));
} catch {}

const num = (k, d) => (process.env[k] !== undefined && process.env[k] !== "" ? Number(process.env[k]) : d);
const TICK_MS = num("TICK_SEC", 30) * 1000;
const POST_EVERY_MS = num("POST_EVERY_MIN", 90) * 60 * 1000;
const MENTIONS_EVERY_MS = num("MENTIONS_EVERY_SEC", 60) * 1000;
const ONCE = process.argv.includes("--once");
const EPOCH_NOW = process.argv.includes("--epoch-now");

const log = (text) => {
  console.log("[machine]", text);
  pushCapped("decisions.json", { time: Date.now(), text }, 300);
};

const left = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
};

async function post(kind, ctx) {
  const text = await compose(kind, ctx);
  let tweetId = null;
  if (xEnabled()) {
    try {
      tweetId = await tweet(text);
    } catch (e) {
      console.error("x post failed:", e.message);
    }
  }
  pushCapped(
    "feed.json",
    { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, createdAt: Date.now(), kind, text, tweetId },
    300
  );
  const st = readJson("agent-state.json", {});
  st.lastPostAt = Date.now();
  writeJson("agent-state.json", st);
  console.log("[post]", text.replace(/\n/g, " / "), tweetId ? `(x:${tweetId})` : "");
}

/* ---------- x commands ---------- */

async function handleMention(m) {
  const cmd = parseCommand(m.text, cfg().xUsername);
  if (!cmd || !m.username) return null;
  const from = "@" + m.username.toLowerCase();
  if (cmd.kind === "error") return `${from} ${cmd.error}.`;
  if (cmd.kind === "claim") {
    const released = await mutate(async (s, touch) => linkHandle(s, touch, m.username, cmd.address));
    const note =
      released.ribbons || released.items
        ? `${released.ribbons} ribbons and ${released.items} item(s) were waiting for you.`
        : "nothing was waiting, but the door is open.";
    await post("claim", { handle: from, released: note });
    return `${from} linked to ${cmd.address.slice(0, 6)}…${cmd.address.slice(-4)}. ${note}`;
  }
  // gift
  try {
    const res = await mutate(async (s, touch) => {
      const sender = addrOfHandle(s, m.username);
      if (!sender) throw new Error(`link your wallet first: tweet "@${cfg().xUsername} claim 0xYourWallet"`);
      if (cmd.ribbons) debit(s, touch, sender, cmd.ribbons, "gift", "@" + cmd.to);
      if (cmd.itemId) takeItem(s, touch, sender, cmd.itemId);
      const d = deliverToHandle(s, touch, cmd.to, { ribbons: cmd.ribbons || 0, itemId: cmd.itemId || null }, "gift", from);
      logGift(s, touch, { from: sender, to: "@" + cmd.to, ribbons: cmd.ribbons || null, itemId: cmd.itemId || null, via: "x", tweetId: m.id });
      return d;
    });
    const what = cmd.ribbons ? `${cmd.ribbons} ribbons` : itemById(cmd.itemId).name;
    await post("gift", { from, to: "@" + cmd.to, what });
    return res.escrowed
      ? `${from} sent ${what} to @${cmd.to}. it is held until they tweet "@${cfg().xUsername} claim 0xTheirWallet".`
      : `${from} sent ${what} to @${cmd.to}. delivered.`;
  } catch (e) {
    return `${from} ${e.message}`;
  }
}

async function pollMentions() {
  const st = readJson("x-state.json", {});
  if (!st.userId) {
    st.userId = await resolveUserId(cfg().xUsername);
    if (!st.userId) throw new Error("could not resolve x user id");
  }
  const list = (await mentions(st.userId, st.sinceId)).reverse(); // oldest first
  for (const m of list) {
    try {
      const reply = await handleMention(m);
      if (reply) {
        log(`x: ${m.text.slice(0, 80)} -> ${reply.slice(0, 80)}`);
        if (xEnabled()) await tweet(reply, { replyTo: m.id }).catch((e) => console.error("reply failed:", e.message));
      }
    } catch (e) {
      console.error("mention failed:", e.message);
    }
    st.sinceId = m.id;
    writeJson("x-state.json", st);
  }
  st.lastPollAt = Date.now();
  writeJson("x-state.json", st);
}

/* ---------- the tick ---------- */

let forced = EPOCH_NOW;
async function tick() {
  writeJson("heartbeat.json", { time: Date.now(), mode: mode() });
  const p = protocol();

  // close the epoch when due
  if (forced || Date.now() >= p.nextEpochAt) {
    const closed = await runEpoch({ force: forced });
    forced = false;
    if (closed) {
      log(
        `epoch ${closed.epoch} closed: ${closed.ribbonsMinted} ribbons to ${closed.holders || closed.voters} wallets, winner "${closed.winner.name}"` +
          (closed.snapshotError ? ` (snapshot failed: ${closed.snapshotError})` : "")
      );
      let vaultLine = "";
      if (vaultCfg().vaultCa) {
        try {
          const v = await vaultStats();
          if (v) {
            vaultLine = `the vault holds $${Math.round(v.tvl).toLocaleString("en-US")}` +
              (v.apy != null ? ` at ${v.apy.toFixed(2)}% apy` : "") + ".";
          }
        } catch {}
      }
      await post(mode() === "live" ? "epoch" : "epochPrelaunch", {
        epoch: closed.epoch,
        ribbons: closed.ribbonsMinted,
        holders: closed.holders,
        voters: closed.voters,
        look: closed.winner.name,
        vault: vaultLine,
      });
    }
  }

  // read the timeline
  if (xReadEnabled()) {
    const xs = readJson("x-state.json", {});
    if (!xs.lastPollAt || Date.now() - xs.lastPollAt > MENTIONS_EVERY_MS) {
      try {
        await pollMentions();
      } catch (e) {
        console.error("mentions poll failed:", e.message);
      }
    }
  }

  // idle thoughts
  const st = readJson("agent-state.json", {});
  if (!st.lastPostAt || Date.now() - st.lastPostAt > POST_EVERY_MS) {
    const q = protocol();
    await post("idle", {
      epoch: q.epoch,
      left: left(q.nextEpochAt - Date.now()),
      voters: Object.keys(q.votes).length,
      look: q.look?.name || "rose plum",
    });
  }
}

async function loop() {
  try {
    await tick();
  } catch (e) {
    console.error("tick failed:", e);
  }
  if (ONCE) {
    console.log("done.");
    return;
  }
  setTimeout(loop, TICK_MS);
}

{
  const p = protocol();
  console.log(`mochi machine. mode=${mode()} epoch=${p.epoch} next in ${left(p.nextEpochAt - Date.now())}`);
  if (!ONCE) await post("boot", { epoch: p.epoch, left: left(p.nextEpochAt - Date.now()) });
}
loop();
