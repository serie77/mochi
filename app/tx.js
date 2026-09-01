"use client";

// minimal calldata encoding + tx sending for the vault and staking contracts.
// the site never holds keys: every transaction is built here and signed by the
// visitor's own wallet. selectors are fixed, amounts are integers. nothing dynamic.

const SEL = {
  approve: "0x095ea7b3", // approve(address,uint256)
  allowance: "0xdd62ed3e", // allowance(address,address)
  deposit: "0x6e553f65", // deposit(uint256,address)
  withdraw: "0xb460af94", // withdraw(uint256,address,address)
  redeem: "0xba087652", // redeem(uint256,address,address)
  stake: "0xa694fc3a", // stake(uint256)
  unstake: "0x2e17de78", // unstake(uint256)
  claim: "0x4e71d92d", // claim()
  balanceOf: "0x70a08231", // balanceOf(address)
};

const pad = (hex) => hex.replace(/^0x/, "").padStart(64, "0");
const encAddr = (a) => pad(a.toLowerCase());
const encU256 = (v) => pad(BigInt(v).toString(16));

// "12.5" + 6 decimals -> 12500000n; throws on garbage
export function parseUnits(input, decimals) {
  const s = String(input).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error("enter a plain number");
  const [whole, frac = ""] = s.split(".");
  if (frac.length > decimals) throw new Error(`max ${decimals} decimal places`);
  return BigInt(whole + frac.padEnd(decimals, "0"));
}

export function formatUnits(v, decimals, dp = 2) {
  const n = Number(BigInt(v)) / 10 ** decimals;
  return n.toLocaleString("en-US", { maximumFractionDigits: dp });
}

export async function ensureChain(provider) {
  const id = await provider.request({ method: "eth_chainId" });
  if (id !== "0x1237") {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x1237" }] });
  }
}

async function send(provider, from, to, data) {
  await ensureChain(provider);
  return provider.request({ method: "eth_sendTransaction", params: [{ from, to, data }] });
}

async function call(provider, to, data) {
  return provider.request({ method: "eth_call", params: [{ to, data }, "latest"] });
}

async function waitFor(provider, hash, tries = 60) {
  for (let i = 0; i < tries; i++) {
    const r = await provider.request({ method: "eth_getTransactionReceipt", params: [hash] }).catch(() => null);
    if (r) {
      if (r.status !== "0x1") throw new Error("transaction reverted");
      return r;
    }
    await new Promise((res) => setTimeout(res, 1500));
  }
  throw new Error("transaction is taking a while. check the explorer");
}

export async function allowance(provider, token, owner, spender) {
  const r = await call(provider, token, SEL.allowance + encAddr(owner) + encAddr(spender));
  return BigInt(r || "0x0");
}

async function ensureAllowance(provider, from, token, spender, amount) {
  const cur = await allowance(provider, token, from, spender);
  if (cur >= amount) return null;
  const hash = await send(provider, from, token, SEL.approve + encAddr(spender) + encU256(amount));
  await waitFor(provider, hash);
  return hash;
}

/* ---- vault ---- */

export async function vaultDeposit(provider, from, { usdg, vault, amount }) {
  await ensureAllowance(provider, from, usdg, vault, amount);
  const hash = await send(provider, from, vault, SEL.deposit + encU256(amount) + encAddr(from));
  await waitFor(provider, hash);
  return hash;
}

export async function vaultWithdraw(provider, from, { vault, amount }) {
  const hash = await send(provider, from, vault, SEL.withdraw + encU256(amount) + encAddr(from) + encAddr(from));
  await waitFor(provider, hash);
  return hash;
}

export async function vaultRedeemShares(provider, from, { vault, shares }) {
  const hash = await send(provider, from, vault, SEL.redeem + encU256(shares) + encAddr(from) + encAddr(from));
  await waitFor(provider, hash);
  return hash;
}

/* ---- staking ---- */

export async function stakeMochi(provider, from, { mochi, staking, amount }) {
  await ensureAllowance(provider, from, mochi, staking, amount);
  const hash = await send(provider, from, staking, SEL.stake + encU256(amount));
  await waitFor(provider, hash);
  return hash;
}

export async function unstakeMochi(provider, from, { staking, amount }) {
  const hash = await send(provider, from, staking, SEL.unstake + encU256(amount));
  await waitFor(provider, hash);
  return hash;
}

export async function claimRewards(provider, from, { staking }) {
  const hash = await send(provider, from, staking, SEL.claim);
  await waitFor(provider, hash);
  return hash;
}
