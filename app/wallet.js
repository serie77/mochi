"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";

// evm wallet session with a proper wallet picker: providers are discovered via eip-6963
// (metamask, phantom, rabby, okx, whatever is installed) and the visitor chooses one.
// connect -> switch to robinhood chain -> sign a nonce -> httponly cookie. nothing is spent.

const CHAIN_ID_HEX = "0x1237"; // 4663
const CHAIN_PARAMS = {
  chainId: CHAIN_ID_HEX,
  chainName: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"],
  blockExplorerUrls: ["https://robinhoodchain.blockscout.com"],
};

const Ctx = createContext(null);

export function SessionProvider({ children }) {
  const [me, setMe] = useState(null); // null = loading, {address:null} = signed out
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [wallets, setWallets] = useState([]); // [{ info: {uuid,name,icon}, provider }]
  const [pickerOpen, setPickerOpen] = useState(false);
  const activeRef = useRef(null);

  // eip-6963 discovery, with plain window.ethereum as the fallback
  useEffect(() => {
    const found = new Map();
    const onAnnounce = (e) => {
      const d = e.detail;
      if (!d?.info?.uuid || found.has(d.info.uuid)) return;
      found.set(d.info.uuid, d);
      setWallets([...found.values()]);
    };
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    const t = setTimeout(() => {
      if (!found.size && window.ethereum) {
        setWallets([{ info: { uuid: "injected", name: "browser wallet", icon: null }, provider: window.ethereum }]);
      }
    }, 400);
    return () => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
      clearTimeout(t);
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/me", { cache: "no-store" });
      const j = await r.json();
      setMe(j);
      return j;
    } catch {
      setMe({ address: null });
      return null;
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const doSignIn = async (provider, name) => {
    setPickerOpen(false);
    setErr(null);
    setBusy(true);
    try {
      const [account] = await provider.request({ method: "eth_requestAccounts" });
      if (!account) throw new Error("no account");
      try {
        await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_ID_HEX }] });
      } catch (e) {
        if (e?.code === 4902 || /unrecognized|not added|4902/i.test(e?.message || "")) {
          try {
            await provider.request({ method: "wallet_addEthereumChain", params: [CHAIN_PARAMS] });
          } catch {}
        }
        // a refusal to switch is fine, signing does not depend on the active chain
      }
      const n = await (await fetch("/api/auth/nonce", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: account }),
      })).json();
      if (!n.ok) throw new Error(n.error || "could not start sign-in");
      const signature = await provider.request({ method: "personal_sign", params: [n.message, account] });
      const v = await (await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: account, signature }),
      })).json();
      if (!v.ok) throw new Error(v.error || "sign-in failed");
      activeRef.current = provider;
      provider.on?.("accountsChanged", () => signOut());
      await refresh();
    } catch (e) {
      if (e?.code === 4001) setErr("you closed the door on yourself.");
      else if (/resource not available|unsupported|32601/i.test(e?.message || ""))
        setErr(`${name || "that wallet"} could not do it. try metamask or another evm wallet.`);
      else setErr(e?.message || "sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  const signIn = async () => {
    setErr(null);
    if (!wallets.length) {
      setErr("no wallet found. install metamask (or any evm wallet), then come back.");
      return;
    }
    if (wallets.length === 1) return doSignIn(wallets[0].provider, wallets[0].info.name);
    setPickerOpen(true);
  };

  const signOut = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {}
    activeRef.current = null;
    setMe({ address: null });
  };

  const provider = () => activeRef.current || (wallets.length === 1 ? wallets[0].provider : null) || window.ethereum || null;

  return (
    <Ctx.Provider value={{ me, ready: me !== null, busy, err, signIn, signOut, refresh, provider, wallets }}>
      {children}
      {pickerOpen && (
        <div className="wpick" onClick={() => setPickerOpen(false)}>
          <div className="wpick-card" onClick={(e) => e.stopPropagation()}>
            <div className="wpick-head">
              <span className="h3">choose a wallet</span>
              <button className="wpick-x" onClick={() => setPickerOpen(false)} aria-label="close">×</button>
            </div>
            {wallets.map((w) => (
              <button key={w.info.uuid} className="wpick-item" onClick={() => doSignIn(w.provider, w.info.name)}>
                {w.info.icon ? <img src={w.info.icon} alt="" /> : <span className="wpick-dot" />}
                <span>{w.info.name}</span>
              </button>
            ))}
            <p className="wpick-note">the signature is a message, not a transaction. it costs nothing and moves nothing.</p>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

export const useSession = () => useContext(Ctx);

// kept for callers that want a raw fallback; prefer useSession().provider()
export const getProvider = () => (typeof window === "undefined" ? null : window.ethereum || null);

export const short = (a) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "–");

export function ConnectButton({ className = "btn" }) {
  const s = useSession();
  if (!s) return null;
  if (!s.ready) return <button className={className} disabled>…</button>;
  if (s.me?.address)
    return (
      <button className={className + " is-addr"} onClick={s.signOut} title="sign out">
        <i className="dot ok" />
        {short(s.me.address)}
      </button>
    );
  return (
    <button className={className} onClick={s.signIn} disabled={s.busy}>
      {s.busy ? "check your wallet…" : "connect wallet"}
    </button>
  );
}
