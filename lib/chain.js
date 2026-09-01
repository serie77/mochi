// robinhood chain reads: viem for rpc, blockscout for holder lists, dexscreener for price.
import { createPublicClient, defineChain, http, erc20Abi, getAddress, isAddress } from "viem";
import { cfg } from "./store.js";

export const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" } },
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
});

let _client = null;
export function client() {
  if (!_client) {
    _client = createPublicClient({
      chain: robinhoodChain,
      transport: http(cfg().rpcUrl, { batch: false, retryCount: 2, timeout: 15_000 }),
    });
  }
  return _client;
}

export const addr = (a) => (isAddress(a || "") ? getAddress(a) : null);

export async function blockNumber() {
  return Number(await client().getBlockNumber());
}

export async function tokenMeta(token) {
  const c = client();
  const [name, symbol, decimals, totalSupply] = await c.multicall({
    allowFailure: false,
    contracts: [
      { address: token, abi: erc20Abi, functionName: "name" },
      { address: token, abi: erc20Abi, functionName: "symbol" },
      { address: token, abi: erc20Abi, functionName: "decimals" },
      { address: token, abi: erc20Abi, functionName: "totalSupply" },
    ],
  });
  return { name, symbol, decimals: Number(decimals), totalSupply: totalSupply.toString() };
}

export async function balanceOf(token, owner) {
  return client().readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [owner] });
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

async function blockscout(path) {
  const r = await fetch(`${cfg().explorer}/api/v2${path}`, {
    headers: { "user-agent": UA, accept: "application/json" },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`explorer ${r.status}`);
  return r.json();
}

// every holder with a non-zero balance: [{ address, balance: bigint }], largest first
export async function holders(token, { maxPages = 200 } = {}) {
  const out = [];
  let params = "";
  for (let i = 0; i < maxPages; i++) {
    const j = await blockscout(`/tokens/${token}/holders${params}`);
    for (const it of j.items || []) {
      const a = addr(it.address?.hash);
      const bal = BigInt(it.value || "0");
      if (a && bal > 0n) out.push({ address: a, balance: bal, contract: !!it.address?.is_contract });
    }
    const np = j.next_page_params;
    if (!np) break;
    params = "?" + new URLSearchParams(Object.entries(np).map(([k, v]) => [k, String(v)])).toString();
  }
  return out;
}

export async function holderCount(token) {
  const j = await blockscout(`/tokens/${token}/counters`);
  return Number(j.token_holders_count || 0);
}

export async function dexInfo(token) {
  const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${token}`, { cache: "no-store" });
  if (!r.ok) return null;
  const j = await r.json();
  const pairs = (j?.pairs || []).filter((p) => p.chainId === "robinhood");
  if (!pairs.length) return null;
  const p = pairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
  return {
    symbol: p.baseToken?.symbol ?? "?",
    priceUsd: parseFloat(p.priceUsd) || null,
    marketCap: p.marketCap ?? p.fdv ?? null,
    liquidityUsd: p.liquidity?.usd ?? null,
    volume24h: p.volume?.h24 ?? null,
    change24h: p.priceChange?.h24 ?? null,
    url: p.url,
    dex: p.dexId,
  };
}
