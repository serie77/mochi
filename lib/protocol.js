// the epoch machine. holders are read from the chain, ribbons are minted to the ledger,
// the vote is tallied, and she changes. nothing here needs a private key.
//
// runs two ways: a long-lived engine process (self-hosting) calls runEpoch on a timer,
// or serverless hosting closes epochs on demand via maybeCloseEpoch() inside requests.
import { cfg, readJson, writeJson, withLock } from "./store.js";
import { candidatesFor, BASE_LOOK, itemById, lookConfig } from "./catalog.js";
import { holders as chainHolders } from "./chain.js";
import { stakersMap, vaultCfg, vaultStats } from "./vault.js";
import { credit } from "./ledger.js";

export const epochMs = () => cfg().epochHours * 3600 * 1000;

const DEFAULT = () => {
  const now = Date.now();
  return {
    epoch: 1,
    epochStartedAt: now,
    nextEpochAt: now + epochMs(),
    look: { ...BASE_LOOK, epoch: 0, weight: 0 },
    candidates: candidatesFor(1),
    votes: {},
    lastSnapshot: null,
  };
};

export async function protocol() {
  const p = await readJson("protocol.json", null);
  if (p) return p;
  const d = DEFAULT();
  await writeJson("protocol.json", d);
  return d;
}

export const mode = () => (cfg().tokenCa ? "live" : "prelaunch");

export function castVote(addr, candidateId) {
  return withLock(async () => {
    const p = await protocol();
    if (!p.candidates.some((c) => c.id === candidateId)) throw new Error("that look is not on the ballot");
    p.votes[addr] = candidateId;
    await writeJson("protocol.json", p);
    return p;
  });
}

export function tally(p, weights) {
  const t = {};
  for (const c of p.candidates) t[c.id] = 0;
  for (const [a, cid] of Object.entries(p.votes)) {
    if (t[cid] == null) continue;
    t[cid] += weights ? weights[a] || 0 : 1;
  }
  return t;
}

export async function runEpoch({ now = Date.now(), force = false } = {}) {
  const c = cfg();
  const p0 = await protocol();
  if (!force && now < p0.nextEpochAt) return null;

  // 1. snapshot: read once, outside the lock, it can take seconds.
  //    weight of a wallet = tokens held + tokens staked (staked tokens sit in the
  //    staking contract, which the holder list filters out as a contract).
  let weights = null;
  let snapshotError = null;
  if (c.tokenCa) {
    try {
      const list = (await chainHolders(c.tokenCa)).filter(
        (h) => !h.contract && Number(h.balance) / 1e18 >= c.minHold
      );
      weights = {};
      for (const h of list) weights[h.address] = Number(h.balance) / 1e18;
    } catch (e) {
      snapshotError = e.message;
    }
    if (vaultCfg().stakingCa) {
      try {
        const stakers = await stakersMap();
        weights ||= {};
        for (const [a, amt] of Object.entries(stakers)) {
          if (amt >= c.minHold) weights[a] = (weights[a] || 0) + amt;
        }
      } catch (e) {
        snapshotError = (snapshotError ? snapshotError + "; " : "") + "stakers: " + e.message;
      }
    }
  }

  return withLock(async () => {
    const p = await protocol();
    if (!force && now < p.nextEpochAt) return null;
    const t = tally(p, weights);
    const winner = p.candidates.slice().sort((a, b) => t[b.id] - t[a.id])[0] || p.candidates[0];
    const voters = Object.keys(p.votes);
    const winnerWeight = t[winner.id] || 0;

    // 2. mint ribbons (already under the lock, so write the ledger file directly)
    const minted = [];
    const entries = weights ? Object.entries(weights) : null;
    if (entries && entries.length) {
      const supplyHeld = entries.reduce((s, [, w]) => s + w, 0);
      for (const [a, w] of entries) {
        const n = Math.floor((w / supplyHeld) * c.ribbonsPerEpoch);
        if (n > 0) minted.push([a, n]);
      }
    }
    const voterSet = new Set(voters);
    for (const a of voterSet) minted.push([a, weights ? c.voterBonus : c.prelaunchRibbons]);

    const ledger = await readJson("ledger.json", { balances: {}, history: [] });
    const touch = () => {};
    const s = { ledger };
    let total = 0;
    for (const [a, n] of minted) {
      credit(s, touch, a, n, "epoch", p.epoch);
      total += n;
    }
    ledger.history = ledger.history.slice(-5000);
    await writeJson("ledger.json", ledger);

    // 3. she changes
    const closed = {
      epoch: p.epoch,
      closedAt: now,
      holders: entries ? entries.length : 0,
      voters: voters.length,
      ribbonsMinted: total,
      winner: { id: winner.id, name: winner.name, items: winner.items, ...lookConfig(winner.items) },
      tally: t,
      candidates: p.candidates.map((x) => ({ id: x.id, name: x.name })),
      snapshotError,
    };
    const epochs = await readJson("epochs.json", []);
    epochs.push(closed);
    await writeJson("epochs.json", epochs.slice(-500));

    const next = {
      epoch: p.epoch + 1,
      epochStartedAt: now,
      nextEpochAt: now + epochMs(),
      look: { ...closed.winner, epoch: p.epoch, weight: winnerWeight, voters: voters.length },
      candidates: candidatesFor(p.epoch + 1),
      votes: {},
      lastSnapshot: entries ? { at: now, holders: entries.length } : p.lastSnapshot,
    };
    await writeJson("protocol.json", next);
    return closed;
  });
}

// serverless path: close a due epoch inside a request and post her report to the feed.
// safe under races: runEpoch takes the lock and re-checks the clock.
let closing = false;
export async function maybeCloseEpoch() {
  const p = await protocol();
  if (Date.now() < p.nextEpochAt || closing) return null;
  closing = true;
  try {
    const closed = await runEpoch({});
    if (closed) {
      let vaultLine = "";
      if (vaultCfg().vaultCa) {
        try {
          const v = await vaultStats();
          if (v && v.tvl > 0) {
            vaultLine =
              `the vault holds $${Math.round(v.tvl).toLocaleString("en-US")}` +
              (v.apy != null ? ` at ${v.apy.toFixed(2)}% apy` : "") + ".";
          }
        } catch {}
      }
      const { compose } = await import("../agent/persona.js");
      const text = await compose(mode() === "live" ? "epoch" : "epochPrelaunch", {
        epoch: closed.epoch,
        ribbons: closed.ribbonsMinted,
        holders: closed.holders,
        voters: closed.voters,
        look: closed.winner.name,
        vault: vaultLine,
      });
      const { pushCapped } = await import("./store.js");
      await pushCapped(
        "feed.json",
        { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, createdAt: Date.now(), kind: "epoch", text, tweetId: null },
        300
      );
    }
    return closed;
  } finally {
    closing = false;
  }
}

// resolve a look object for the renderer from an equipped item list
export function lookFromItems(items) {
  const ids = (items || []).filter((id) => itemById(id));
  return { items: ids, ...lookConfig(ids) };
}
