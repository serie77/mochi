"use client";

import { useEffect, useRef, useState } from "react";

import VrmStage from "./character-vrm.js";

const CORE = "https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js";
const MODEL_URL =
  process.env.NEXT_PUBLIC_CHARACTER_MODEL ||
  process.env.NEXT_PUBLIC_LIVE2D_MODEL ||
  "/model/mochi.model3.json";

function loadCore() {
  return new Promise((resolve, reject) => {
    if (window.Live2DCubismCore) return resolve();
    const s = document.createElement("script");
    s.src = CORE;
    s.onload = resolve;
    s.onerror = () => reject(new Error("cubism core failed to load"));
    document.head.appendChild(s);
  });
}

// picks the renderer by file type: .vrm (vroid studio export) -> three-vrm,
// anything else -> live2d cubism.
export default function CharacterStage({ signal, custom, onProgress, onReady }) {
  if (MODEL_URL.toLowerCase().endsWith(".vrm"))
    return (
      <VrmStage
        url={MODEL_URL}
        signal={signal}
        custom={custom}
        chipHref="/customize"
        onProgress={onProgress}
        onReady={onReady}
      />
    );
  return <Live2DStage signal={signal} onReady={onReady} />;
}

function Live2DStage({ signal, onReady }) {
  const holder = useRef(null);
  const modelRef = useRef(null);
  const [bubble, setBubble] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let app = null;
    let dead = false;
    (async () => {
      try {
        await loadCore();
        const PIXI = await import("pixi.js");
        window.PIXI = PIXI;
        const { Live2DModel } = await import("pixi-live2d-display/cubism4");
        if (dead) return;
        Live2DModel.registerTicker?.(PIXI.Ticker);
        const el = holder.current;
        app = new PIXI.Application({
          backgroundAlpha: 0,
          resizeTo: el,
          antialias: true,
          autoDensity: true,
          resolution: window.devicePixelRatio || 1,
        });
        el.appendChild(app.view);
        const model = await Live2DModel.from(MODEL_URL, { autoInteract: true });
        if (dead) {
          model.destroy();
          return;
        }
        modelRef.current = model;
        const fit = () => {
          const ow = model.internalModel.originalWidth || model.width;
          const oh = model.internalModel.originalHeight || model.height;
          // the rig canvas has wide empty margins, so overscale for waist-up framing
          const scale = (el.clientHeight * 3.1) / oh;
          model.scale.set(scale);
          model.x = (el.clientWidth - ow * scale) / 2;
          model.y = -oh * scale * 0.08;
        };
        fit();
        app.renderer.on("resize", fit);
        app.stage.addChild(model);
        onReady?.();
      } catch (e) {
        console.error("character stage:", e);
        if (!dead) {
          setFailed(true);
          onReady?.();
        }
      }
    })();
    return () => {
      dead = true;
      modelRef.current = null;
      app?.destroy(true, { children: true, texture: true, baseTexture: true });
    };
  }, []);

  useEffect(() => {
    if (!signal) return;
    let t = null;
    if (signal.text) {
      setBubble(signal.text);
      t = setTimeout(() => setBubble(null), 7000);
    }
    const m = modelRef.current;
    if (m) {
      try {
        const defs = m.internalModel.motionManager.definitions || {};
        const group = ["TapBody", "Tap", "Flick", "Idle"].find((g) => defs[g]?.length);
        if (group) m.motion(group, Math.floor(Math.random() * defs[group].length), 3);
      } catch {}
    }
    return () => t && clearTimeout(t);
  }, [signal]);

  return (
    <div className="charstage" ref={holder}>
      {bubble && <div className="charbubble">{bubble}</div>}
      {failed && <div className="char-failed">mochi is off-screen. model failed to load.</div>}
    </div>
  );
}
