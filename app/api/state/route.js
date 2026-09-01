import { cfg, readJson } from "../../../lib/store.js";
import { protocol, mode, tally, maybeCloseEpoch } from "../../../lib/protocol.js";
import { totals } from "../../../lib/ledger.js";
import { tokenMeta, dexInfo, holderCount, blockNumber } from "../../../lib/chain.js";
import { vaultStats } from "../../../lib/vault.js";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // an unlucky request may close an epoch (chain snapshot takes seconds)

// chain reads are cached for 30s; protocol state is read fresh every time
let cache = { at: 0, token: null, block: null, chainOk: false, vault: null };
async function chainSnapshot() {
  if (Date.now() - cache.at < 30_000) return cache;
  const c = cfg();
  const next = { at: Date.now(), token: null, block: null, chainOk: false, vault: null };
  try {
    next.block = await blockNumber();
    next.chainOk = true;
  } catch {}
  if (c.vaultCa) {
    next.vault = await vaultStats().catch(() => null);
  }
  if (c.tokenCa) {
    const [meta, dex, holders] = await Promise.all([
      tokenMeta(c.tokenCa).catch(() => null),
      dexInfo(c.tokenCa).catch(() => null),
      holderCount(c.tokenCa).catch(() => null),
    ]);
    next.token = { address: c.tokenCa, ...(meta || {}), holders, dex };
  }
  cache = next;
  return cache;
}

export async function GET() {
  const c = cfg();
  // serverless engine: close a due epoch inside the request (no-op otherwise)
  await maybeCloseEpoch().catch(() => null);
  const p = await protocol();
  const hb = await readJson("heartbeat.json", null);
  const snap = await chainSnapshot();
  const t = tally(p);
  const epochs = await readJson("epochs.json", []);
  // with a database backend the engine is embedded in the site itself
  const embedded = !!process.env.DATABASE_URL;
  return Response.json({
    ok: true,
    mode: mode(),
    epoch: p.epoch,
    epochStartedAt: p.epochStartedAt,
    nextEpochAt: p.nextEpochAt,
    epochHours: c.epochHours,
    look: p.look,
    candidates: p.candidates.map((x) => ({ ...x, votes: t[x.id] || 0 })),
    voters: Object.keys(p.votes).length,
    totals: { ...(await totals()), epochsClosed: epochs.length },
    rules: {
      ribbonsPerEpoch: c.ribbonsPerEpoch,
      voterBonus: c.voterBonus,
      prelaunchRibbons: c.prelaunchRibbons,
      minHold: c.minHold,
    },
    agentOnline: embedded || (!!hb && Date.now() - hb.time < 120_000),
    chain: { id: c.chainId, ok: snap.chainOk, block: snap.block, explorer: c.explorer },
    token: snap.token,
    vault: snap.vault,
    contracts: { usdg: c.usdgCa, vault: c.vaultCa || null, staking: c.stakingCa || null, mochi: c.tokenCa || null },
    buyUrl: c.buyUrl || snap.token?.dex?.url || null,
    xUsername: c.xUsername || null,
    giftsByTweet: !!(process.env.X_BEARER_TOKEN && c.xUsername),
    fetchedAt: new Date().toISOString(),
  });
}
