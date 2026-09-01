import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");

const num = (k, d) => (process.env[k] !== undefined && process.env[k] !== "" ? Number(process.env[k]) : d);

export const cfg = () => ({
  tokenCa: (process.env.TOKEN_CA || "").trim(),
  vaultCa: (process.env.VAULT_CA || "").trim(),
  stakingCa: (process.env.STAKING_CA || "").trim(),
  usdgCa: process.env.USDG_CA || "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
  rpcUrl: process.env.RPC_URL || "https://rpc.mainnet.chain.robinhood.com",
  chainId: 4663,
  explorer: "https://robinhoodchain.blockscout.com",
  xUsername: (process.env.X_USERNAME || "").replace(/^@/, ""),
  epochHours: num("EPOCH_HOURS", 4),
  ribbonsPerEpoch: num("RIBBONS_PER_EPOCH", 1000),
  voterBonus: num("VOTER_BONUS", 5),
  prelaunchRibbons: num("PRELAUNCH_RIBBONS", 10),
  minHold: num("MIN_HOLD", 0),
  buyUrl: process.env.BUY_URL || "",
});

export function readJson(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), "utf8"));
  } catch {
    return fallback;
  }
}

export function writeJson(name, obj) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const file = path.join(DATA_DIR, name);
  const tmp = file + "." + process.pid + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, file);
}

// cross-process mutex: the site and the agent both write the ledger.
// exclusive-create of a lock file; stale locks (crashed holder) are broken after 10s.
const LOCK = path.join(DATA_DIR, ".lock");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function withLock(fn) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const started = Date.now();
  for (;;) {
    try {
      const fd = fs.openSync(LOCK, "wx");
      fs.writeSync(fd, String(Date.now()));
      fs.closeSync(fd);
      break;
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      try {
        const age = Date.now() - Number(fs.readFileSync(LOCK, "utf8") || 0);
        if (age > 10_000) fs.unlinkSync(LOCK);
      } catch {}
      if (Date.now() - started > 8000) throw new Error("ledger busy");
      await sleep(15 + Math.random() * 25);
    }
  }
  try {
    return await fn();
  } finally {
    try {
      fs.unlinkSync(LOCK);
    } catch {}
  }
}

export function pushCapped(name, entry, cap) {
  const arr = readJson(name, []);
  arr.push(entry);
  writeJson(name, arr.slice(-cap));
}
