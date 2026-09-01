"use client";

import { useEffect, useState } from "react";

export function useJson(url, ms = 15000) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!url) return;
    let dead = false;
    const load = async () => {
      try {
        const r = await fetch(url, { cache: "no-store" });
        const j = await r.json();
        if (!dead) setData(j);
      } catch {
        if (!dead) setData((d) => d ?? { ok: false });
      }
    };
    load();
    const t = ms ? setInterval(load, ms) : null;
    return () => {
      dead = true;
      if (t) clearInterval(t);
    };
  }, [url, ms]);
  return data;
}

export const fmt = {
  n: (v, d = 0) => (v == null ? "–" : Number(v).toLocaleString("en-US", { maximumFractionDigits: d })),
  usd: (v) => {
    if (v == null) return "–";
    if (v >= 1e9) return "$" + (v / 1e9).toFixed(2) + "b";
    if (v >= 1e6) return "$" + (v / 1e6).toFixed(2) + "m";
    if (v >= 1e3) return "$" + (v / 1e3).toFixed(1) + "k";
    return "$" + Number(v).toFixed(v > 0 && v < 0.01 ? 6 : 2);
  },
  pct: (v, d = 1) => (v == null ? "–" : (v >= 0 ? "+" : "") + Number(v).toFixed(d) + "%"),
  ago: (t) => {
    if (!t) return "–";
    const s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 60) return Math.floor(s) + "s ago";
    if (s < 3600) return Math.floor(s / 60) + "m ago";
    if (s < 86400) return Math.floor(s / 3600) + "h ago";
    return Math.floor(s / 86400) + "d ago";
  },
  time: (t) => (t ? new Date(t).toLocaleTimeString([], { hour12: false }) : "–"),
  date: (t) => (t ? new Date(t).toLocaleDateString([], { month: "short", day: "numeric" }) : "–"),
  addr: (a) => (!a ? "–" : /^0x[0-9a-fA-F]{40}$/.test(a) ? a.slice(0, 6) + "…" + a.slice(-4) : a),
};

export function useCountdown(until) {
  const [left, setLeft] = useState(() => Math.max(0, (until || 0) - Date.now()));
  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, (until || 0) - Date.now())), 1000);
    return () => clearInterval(t);
  }, [until]);
  const s = Math.floor(left / 1000);
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return { left, text: until ? `${hh}:${mm}:${ss}` : "--:--:--" };
}

export function Countdown({ until, className = "" }) {
  const { text } = useCountdown(until);
  return <span className={`mono ${className}`}>{text}</span>;
}

export function CopyPlate({ label, value, hint = "tap to copy", explorer }) {
  const [done, setDone] = useState(false);
  if (!value)
    return (
      <div className="plate plate-empty">
        <span className="eyebrow">{label}</span>
        <span className="plate-addr">not launched yet</span>
        <span className="plate-hint">the contract address lands here the moment she is live on pons</span>
      </div>
    );
  return (
    <div className="plate">
      <button
        type="button"
        className="plate-btn"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setDone(true);
            setTimeout(() => setDone(false), 1400);
          } catch {}
        }}
      >
        <span className="eyebrow">{label}</span>
        <code className="plate-addr">{value}</code>
        <span className="plate-hint">{done ? "copied" : hint}</span>
      </button>
      {explorer && (
        <a className="plate-link" href={explorer} target="_blank" rel="noopener noreferrer">
          explorer ↗
        </a>
      )}
    </div>
  );
}

export function StatusPill({ mode }) {
  const live = mode === "live";
  return <span className={`pill pill-status ${live ? "is-live" : "is-pre"}`}>{live ? "live" : "pre-launch"}</span>;
}

export const SLOT_LABEL = { hair: "hair", eyes: "eyes", top: "top", bottom: "bottom", shoes: "shoes", extras: "ribbon", headwear: "headwear", outfit: "outfit" };

// small text badges for the non-color parts of a look (patterns, headwear)
export function LookBadges({ look }) {
  const tags = [];
  if (look?.patterns) for (const s of Object.keys(look.patterns)) tags.push(look.patterns[s].pattern);
  if (look?.meshes) for (const m of look.meshes) tags.push(m.replace(/-/g, " "));
  if (look?.model) tags.push("outfit");
  if (!tags.length) return null;
  return (
    <span className="lookbadges">
      {tags.map((t) => <i key={t}>{t}</i>)}
    </span>
  );
}

// a tiny swatch strip for a look (hues per slot; null = original)
const BASE_SWATCH = { hair: 335, eyes: 275, top: 300, bottom: 300, shoes: 300, extras: 335 };
export function LookSwatches({ hues, slots = ["hair", "eyes", "top", "bottom", "shoes", "extras"] }) {
  return (
    <span className="swatches">
      {slots.map((s) => {
        const h = hues?.[s];
        const base = h == null;
        return (
          <i
            key={s}
            className={"swatch" + (base ? " is-base" : "")}
            title={`${SLOT_LABEL[s]}: ${base ? "original" : h + "°"}`}
            style={{ background: `hsl(${base ? BASE_SWATCH[s] : h} ${base ? 30 : 72}% ${base ? 42 : 56}%)` }}
          />
        );
      })}
    </span>
  );
}
