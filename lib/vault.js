// reads for the vault + staking contracts. all view calls; the server never signs anything.
import { parseAbi } from "viem";
import { client, addr } from "./chain.js";
import { readJson, writeJson } from "./store.js";

export const vaultCfg = () => ({
  vaultCa: addr(process.env.VAULT_CA || ""),
  stakingCa: addr(process.env.STAKING_CA || ""),
});

const VAULT_ABI = parseAbi([
  "function totalAssets() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function convertToAssets(uint256) view returns (uint256)",
  "function feeBps() view returns (uint256)",
  "function asset() view returns (address)",
  "function underlying() view returns (address)",
  "function balanceOf(address) view returns (uint256)",
  "function previewRedeem(uint256) view returns (uint256)",
  "function maxWithdraw(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
]);
const STAKING_ABI = parseAbi([
  "function totalStaked() view returns (uint256)",
  "function staked(address) view returns (uint256)",
  "function claimable(address) view returns (uint256)",
  "event Staked(address indexed user, uint256 amount)",
  "event Unstaked(address indexed user, uint256 amount)",
]);

const WAD = 10n ** 18n;

// price-per-share samples for the apy estimate; one per hour is plenty
export async function recordPps(pps) {
  const h = await readJson("pps-history.json", []);
  const last = h[h.length - 1];
  if (last && Date.now() - last.t < 3600_000) return;
  h.push({ t: Date.now(), pps: String(pps) });
  await writeJson("pps-history.json", h.slice(-24 * 30));
}

export async function estimateApy() {
  const h = await readJson("pps-history.json", []);
  if (h.length < 2) return null;
  const now = h[h.length - 1];
  // oldest sample within 7 days, but require at least 6h of spread
  const base = h.find((s) => now.t - s.t <= 7 * 86400_000) || h[0];
  const dt = now.t - base.t;
  if (dt < 6 * 3600_000) return null;
  const growth = Number(BigInt(now.pps) * 10n ** 9n / BigInt(base.pps)) / 1e9;
  if (!(growth > 0)) return null;
  return (Math.pow(growth, (365 * 86400_000) / dt) - 1) * 100;
}

export async function vaultStats() {
  const { vaultCa, stakingCa } = vaultCfg();
  if (!vaultCa) return null;
  const c = client();
  const calls = [
    { address: vaultCa, abi: VAULT_ABI, functionName: "totalAssets" },
    { address: vaultCa, abi: VAULT_ABI, functionName: "totalSupply" },
    { address: vaultCa, abi: VAULT_ABI, functionName: "convertToAssets", args: [WAD] },
    { address: vaultCa, abi: VAULT_ABI, functionName: "feeBps" },
    { address: vaultCa, abi: VAULT_ABI, functionName: "asset" },
    { address: vaultCa, abi: VAULT_ABI, functionName: "underlying" },
  ];
  if (stakingCa) calls.push({ address: stakingCa, abi: STAKING_ABI, functionName: "totalStaked" });
  if (stakingCa && vaultCa)
    calls.push({ address: vaultCa, abi: VAULT_ABI, functionName: "balanceOf", args: [stakingCa] });
  const r = await c.multicall({ allowFailure: false, contracts: calls });
  const pps = r[2];
  await recordPps(pps);
  const stakingShares = stakingCa ? r[7] : 0n;
  return {
    address: vaultCa,
    stakingAddress: stakingCa,
    tvl: Number(r[0]) / 1e6,
    totalShares: r[1].toString(),
    pricePerShare: Number(pps) / 1e6,
    feeBps: Number(r[3]),
    asset: r[4],
    underlying: r[5],
    apy: await estimateApy(),
    stakedMochi: stakingCa ? Number(r[6]) / 1e18 : null,
    stakingRewardsUsd: stakingCa ? (Number(stakingShares) / 1e18) * (Number(pps) / 1e6) : null,
  };
}

export async function vaultPosition(user) {
  const { vaultCa, stakingCa } = vaultCfg();
  if (!vaultCa || !user) return null;
  const c = client();
  const calls = [
    { address: vaultCa, abi: VAULT_ABI, functionName: "balanceOf", args: [user] },
    { address: vaultCa, abi: VAULT_ABI, functionName: "maxWithdraw", args: [user] },
    { address: vaultCa, abi: VAULT_ABI, functionName: "asset" },
  ];
  if (stakingCa) {
    calls.push({ address: stakingCa, abi: STAKING_ABI, functionName: "staked", args: [user] });
    calls.push({ address: stakingCa, abi: STAKING_ABI, functionName: "claimable", args: [user] });
  }
  const r = await c.multicall({ allowFailure: false, contracts: calls });
  const shares = r[0];
  const value = shares > 0n ? await c.readContract({ address: vaultCa, abi: VAULT_ABI, functionName: "previewRedeem", args: [shares] }) : 0n;
  return {
    shares: shares.toString(),
    valueUsd: Number(value) / 1e6,
    maxWithdrawUsd: Number(r[1]) / 1e6,
    staked: stakingCa ? Number(r[3]) / 1e18 : 0,
    claimableShares: stakingCa ? r[4].toString() : "0",
    claimableUsd: stakingCa ? (Number(r[4]) / 1e18) * 0 + Number(await previewUsd(r[4])) : 0,
  };
}

async function previewUsd(shares) {
  if (!(shares > 0n)) return 0;
  const { vaultCa } = vaultCfg();
  const v = await client().readContract({ address: vaultCa, abi: VAULT_ABI, functionName: "previewRedeem", args: [shares] });
  return Number(v) / 1e6;
}

/* ---- stakers index (for epoch ribbons): rebuilt from Staked/Unstaked logs, cached ---- */

async function findDeployBlock(address) {
  const c = client();
  let lo = 1n;
  let hi = await c.getBlockNumber();
  const codeAt = async (b) => (await c.getCode({ address, blockNumber: b }).catch(() => "0x")) || "0x";
  if ((await codeAt(hi)) === "0x") throw new Error("no code at staking address");
  while (lo < hi) {
    const mid = (lo + hi) / 2n;
    if ((await codeAt(mid)) === "0x") lo = mid + 1n;
    else hi = mid;
  }
  return lo;
}

export async function stakersMap() {
  const { stakingCa } = vaultCfg();
  if (!stakingCa) return {};
  const c = client();
  const cache = await readJson("stakers.json", null);
  let state = cache && cache.address === stakingCa ? cache : null;
  if (!state) {
    const from = Number(await findDeployBlock(stakingCa));
    state = { address: stakingCa, fromBlock: from, balances: {} };
  }
  const head = Number(await c.getBlockNumber());
  let from = state.fromBlock;
  let chunk = 40_000;
  while (from <= head) {
    const to = Math.min(from + chunk - 1, head);
    try {
      const logs = await c.getLogs({
        address: stakingCa,
        events: STAKING_ABI.filter((x) => x.type === "event"),
        fromBlock: BigInt(from),
        toBlock: BigInt(to),
      });
      for (const l of logs) {
        const u = l.args.user;
        const amt = Number(l.args.amount) / 1e18;
        state.balances[u] = (state.balances[u] || 0) + (l.eventName === "Staked" ? amt : -amt);
        if (state.balances[u] <= 1e-9) delete state.balances[u];
      }
      from = to + 1;
      state.fromBlock = from;
    } catch (e) {
      if (chunk > 2000) chunk = Math.floor(chunk / 4);
      else throw e;
    }
  }
  await writeJson("stakers.json", state);
  return state.balances;
}
