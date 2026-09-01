"use client";

import { useEffect, useState } from "react";
import { useJson, fmt, Countdown, useCountdown, LookSwatches, LookBadges } from "./ui.js";
import VrmStage from "./character-vrm.js";

const MODEL_URL = process.env.NEXT_PUBLIC_CHARACTER_MODEL || "/mochi.vrm";

export function HeroMeta() {
  const raw = useJson("/api/state", 15000);
  const s = raw?.ok ? raw : null;
  const v = s?.vault;
  return (
    <div className="hero-meta">
      <div>
        <span className="label">vault tvl</span>
        <strong className="mono">{v ? fmt.usd(v.tvl) : s ? "open" : "…"}</strong>
      </div>
      <div>
        <span className="label">apy (7d, net)</span>
        <strong className="mono">{v?.apy != null ? v.apy.toFixed(2) + "%" : s ? "tracking" : "…"}</strong>
      </div>
      <div>
        <span className="label">epoch</span>
        <strong className="mono">{s?.epoch != null ? String(s.epoch).padStart(3, "0") : "…"}</strong>
      </div>
      <div>
        <span className="label">she changes in</span>
        <strong className="mono"><Countdown until={s?.nextEpochAt} /></strong>
      </div>
    </div>
  );
}

export function HeroStage() {
  const raw = useJson("/api/state", 20000);
  const s = raw?.ok ? raw : null;
  const [ready, setReady] = useState(false);
  const [signal, setSignal] = useState(null);
  const [big, setBig] = useState(false);
  const isVrm = MODEL_URL.toLowerCase().endsWith(".vrm");
  const look = s?.look;
  useEffect(() => {
    if (ready) setTimeout(() => setSignal({ t: Date.now(), kind: "greet" }), 600);
  }, [ready]);
  useEffect(() => {
    if (!big) return;
    const onKey = (e) => e.key === "Escape" && setBig(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [big]);
  return (
    <div className="hero-stage">
      <div className="stage-card zoomable" onClick={() => setBig(true)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setBig(true)} title="view the full model">
        <div className="stage-grid" aria-hidden="true" />
        {isVrm && (
          <VrmStage url={look?.model || MODEL_URL} mode="hero" custom={look || {}} signal={signal} onReady={() => setReady(true)} />
        )}
        <div className={"stage-poster" + (ready ? " off" : "")} aria-hidden={ready}>
          <img src="/hero.png" alt="mochi" />
        </div>
        <span className="stage-zoom" aria-hidden="true">click for full view</span>
        <div className="stage-caption">
          <div>
            <div className="name">{look?.name || "rose plum"}</div>
            <div className="meta">
              {look?.epoch ? `epoch ${look.epoch} · ${fmt.n(look.voters)} votes` : "her original look · epoch 1 ballot is open"}
            </div>
          </div>
          <span>
            <LookSwatches hues={look?.hues} />
            <LookBadges look={look} />
          </span>
        </div>
      </div>
      {big && (
        <div className="stage-modal" onClick={() => setBig(false)} role="dialog" aria-modal="true">
          <div className="stage-modal-card" onClick={(e) => e.stopPropagation()}>
            {isVrm && <VrmStage url={look?.model || MODEL_URL} mode="full" custom={look || {}} />}
            <button className="stage-modal-x" onClick={() => setBig(false)} aria-label="close">×</button>
            <div className="stage-modal-cap">{look?.name || "rose plum"}</div>
          </div>
        </div>
      )}
    </div>
  );
}

const ACTION_LABEL = { epoch: "ribbons", buy: "bought", gift: "gift", escrow: "released" };

export function LiveTerminal() {
  const raw = useJson("/api/state", 15000);
  const s = raw?.ok ? raw : null;
  const act = useJson("/api/activity", 15000);
  const feed = useJson("/api/feed", 20000);
  const [tab, setTab] = useState("ledger");
  const { text: cd } = useCountdown(s?.nextEpochAt);
  const live = s?.mode === "live";
  const rows = act?.rows || [];
  const posts = feed?.entries || [];
  return (
    <>
      <div className="term">
        <div className="term-bar">
          <span className="term-name"><img src="/logo.png" alt="" />mochi</span>
          <div className="term-tabs">
            {["ledger", "voice", "ballot"].map((t) => (
              <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t}</button>
            ))}
          </div>
          <div className="term-status">
            <span>engine: <b className={live ? "" : "pre"}>{s ? (s.agentOnline ? (live ? "live" : "pre-launch") : "offline") : "…"}</b></span>
            <span>block <span className="mono">{s?.chain?.block ? fmt.n(s.chain.block) : "–"}</span></span>
            <span>next epoch <span className="mono">{cd}</span></span>
          </div>
        </div>
        <div className="term-stats">
          <div className="term-stat"><div className="l">vault tvl</div><div className="v">{s?.vault ? fmt.usd(s.vault.tvl) : "–"}</div><div className="d">{s?.vault ? "usdg, routed to spark" : "deploys at launch"}</div></div>
          <div className="term-stat"><div className="l">apy (7d, net)</div><div className="v">{s?.vault?.apy != null ? s.vault.apy.toFixed(2) + "%" : s?.vault ? "tracking" : "–"}</div><div className="d">{s?.vault ? `mUSD $${s.vault.pricePerShare.toFixed(4)}` : "real, not emitted"}</div></div>
          <div className="term-stat"><div className="l">epoch</div><div className="v">{s ? String(s.epoch).padStart(3, "0") : "–"}</div><div className="d">{s ? `${s.epochHours}h cadence` : ""}</div></div>
          <div className="term-stat"><div className="l">ribbons minted</div><div className="v">{s ? fmt.n(s.totals?.minted) : "–"}</div><div className="d">{s ? `${fmt.n(s.totals?.wallets)} wallets hold some` : ""}</div></div>
        </div>
        {tab === "ledger" && (
          <div className="term-rows">
            <div className="term-row head"><span>time</span><span>action</span><span>wallet</span><span>amount</span><span>ref</span></div>
            {rows.length === 0 && <div className="term-empty">the ledger is blank. the first epoch has not closed yet.</div>}
            {rows.map((r, i) => (
              <div className="term-row" key={i}>
                <span className="t">{fmt.time(r.t)}</span>
                <span className={`a ${r.action}`}>{ACTION_LABEL[r.action] || r.action}</span>
                <span>{fmt.addr(r.wallet)}</span>
                <span className={r.amount > 0 ? "up" : r.amount < 0 ? "down" : ""}>{r.amount == null ? "item" : (r.amount > 0 ? "+" : "") + fmt.n(r.amount)}</span>
                <span className="t">{typeof r.ref === "string" ? fmt.addr(r.ref) : r.ref != null ? `epoch ${r.ref}` : ""}</span>
              </div>
            ))}
          </div>
        )}
        {tab === "voice" && (
          <div className="term-rows">
            {posts.length === 0 && <div className="term-empty">she has said nothing yet.</div>}
            {posts.slice(0, 12).map((e) => (
              <div className="term-post" key={e.id}>
                {e.text}
                <span className="when">
                  {fmt.ago(e.createdAt)}
                  {e.tweetId && feed?.username && <> · <a className="link" href={`https://x.com/${feed.username}/status/${e.tweetId}`} target="_blank" rel="noopener noreferrer">on x</a></>}
                </span>
              </div>
            ))}
          </div>
        )}
        {tab === "ballot" && (
          <div className="term-rows">
            <div className="term-row head"><span>look</span><span>votes</span><span>hair · eyes · top · bottom · shoes · ribbon</span><span></span><span></span></div>
            {(s?.candidates || []).map((c) => (
              <div className="term-row" key={c.id}>
                <span style={{ textTransform: "capitalize" }}>{c.name}</span>
                <span className="mono">{fmt.n(c.votes)}</span>
                <span><LookSwatches hues={c.hues} /> <LookBadges look={c} /></span>
                <span></span>
                <span className="t"><a className="link" href="/app?tab=vote">vote →</a></span>
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="term-caption">live numbers from the chain and her ledger</p>
    </>
  );
}

export function TokenTiles() {
  const s = useJson("/api/state", 30000);
  const t = s?.token;
  const d = t?.dex;
  const v = s?.vault;
  return (
    <div className="tiles">
      <div className="tile"><div className="v">{d?.priceUsd != null ? fmt.usd(d.priceUsd) : "–"}</div><div className="l">price{d?.change24h != null ? <> · <span className={d.change24h >= 0 ? "up" : "down"}>{fmt.pct(d.change24h)}</span> 24h</> : ""}</div></div>
      <div className="tile"><div className="v">{d?.marketCap != null ? fmt.usd(d.marketCap) : "–"}</div><div className="l">market cap</div></div>
      <div className="tile"><div className="v">{v?.stakedMochi != null ? fmt.n(v.stakedMochi) : "–"}</div><div className="l">$mochi staked</div></div>
      <div className="tile"><div className="v">{v?.stakingRewardsUsd != null ? fmt.usd(v.stakingRewardsUsd) : "–"}</div><div className="l">fees paid to stakers</div></div>
    </div>
  );
}

export function BuyLink() {
  const s = useJson("/api/state", 60000);
  if (s?.buyUrl)
    return (
      <a className="btn" href={s.buyUrl} target="_blank" rel="noopener noreferrer">
        buy $mochi
      </a>
    );
  return <span className="btn-ghost" style={{ opacity: 0.6 }}>buy link lands at launch</span>;
}

export function VoicePosts() {
  const feed = useJson("/api/feed", 30000);
  const posts = (feed?.entries || []).slice(0, 4);
  if (!posts.length) return <div className="post">nothing yet. she posts at the first epoch.<span className="when">soon</span></div>;
  return (
    <div className="posts">
      {posts.map((e) => (
        <div className="post" key={e.id}>
          {e.text}
          <span className="when">
            {fmt.ago(e.createdAt)}
            {e.tweetId && feed?.username && <> · <a className="link" href={`https://x.com/${feed.username}/status/${e.tweetId}`} target="_blank" rel="noopener noreferrer">on x</a></>}
          </span>
        </div>
      ))}
    </div>
  );
}
