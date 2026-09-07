"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession, ConnectButton, short } from "../wallet.js";
import { useJson, fmt, useCountdown, LookSwatches, LookBadges, SLOT_LABEL } from "../ui.js";
import VrmStage from "../character-vrm.js";
import { parseUnits, vaultDeposit, vaultWithdraw, vaultRedeemShares, stakeMochi, unstakeMochi, claimRewards } from "../tx.js";

const MODEL_URL = process.env.NEXT_PUBLIC_CHARACTER_MODEL || "/mochi.vrm";
const TABS = ["vault", "stake", "wardrobe", "vote", "gifts", "ledger"];

async function api(url, body) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) });
  const j = await r.json().catch(() => ({ ok: false, error: "something broke" }));
  if (!j.ok) throw new Error(j.error || "something broke");
  return j;
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Dashboard />
    </Suspense>
  );
}

function Dashboard() {
  const params = useSearchParams();
  const s = useSession();
  const me = s?.me;
  const signed = !!me?.address;
  const [tab, setTab] = useState(() => (TABS.includes(params.get("tab")) ? params.get("tab") : "vault"));
  const rawState = useJson("/api/state", 15000);
  const state = rawState?.ok ? rawState : null;
  const shop = useJson("/api/shop", 0);
  const vote = useJson("/api/vote", 15000);
  const act = useJson("/api/activity", 15000);
  const feed = useJson("/api/feed", 20000);
  const [preview, setPreview] = useState(null); // hues override while hovering a candidate
  const [wear, setWear] = useState("mine"); // mine | chain
  const [signal, setSignal] = useState(null);
  const { text: cd } = useCountdown(state?.nextEpochAt);
  const live = state?.mode === "live";

  const showingMine = wear === "mine" && signed && me?.equipped?.length;
  const lookCfg = preview || (showingMine ? me?.look : state?.look) || {};

  useEffect(() => {
    if (!feed?.entries?.[0]) return;
    setSignal({ t: Date.now(), kind: "speak", text: feed.entries[0].text });
  }, [feed?.entries?.[0]?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="ambient" aria-hidden="true" />
      <main className="dash">
        <header className="dash-bar">
          <a href="/" className="brand"><img src="/logo.png" alt="" /><span className="wordmark">mochi</span></a>
          <span className="crumb">wardrobe / <b>{tab}</b></span>
          <div className="dash-stats">
            <span>engine <b className={state?.agentOnline ? (live ? "live" : "pre") : ""}>{state ? (state.agentOnline ? (live ? "live" : "pre-launch") : "offline") : "…"}</b></span>
            <span>epoch <b>{state ? String(state.epoch).padStart(3, "0") : "–"}</b></span>
            <span>next <b>{cd}</b></span>
            <span>block <b>{state?.chain?.block ? fmt.n(state.chain.block) : "–"}</b></span>
          </div>
          <ConnectButton className="btn btn-sm" />
        </header>

        <div className="dash-body">
          <section className="dash-stage" aria-label="mochi">
            {MODEL_URL.toLowerCase().endsWith(".vrm") && (
              <VrmStage url={lookCfg?.model || MODEL_URL} mode="full" custom={lookCfg} signal={signal} onReady={() => setSignal({ t: Date.now(), kind: "greet" })} />
            )}
            <div className="stage-tag look-toggle">
              <button className={wear === "chain" || !signed ? "on" : ""} onClick={() => setWear("chain")}>chain's look</button>
              <button className={wear === "mine" && signed ? "on" : ""} onClick={() => setWear("mine")} disabled={!signed}>my look</button>
            </div>
            <div className="stage-caption">
              <div>
                <div className="name">{preview ? "previewing" : showingMine ? "your look" : state?.look?.name || "rose plum"}</div>
                <div className="meta">{preview ? "hover off to return" : showingMine ? "equipped from your wardrobe" : state?.look?.epoch ? `won epoch ${state.look.epoch} · ${fmt.n(state.look.voters)} votes` : "her original look"}</div>
              </div>
              <span>
                <LookSwatches hues={lookCfg?.hues} />
                <LookBadges look={lookCfg} />
              </span>
            </div>
          </section>

          <section className="dash-panel">
            <div className="dash-tabs">
              {TABS.map((t) => <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t}</button>)}
              <span className="spacer" />
              {signed && <span className="ribbons">{fmt.n(me.ribbons)} ribbons</span>}
            </div>
            <div className="panel-body">
              {!signed && <SignInCard s={s} tab={tab} />}
              {tab === "vault" && <VaultTab me={me} state={state} s={s} signed={signed} />}
              {tab === "stake" && <StakeTab me={me} state={state} s={s} signed={signed} />}
              {tab === "wardrobe" && <Wardrobe me={me} shop={shop} s={s} signed={signed} />}
              {tab === "vote" && <Ballot me={me} vote={vote} state={state} s={s} signed={signed} setPreview={setPreview} />}
              {tab === "gifts" && <Gifts me={me} shop={shop} state={state} s={s} signed={signed} />}
              {tab === "ledger" && <Ledger me={me} state={state} />}
            </div>
          </section>

          <aside className="dash-feed">
            <div className="head"><span>live</span><span>{state?.agentOnline ? <><i className="dot ok" />engine on</> : <><i className="dot bad" />engine off</>}</span></div>
            <div className="list">
              {(feed?.entries || []).slice(0, 3).map((e) => (
                <div className="post" key={e.id}>{e.text}<span className="when">{fmt.ago(e.createdAt)}</span></div>
              ))}
              {(act?.rows || []).map((r, i) => (
                <div className="act" key={i}>
                  <span className="t">{fmt.time(r.t)}</span>
                  <span><span className={`a ${r.action}`} style={{ textTransform: "uppercase", fontSize: 10, letterSpacing: ".08em" }}>{r.action}</span> {fmt.addr(r.wallet)} {r.amount != null ? <span className={r.amount > 0 ? "up" : "down"}>{(r.amount > 0 ? "+" : "") + fmt.n(r.amount)}</span> : "item"}</span>
                </div>
              ))}
              {!(act?.rows || []).length && !(feed?.entries || []).length && <div className="tempty" style={{ padding: 18 }}>quiet. the first epoch has not closed.</div>}
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}

function SignInCard({ s, tab }) {
  const copy = {
    vault: "the numbers are public. depositing and withdrawing happens from your own wallet.",
    stake: "staking happens from your own wallet. sign in to see your position.",
    wardrobe: "browse freely. buying and equipping needs a signed-in wallet.",
    vote: "the ballot is public. casting a vote needs a signed-in wallet.",
    gifts: "sending ribbons or items needs a signed-in wallet.",
    ledger: "the public ledger is below. sign in to see your own.",
  }[tab];
  return (
    <div className="gate-card">
      <div className="h3">sign in with your wallet</div>
      <p>{copy} the signature is a message, not a transaction. it costs nothing and moves nothing.</p>
      <ConnectButton />
      {s?.err && <span className="err">{s.err}</span>}
    </div>
  );
}

/* ---------- vault ---------- */

function useTx(s) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const run = async (label, fn) => {
    setBusy(true);
    setMsg(null);
    try {
      const hash = await fn();
      setMsg({ ok: `${label} confirmed`, hash });
      await s.refresh();
    } catch (e) {
      setMsg({ err: e?.code === 4001 ? "you cancelled it" : e?.message || `${label} failed` });
    } finally {
      setBusy(false);
    }
  };
  return { busy, msg, run };
}

function TxNote({ msg, explorer }) {
  if (!msg) return null;
  if (msg.err) return <span className="err">{msg.err}</span>;
  return (
    <span className="okmsg">
      {msg.ok}
      {msg.hash && explorer && (
        <> · <a className="link" href={`${explorer}/tx/${msg.hash}`} target="_blank" rel="noopener noreferrer">receipt</a></>
      )}
    </span>
  );
}

function VaultTab({ me, state, s, signed }) {
  const v = state?.vault;
  const cx = state?.contracts;
  const pos = me?.vault;
  const [amtIn, setAmtIn] = useState("");
  const [amtOut, setAmtOut] = useState("");
  const { busy, msg, run } = useTx(s);
  if (!cx?.vault)
    return (
      <div className="gate-card">
        <div className="h3">the vault is not deployed yet</div>
        <p>
          deposit USDG, receive mUSD, and the share price earns real lending yield through spark on robinhood
          chain. no lockups, no claiming, no emissions. it goes live with the token.
        </p>
      </div>
    );
  const provider = s.provider();
  const deposit = (e) => {
    e.preventDefault();
    run("deposit", async () =>
      vaultDeposit(provider, me.address, { usdg: cx.usdg, vault: cx.vault, amount: parseUnits(amtIn, 6) })
    ).then(() => setAmtIn(""));
  };
  const withdraw = (e) => {
    e.preventDefault();
    run("withdrawal", async () =>
      vaultWithdraw(provider, me.address, { vault: cx.vault, amount: parseUnits(amtOut, 6) })
    ).then(() => setAmtOut(""));
  };
  const withdrawAll = () =>
    run("withdrawal", async () => vaultRedeemShares(provider, me.address, { vault: cx.vault, shares: BigInt(pos.shares) }));
  return (
    <>
      <p className="panel-note">
        <b>the vault.</b> USDG in, mUSD out. deposits are routed into spark's savings vault on robinhood chain and
        the mUSD share price accrues the interest. withdraw whenever, nothing to claim.{" "}
        {v?.feeBps != null && <>mochi takes {v.feeBps / 100}% of the yield (never the principal) and pays it to $MOCHI stakers.</>}
      </p>
      <div className="tiles compact">
        <div className="tile"><div className="v">{v ? fmt.usd(v.tvl) : "–"}</div><div className="l">tvl</div></div>
        <div className="tile"><div className="v">{v?.apy != null ? v.apy.toFixed(2) + "%" : "–"}</div><div className="l">apy (7d, net)</div></div>
        <div className="tile"><div className="v">{v ? "$" + v.pricePerShare.toFixed(4) : "–"}</div><div className="l">mUSD share price</div></div>
        <div className="tile"><div className="v">{pos ? fmt.usd(pos.valueUsd) : signed ? "$0" : "–"}</div><div className="l">your position</div></div>
      </div>
      {signed && (
        <>
          <form className="form card" style={{ padding: 18 }} onSubmit={deposit}>
            <div className="field">
              <label>
                deposit usdg · you have {me.usdgBalance != null ? fmt.n(me.usdgBalance, 2) : "–"}
                {me.usdgBalance > 0 && (
                  <button type="button" className="link" style={{ marginLeft: 8 }} onClick={() => setAmtIn(String(me.usdgBalance))}>max</button>
                )}
              </label>
              <input value={amtIn} onChange={(e) => setAmtIn(e.target.value)} placeholder="100" inputMode="decimal" required />
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <button className="btn btn-sm" disabled={busy}>{busy ? "check your wallet…" : "deposit"}</button>
            </div>
          </form>
          <form className="form card" style={{ padding: 18 }} onSubmit={withdraw}>
            <div className="field">
              <label>withdraw usdg · available {pos ? fmt.n(pos.maxWithdrawUsd, 2) : "0"}</label>
              <input value={amtOut} onChange={(e) => setAmtOut(e.target.value)} placeholder="100" inputMode="decimal" required />
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <button className="btn-ghost btn-sm" disabled={busy}>withdraw</button>
              {pos?.shares !== "0" && pos && (
                <button type="button" className="link" disabled={busy} onClick={withdrawAll}>withdraw everything</button>
              )}
              <TxNote msg={msg} explorer={state?.chain?.explorer} />
            </div>
          </form>
        </>
      )}
      <div className="table">
        <div className="trow hist head"><span>contract</span><span></span><span>address</span><span></span></div>
        {[["mUSD vault", cx.vault], ["underlying", v?.underlying], ["usdg", cx.usdg]].map(([n, a]) => a && (
          <div className="trow hist" key={n}>
            <span>{n}</span><span></span>
            <span><a className="link" href={`${state?.chain?.explorer}/address/${a}`} target="_blank" rel="noopener noreferrer">{a}</a></span>
            <span></span>
          </div>
        ))}
      </div>
    </>
  );
}

function StakeTab({ me, state, s, signed }) {
  const v = state?.vault;
  const cx = state?.contracts;
  const pos = me?.vault;
  const [amt, setAmt] = useState("");
  const [amtOut, setAmtOut] = useState("");
  const { busy, msg, run } = useTx(s);
  if (!cx?.staking)
    return (
      <div className="gate-card">
        <div className="h3">staking is not deployed yet</div>
        <p>
          stake $MOCHI and the vault's performance fee is paid to you in mUSD: dollars from real yield, never
          emissions of her own token. it goes live with the token.
        </p>
      </div>
    );
  const provider = s.provider();
  const stake = (e) => {
    e.preventDefault();
    run("stake", async () =>
      stakeMochi(provider, me.address, { mochi: cx.mochi, staking: cx.staking, amount: parseUnits(amt, 18) })
    ).then(() => setAmt(""));
  };
  const unstake = (e) => {
    e.preventDefault();
    run("unstake", async () =>
      unstakeMochi(provider, me.address, { staking: cx.staking, amount: parseUnits(amtOut, 18) })
    ).then(() => setAmtOut(""));
  };
  const claim = () => run("claim", async () => claimRewards(provider, me.address, { staking: cx.staking }));
  return (
    <>
      <p className="panel-note">
        <b>staking.</b> stake $MOCHI, earn the vault's fee stream in mUSD. rewards land continuously and claim
        whenever, and mUSD redeems to USDG in the vault tab. no lockup: unstake any time and keep what you earned.
      </p>
      <div className="tiles compact">
        <div className="tile"><div className="v">{v?.stakedMochi != null ? fmt.n(v.stakedMochi) : "–"}</div><div className="l">$mochi staked</div></div>
        <div className="tile"><div className="v">{v?.stakingRewardsUsd != null ? fmt.usd(v.stakingRewardsUsd) : "–"}</div><div className="l">rewards pool (mUSD)</div></div>
        <div className="tile"><div className="v">{pos ? fmt.n(pos.staked) : signed ? "0" : "–"}</div><div className="l">your stake</div></div>
        <div className="tile"><div className="v">{pos ? fmt.usd(pos.claimableUsd) : "–"}</div><div className="l">your claimable</div></div>
      </div>
      {signed && (
        <>
          <form className="form card" style={{ padding: 18 }} onSubmit={stake}>
            <div className="field">
              <label>
                stake $mochi · you have {me.tokenBalance != null ? fmt.n(me.tokenBalance, 2) : "–"}
                {me.tokenBalance > 0 && (
                  <button type="button" className="link" style={{ marginLeft: 8 }} onClick={() => setAmt(String(me.tokenBalance))}>max</button>
                )}
              </label>
              <input value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="1000" inputMode="decimal" required />
            </div>
            <button className="btn btn-sm" disabled={busy} style={{ justifySelf: "start" }}>{busy ? "check your wallet…" : "stake"}</button>
          </form>
          <form className="form card" style={{ padding: 18 }} onSubmit={unstake}>
            <div className="field">
              <label>unstake · staked {pos ? fmt.n(pos.staked, 2) : "0"}</label>
              <input value={amtOut} onChange={(e) => setAmtOut(e.target.value)} placeholder="1000" inputMode="decimal" required />
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <button className="btn-ghost btn-sm" disabled={busy}>unstake</button>
              <button type="button" className="btn btn-sm" disabled={busy || !pos || !(pos.claimableUsd > 0)} onClick={claim}>
                claim {pos && pos.claimableUsd > 0 ? fmt.usd(pos.claimableUsd) : "rewards"}
              </button>
              <TxNote msg={msg} explorer={state?.chain?.explorer} />
            </div>
          </form>
        </>
      )}
      <p className="panel-note">
        stakers also earn ribbons every epoch. staked $MOCHI counts the same as held $MOCHI for the wardrobe and
        the vote.
      </p>
    </>
  );
}

/* ---------- wardrobe ---------- */

// tiny drawings of each headwear item, colored like the real 3d accessory
const MESH_ICONS = {
  "cat-ears": (
    <>
      <path d="M6 26 L10 8 L18 23 Z" fill="#c23f6c" />
      <path d="M9.4 20.5 L11 12.5 L14.6 19 Z" fill="#ff93c9" />
      <path d="M26 26 L22 8 L14 23 Z" fill="#c23f6c" />
      <path d="M22.6 20.5 L21 12.5 L17.4 19 Z" fill="#ff93c9" />
    </>
  ),
  halo: <ellipse cx="16" cy="16" rx="11" ry="5.5" fill="none" stroke="#ffd75e" strokeWidth="3.4" />,
  "witch-hat": (
    <>
      <ellipse cx="16" cy="24" rx="13" ry="3.6" fill="#3a1f40" />
      <path d="M17.5 4 L24 23 L8 23 Z" fill="#3a1f40" />
      <path d="M9.7 19 L22.6 19 L23.7 22.4 L8.6 22.4 Z" fill="#ff5fae" />
    </>
  ),
  glasses: (
    <>
      <circle cx="9.5" cy="17" r="5.6" fill="none" stroke="#b9bac9" strokeWidth="2.2" />
      <circle cx="22.5" cy="17" r="5.6" fill="none" stroke="#b9bac9" strokeWidth="2.2" />
      <path d="M15 16.4 L17 16.4" stroke="#b9bac9" strokeWidth="2.2" />
    </>
  ),
  horns: (
    <>
      <path d="M6 25 Q6 10 12.5 7 Q12 17 11 25 Z" fill="#d1265c" />
      <path d="M26 25 Q26 10 19.5 7 Q20 17 21 25 Z" fill="#d1265c" />
    </>
  ),
  "star-pin": <path d="M16 4 L18.9 12.1 L27.4 12.3 L20.6 17.5 L23.1 25.7 L16 20.8 L8.9 25.7 L11.4 17.5 L4.6 12.3 L13.1 12.1 Z" fill="#ffd75e" />,
  hairpin: (
    <>
      <rect x="4" y="14.4" width="24" height="3.2" rx="1.6" fill="#ffd75e" transform="rotate(24 16 16)" />
      <rect x="4" y="14.4" width="24" height="3.2" rx="1.6" fill="#ffd75e" transform="rotate(-24 16 16)" />
    </>
  ),
  bow: (
    <>
      <path d="M14 16 L4.5 9.5 L4.5 22.5 Z" fill="#ff5fae" />
      <path d="M18 16 L27.5 9.5 L27.5 22.5 Z" fill="#ff5fae" />
      <circle cx="16" cy="16" r="3.4" fill="#d13c88" />
    </>
  ),
  flower: (
    <>
      {[0, 60, 120, 180, 240, 300].map((a) => (
        <circle key={a} cx={16 + 7.2 * Math.cos((a * Math.PI) / 180)} cy={16 + 7.2 * Math.sin((a * Math.PI) / 180)} r="4.6" fill="#fff4fa" />
      ))}
      <circle cx="16" cy="16" r="3.6" fill="#ffd75e" />
    </>
  ),
  beret: (
    <>
      <path d="M4.5 20 Q16 5 27.5 20 Q16 26 4.5 20 Z" fill="#c22c48" />
      <rect x="15" y="6" width="2" height="3.6" rx="1" fill="#c22c48" />
    </>
  ),
  "bunny-ears": (
    <>
      <rect x="7" y="4" width="7" height="21" rx="3.5" fill="#fdf6f9" transform="rotate(-6 10.5 14)" />
      <rect x="9.6" y="8" width="2.8" height="12" rx="1.4" fill="#ff9ccc" transform="rotate(-6 10.5 14)" />
      <rect x="18" y="4" width="7" height="21" rx="3.5" fill="#fdf6f9" transform="rotate(6 21.5 14)" />
      <rect x="19.6" y="8" width="2.8" height="12" rx="1.4" fill="#ff9ccc" transform="rotate(6 21.5 14)" />
    </>
  ),
  crown: (
    <>
      <path d="M6 25 L5 11 L11.5 16.5 L16 8 L20.5 16.5 L27 11 L26 25 Z" fill="#ffd75e" />
      <circle cx="16" cy="21" r="2.2" fill="#ff5fae" />
    </>
  ),
};

const MeshIcon = ({ mesh }) =>
  MESH_ICONS[mesh] ? (
    <svg viewBox="0 0 32 32" width="70%" height="70%" aria-hidden="true">{MESH_ICONS[mesh]}</svg>
  ) : (
    "✦"
  );

function ItemChip({ it }) {
  if (it.kind === "pattern") {
    const c = `hsl(${it.hue} 62% 46%)`;
    const bg =
      it.pattern === "stripes"
        ? `repeating-linear-gradient(45deg, ${c} 0 6px, #3a2a3f 6px 12px)`
        : it.pattern === "dots"
          ? `radial-gradient(circle at 6px 6px, ${c} 3.4px, transparent 3.6px), radial-gradient(circle at 16px 16px, ${c} 3.4px, transparent 3.6px), #3a2a3f`
          : `repeating-conic-gradient(${c} 0% 25%, #3a2a3f 0% 50%)`;
    return <span className="sw" style={{ background: bg, backgroundSize: it.pattern === "dots" ? "20px 20px" : it.pattern === "checker" ? "16px 16px" : undefined }} />;
  }
  if (it.kind === "mesh") {
    if (it.base) return <span className="sw orig" />;
    return <span className="sw mesh"><MeshIcon mesh={it.mesh} /></span>;
  }
  if (it.kind === "model") {
    if (it.base) return <span className="sw orig" />;
    return <span className="sw mesh">✦</span>;
  }
  if (it.hue == null) return <span className="sw orig" />;
  return <span className="sw" style={{ background: `hsl(${it.hue} 70% 55%)` }} />;
}

function Wardrobe({ me, shop, s, signed }) {
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const items = shop?.items || [];
  const slots = shop?.slots || [];
  const owned = new Set(me?.inventory || []);
  const equipped = new Set(me?.equipped || []);

  const equip = async (it) => {
    if (!signed) return;
    // one item per slot; clicking the equipped item takes it off (back to original)
    const next = (me.equipped || []).filter((id) => items.find((x) => x.id === id)?.slot !== it.slot);
    if (!equipped.has(it.id) && !it.base) next.push(it.id);
    setBusy(it.id); setMsg(null);
    try {
      await api("/api/equip", { items: next });
      await s.refresh();
    } catch (e) { setMsg({ err: e.message }); } finally { setBusy(null); }
  };
  const buy = async (it) => {
    if (!signed) return;
    setBusy(it.id); setMsg(null);
    try {
      await api("/api/shop", { itemId: it.id });
      await s.refresh();
      setMsg({ ok: `${it.name} is yours. tap it again to wear it.` });
    } catch (e) { setMsg({ err: e.message }); } finally { setBusy(null); }
  };

  return (
    <>
      <p className="panel-note">
        <b>the wardrobe.</b> colors, fabric prints, and real headwear. base items are hers and free; everything else costs
        ribbons, earned by holding or staking at each epoch close. tap an owned item to wear it; your look follows your wallet. {msg?.err && <span className="err">{msg.err}</span>}{msg?.ok && <span className="okmsg">{msg.ok}</span>}
      </p>
      {slots.map((slot) => (
        <div className="slot" key={slot}>
          <div className="slot-head"><div className="h3">{SLOT_LABEL[slot]}</div><span>{items.filter((i) => i.slot === slot && owned.has(i.id)).length} owned</span></div>
          <div className="items">
            {items.filter((i) => i.slot === slot).map((it) => {
              const own = it.base || owned.has(it.id);
              const on = it.base ? !(me?.equipped || []).some((id) => items.find((x) => x.id === id)?.slot === slot) && signed : equipped.has(it.id);
              return (
                <button
                  key={it.id}
                  className={"item" + (on ? " is-on" : "")}
                  disabled={!signed || busy === it.id}
                  onClick={() => (own ? equip(it) : buy(it))}
                  title={own ? (on ? "wearing" : "wear it") : `buy for ${it.price} ribbons`}
                >
                  <ItemChip it={it} />
                  <span className="nm">{it.name}</span>
                  <span className={"pr" + (own ? " owned" : "")}>
                    <span className={`tier tier-${it.tier}`}>{it.tier}</span>
                    <span>{it.base ? "hers" : own ? (on ? "wearing" : "owned") : `${it.price} rb`}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

/* ---------- ballot ---------- */

function Ballot({ me, vote, state, s, signed, setPreview }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [mine, setMine] = useState(null);
  useEffect(() => setMine(vote?.mine ?? null), [vote?.mine]);
  const cands = vote?.candidates || [];
  const total = Math.max(1, cands.reduce((a, c) => a + c.votes, 0));
  const live = state?.mode === "live";
  const cast = async (c) => {
    if (!signed) return;
    setBusy(true); setErr(null);
    try {
      const j = await api("/api/vote", { candidateId: c.id });
      setMine(j.mine);
      await s.refresh();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <>
      <p className="panel-note">
        <b>the ballot for epoch {state?.epoch ?? "–"}.</b> four looks, one vote per wallet, {live ? "weighted by your balance at close" : "one vote each until launch"}.
        the winner is what she wears in public until the next close. hover a look to try it on her. {err && <span className="err">{err}</span>}
      </p>
      <div className="ballot">
        {cands.map((c) => (
          <button
            key={c.id}
            className={"cand" + (mine === c.id ? " is-mine" : "")}
            onMouseEnter={() => setPreview(c)}
            onMouseLeave={() => setPreview(null)}
            onClick={() => cast(c)}
            disabled={!signed || busy}
          >
            <div className="nm">{c.name}</div>
            <span><LookSwatches hues={c.hues} /> <LookBadges look={c} /></span>
            <div className="bar"><i style={{ width: `${(c.votes / total) * 100}%` }} /></div>
            <div className="meta"><span>{fmt.n(c.votes)} {c.votes === 1 ? "vote" : "votes"}</span><span>{mine === c.id ? "your vote" : signed ? "vote" : "sign in to vote"}</span></div>
          </button>
        ))}
      </div>
      <p className="panel-note">{fmt.n(vote?.voters)} wallets have voted. {live ? `voters also receive ${state?.rules?.voterBonus} ribbons at close.` : `voters receive ${state?.rules?.prelaunchRibbons} ribbons at close while the token is pre-launch.`}</p>
    </>
  );
}

/* ---------- gifts ---------- */

function Gifts({ me, shop, state, s, signed }) {
  const [kind, setKind] = useState("ribbons");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [itemId, setItemId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const items = shop?.items || [];
  const owned = (me?.inventory || []).map((id) => items.find((i) => i.id === id)).filter(Boolean);
  const bot = state?.xUsername || "mochi";
  const send = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const j = await api("/api/gift", { to, ribbons: kind === "ribbons" ? Number(amount) : 0, itemId: kind === "item" ? itemId : null });
      setMsg({ ok: "sent. delivered." });
      setAmount(""); setItemId("");
      await s.refresh();
    } catch (er) { setMsg({ err: er.message }); } finally { setBusy(false); }
  };
  return (
    <>
      <p className="panel-note"><b>gifts.</b> send ribbons or an item you own to any wallet address. delivered instantly, receipt on the ledger.</p>
      {signed && (
        <form className="form card" style={{ padding: 18 }} onSubmit={send}>
          <div className="seg"><button type="button" className={kind === "ribbons" ? "on" : ""} onClick={() => setKind("ribbons")}>ribbons</button><button type="button" className={kind === "item" ? "on" : ""} onClick={() => setKind("item")}>an item</button></div>
          <div className="form-row">
            <div className="field"><label>to</label><input value={to} onChange={(e) => setTo(e.target.value)} placeholder="0x…" required /></div>
            {kind === "ribbons" ? (
              <div className="field"><label>ribbons · you have {fmt.n(me.ribbons)}</label><input type="number" min="1" max={Math.max(1, me.ribbons)} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="50" required /></div>
            ) : (
              <div className="field"><label>item</label>
                <select value={itemId} onChange={(e) => setItemId(e.target.value)} required>
                  <option value="">{owned.length ? "choose one you own" : "you own nothing giftable yet"}</option>
                  {owned.map((i) => <option key={i.id} value={i.id}>{SLOT_LABEL[i.slot]} · {i.name}</option>)}
                </select>
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <button className="btn btn-sm" disabled={busy}>{busy ? "sending…" : "send gift"}</button>
            {msg?.err && <span className="err">{msg.err}</span>}
            {msg?.ok && <span className="okmsg">{msg.ok}</span>}
          </div>
        </form>
      )}
      <div>
        <div className="h3" style={{ marginBottom: 10 }}>epochs</div>
        <div className="table">
          <div className="trow ep head"><span>#</span><span>winner</span><span>voters</span><span>holders</span><span>minted</span></div>
          {(ep?.rows || []).length === 0 && <div className="tempty">epoch {state?.epoch ?? 1} is the first. it has not closed.</div>}
          {(ep?.rows || []).map((r) => (
            <div className="trow ep" key={r.epoch}>
              <span>{String(r.epoch).padStart(3, "0")}</span>
              <span style={{ textTransform: "capitalize" }}><LookSwatches hues={r.winner.hues} /> &nbsp;{r.winner.name}</span>
              <span>{fmt.n(r.voters)}</span><span>{fmt.n(r.holders)}</span><span className="up">+{fmt.n(r.ribbonsMinted)}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
