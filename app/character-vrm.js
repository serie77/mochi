"use client";

import { useEffect, useRef, useState } from "react";

// renders a vrm avatar with idle motion, blinking, cursor look-at, expression
// reactions, a greeting wave, and per-wallet customization (target-hue recolor
// of hair / eyes / top / bottom / shoes / extras).
// modes: "stage" (waist-up, feed rail) | "full" (whole body, dressing room)

const GROUP_DEFS = [
  ["hair", /hair/i],
  ["eyes", /eyeiris|iris/i],
  ["top", /tops|onepiece/i],
  ["bottom", /bottoms/i],
  ["shoes", /shoes|boots/i],
  ["extras", /accessory|cloth/i],
];
export const GROUPS = GROUP_DEFS.map(([g]) => g);

function groupOf(name) {
  for (const [g, re] of GROUP_DEFS) if (re.test(name || "")) return g;
  return null;
}

// circular mean hue of an image, weighted by saturation and alpha.
// returns null for textures with no real color (white cloth); those get tinted instead of rotated.
function sampleHue(img) {
  try {
    const cv = document.createElement("canvas");
    cv.width = 48;
    cv.height = 48;
    const ctx = cv.getContext("2d");
    ctx.drawImage(img, 0, 0, 48, 48);
    const d = ctx.getImageData(0, 0, 48, 48).data;
    let x = 0, y = 0, n = 0, satSum = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255, a = d[i + 3] / 255;
      if (!a) continue;
      n++;
      const max = Math.max(r, g, b), min = Math.min(r, g, b), df = max - min;
      if (!df) continue;
      let h;
      if (max === r) h = ((g - b) / df) % 6;
      else if (max === g) h = (b - r) / df + 2;
      else h = (r - g) / df + 4;
      h *= 60;
      const w = (df / max) * a;
      satSum += df / max;
      x += Math.cos((h * Math.PI) / 180) * w;
      y += Math.sin((h * Math.PI) / 180) * w;
    }
    if (!n || satSum / n < 0.12) return null;
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  } catch {
    return null;
  }
}

// composite a fabric print over a texture in the target hue, keeping shading and alpha
function patterned(THREE, orig, hue, kind, shade) {
  const img = orig.image;
  const cv = document.createElement("canvas");
  cv.width = img.width;
  cv.height = img.height;
  const ctx = cv.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const u = Math.max(8, Math.round(cv.width / 28)); // pattern unit scaled to texture size
  const pat = document.createElement("canvas");
  pat.width = pat.height = u * 2;
  const p = pat.getContext("2d");
  p.fillStyle = `hsl(${hue} 62% 46%)`;
  if (kind === "stripes") {
    p.save();
    p.translate(u, u);
    p.rotate(Math.PI / 4);
    for (let i = -3; i <= 3; i += 2) p.fillRect(i * u - u / 2.4, -u * 3, u / 1.2, u * 6);
    p.restore();
  } else if (kind === "dots") {
    for (const [cx, cy] of [[u / 2, u / 2], [u * 1.5, u * 1.5]]) {
      p.beginPath();
      p.arc(cx, cy, u / 3.4, 0, Math.PI * 2);
      p.fill();
    }
  } else { // checker
    p.fillRect(0, 0, u, u);
    p.fillRect(u, u, u, u);
  }
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = shade ? 0.9 : 0.82;
  ctx.fillStyle = ctx.createPattern(pat, "repeat");
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.flipY = orig.flipY;
  tex.colorSpace = orig.colorSpace;
  tex.wrapS = orig.wrapS;
  tex.wrapT = orig.wrapT;
  return tex;
}

// colorize an unsaturated texture: multiply by the target color, keep the original alpha
function tinted(THREE, orig, hue, shade) {
  const img = orig.image;
  const cv = document.createElement("canvas");
  cv.width = img.width;
  cv.height = img.height;
  const ctx = cv.getContext("2d");
  ctx.drawImage(img, 0, 0);
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = `hsl(${hue} 62% ${shade ? 48 : 64}%)`;
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.flipY = orig.flipY;
  tex.colorSpace = orig.colorSpace;
  tex.wrapS = orig.wrapS;
  tex.wrapT = orig.wrapT;
  return tex;
}

// mtoon materials keep textures in shader uniforms; plain materials on .map.
// the shade (shadow) texture must be recolored too or shaded areas keep the old hue.
const SLOTS = [
  ["map", (m) => m.map || m.uniforms?.map?.value || null, (m, t) => {
    try { m.map = t; } catch {}
    if (m.uniforms?.map) m.uniforms.map.value = t;
  }],
  ["shade", (m) => m.shadeMultiplyTexture || m.uniforms?.shadeMultiplyTexture?.value || null, (m, t) => {
    try { m.shadeMultiplyTexture = t; } catch {}
    if (m.uniforms?.shadeMultiplyTexture) m.uniforms.shadeMultiplyTexture.value = t;
  }],
];
export const texOf = SLOTS[0][1];

function hueShifted(THREE, orig, deg) {
  const img = orig.image;
  const cv = document.createElement("canvas");
  cv.width = img.width;
  cv.height = img.height;
  const ctx = cv.getContext("2d");
  ctx.filter = `hue-rotate(${deg}deg)`;
  ctx.drawImage(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.flipY = orig.flipY;
  tex.colorSpace = orig.colorSpace;
  tex.wrapS = orig.wrapS;
  tex.wrapT = orig.wrapT;
  return tex;
}

function applyCustom(THREE, matGroups, baseHues, origMaps, custom) {
  // custom is a look config { hues, patterns, meshes }; a bare hue-map is accepted too
  const hues = custom?.hues ?? (custom?.patterns || custom?.meshes ? {} : custom) ?? {};
  const patterns = custom?.patterns ?? {};
  for (const [m, g] of matGroups) {
    const target = hues?.[g];
    const pat = patterns?.[g];
    const origs = origMaps.get(m);
    if (!origs) continue;
    for (const [slot, , set] of SLOTS) {
      const orig = origs[slot];
      if (!orig?.image) continue;
      if (pat == null && target == null) {
        set(m, orig);
        m.needsUpdate = true;
        continue;
      }
      try {
        if (pat) {
          set(m, patterned(THREE, orig, pat.hue, pat.pattern, slot === "shade"));
        } else if (baseHues[g] == null) {
          set(m, tinted(THREE, orig, target, slot === "shade"));
        } else {
          const deg = Math.round(((target - baseHues[g]) % 360 + 360) % 360);
          set(m, hueShifted(THREE, orig, deg));
        }
        m.needsUpdate = true;
      } catch {}
    }
  }
}

/* ---- headwear: real geometry attached to the head bone ---- */

function accMaterial(THREE, color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, ...opts });
}

function buildAccessory(THREE, id) {
  const g = new THREE.Group();
  if (id === "cat-ears") {
    for (const side of [-1, 1]) {
      const outer = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.12, 24), accMaterial(THREE, 0xc23f6c));
      outer.position.set(side * 0.078, 0.205, 0.0);
      outer.rotation.z = -side * 0.38;
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.07, 20), accMaterial(THREE, 0xff93c9));
      inner.position.set(side * 0.074, 0.195, 0.02);
      inner.rotation.z = -side * 0.38;
      g.add(outer, inner);
    }
  } else if (id === "halo") {
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.078, 0.011, 16, 48),
      accMaterial(THREE, 0xffd75e, { emissive: 0xffc93a, emissiveIntensity: 0.9, roughness: 0.4, metalness: 0.6 })
    );
    halo.position.set(0, 0.26, -0.02);
    halo.rotation.x = Math.PI / 2.5;
    g.add(halo);
  } else if (id === "witch-hat") {
    const plum = accMaterial(THREE, 0x241028);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.105, 0.17, 32), plum);
    cone.position.set(0, 0.205, -0.015);
    cone.rotation.z = 0.1;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.008, 40), plum);
    brim.position.set(0, 0.126, -0.015);
    brim.rotation.z = 0.1;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.1, 0.034, 32), accMaterial(THREE, 0xff5fae));
    band.position.set(0, 0.148, -0.015);
    band.rotation.z = 0.1;
    g.add(cone, brim, band);
  } else if (id === "glasses") {
    const dark = accMaterial(THREE, 0x23232b, { roughness: 0.5, metalness: 0.3 });
    for (const side of [-1, 1]) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.004, 12, 32), dark);
      rim.position.set(side * 0.035, 0.052, 0.088);
      g.add(rim);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.09, 8), dark);
      arm.position.set(side * 0.068, 0.056, 0.045);
      arm.rotation.x = Math.PI / 2;
      g.add(arm);
    }
    const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.02, 8), dark);
    bridge.position.set(0, 0.056, 0.088);
    bridge.rotation.z = Math.PI / 2;
    g.add(bridge);
  } else if (id === "horns") {
    for (const side of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.09, 16), accMaterial(THREE, 0xd1265c, { roughness: 0.45 }));
      horn.position.set(side * 0.06, 0.175, 0.02);
      horn.rotation.z = -side * 0.55;
      g.add(horn);
    }
  } else if (id === "star-pin") {
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 0.034 : 0.015;
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y);
    }
    shape.closePath();
    const star = new THREE.Mesh(
      new THREE.ExtrudeGeometry(shape, { depth: 0.007, bevelEnabled: false }),
      accMaterial(THREE, 0xffd75e, { emissive: 0xdda92e, emissiveIntensity: 0.35, roughness: 0.35, metalness: 0.7 })
    );
    star.position.set(0.075, 0.1, 0.065);
    star.rotation.y = 0.6;
    star.rotation.z = 0.2;
    g.add(star);
  } else if (id === "hairpin") {
    const gold = accMaterial(THREE, 0xffd75e, { emissive: 0xdda92e, emissiveIntensity: 0.35, roughness: 0.35, metalness: 0.7 });
    for (const tilt of [0.55, -0.55]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.009, 0.004), gold);
      bar.position.set(-0.078, 0.075, 0.07);
      bar.rotation.set(0, -0.6, tilt);
      g.add(bar);
    }
  } else if (id === "bow") {
    const pink = accMaterial(THREE, 0xff5fae, { roughness: 0.6 });
    const deep = accMaterial(THREE, 0xd13c88, { roughness: 0.6 });
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.015, 16, 12), deep);
    for (const side of [-1, 1]) {
      const loop = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.062, 18), pink);
      loop.position.set(side * 0.038, 0.004, 0);
      loop.rotation.z = side * Math.PI / 2;
      loop.scale.z = 0.5;
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.013, 0.048, 0.003), pink);
      tail.position.set(side * 0.018, -0.032, 0.002);
      tail.rotation.z = -side * 0.35;
      g.add(loop, tail);
    }
    g.add(knot);
    g.position.set(0.06, 0.168, 0.012);
    g.rotation.z = -0.25;
    g.rotation.x = -0.25;
  } else if (id === "flower") {
    const petal = accMaterial(THREE, 0xfff4fa, { roughness: 0.7 });
    const heart = accMaterial(THREE, 0xffd75e, { roughness: 0.5, metalness: 0.3 });
    const f = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.016, 14, 10), petal);
      p.position.set(Math.cos(a) * 0.025, Math.sin(a) * 0.025, 0);
      p.scale.z = 0.45;
      f.add(p);
    }
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.012, 14, 10), heart);
    c.position.z = 0.004;
    f.add(c);
    f.position.set(-0.072, 0.135, 0.05);
    f.rotation.y = -0.65;
    g.add(f);
  } else if (id === "beret") {
    const red = accMaterial(THREE, 0xc22c48, { roughness: 0.75 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.112, 28, 18), red);
    dome.scale.y = 0.42;
    dome.position.set(0.012, 0.168, -0.012);
    dome.rotation.z = 0.16;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.02, 10), red);
    stem.position.set(0.02, 0.215, -0.012);
    stem.rotation.z = 0.16;
    g.add(dome, stem);
  } else if (id === "bunny-ears") {
    const white = accMaterial(THREE, 0xfdf6f9, { roughness: 0.8 });
    const inner = accMaterial(THREE, 0xff9ccc, { roughness: 0.8 });
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, 0.1, 6, 16), white);
      ear.position.set(side * 0.045, 0.235, -0.005);
      ear.rotation.z = -side * 0.14;
      ear.scale.z = 0.6;
      const pad = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.062, 6, 12), inner);
      pad.position.set(side * 0.0435, 0.233, 0.008);
      pad.rotation.z = -side * 0.14;
      pad.scale.z = 0.5;
      g.add(ear, pad);
    }
  } else if (id === "crown") {
    const gold = accMaterial(THREE, 0xffd75e, { emissive: 0xcf9b22, emissiveIntensity: 0.25, roughness: 0.35, metalness: 0.75 });
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.067, 0.028, 24, 1, true), gold);
    band.material = gold.clone();
    band.material.side = THREE.DoubleSide;
    const c = new THREE.Group();
    c.add(band);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.03, 10), gold);
      spike.position.set(Math.cos(a) * 0.062, 0.028, Math.sin(a) * 0.062);
      c.add(spike);
    }
    const jewel = new THREE.Mesh(
      new THREE.SphereGeometry(0.008, 12, 10),
      accMaterial(THREE, 0xff5fae, { emissive: 0xff5fae, emissiveIntensity: 0.5, roughness: 0.3 })
    );
    jewel.position.set(0, 0.002, 0.064);
    c.add(jewel);
    c.position.set(0, 0.205, -0.01);
    c.rotation.z = 0.07;
    g.add(c);
  }
  return g;
}

function applyHeadwear(THREE, vrm, holder, meshes) {
  if (holder.group) {
    holder.group.parent?.remove(holder.group);
    holder.group = null;
  }
  const ids = meshes || [];
  if (!ids.length) return;
  const head = vrm.humanoid?.getNormalizedBoneNode("head");
  if (!head) return;
  const group = new THREE.Group();
  for (const id of ids) group.add(buildAccessory(THREE, id));
  head.add(group);
  holder.group = group;
}

export default function VrmStage({ url, signal, onProgress, onReady, mode = "stage", custom, chipHref }) {
  const holder = useRef(null);
  const vrmRef = useRef(null);
  const threeRef = useRef(null);
  const clockRef = useRef(null);
  const waveRef = useRef(0);
  const actRef = useRef(null);
  const matGroups = useRef(new Map());
  const origMaps = useRef(new Map());
  const baseHues = useRef({});
  const headwear = useRef({ group: null });
  const [bubble, setBubble] = useState(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let dead = false;
    let renderer = null;
    let raf = 0;
    const cleanupFns = [];
    (async () => {
      try {
        const THREE = await import("three");
        const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
        const { VRMLoaderPlugin, VRMUtils } = await import("@pixiv/three-vrm");
        if (dead) return;
        threeRef.current = THREE;
        const el = holder.current;

        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio || 1);
        renderer.setSize(el.clientWidth, el.clientHeight);
        el.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const full = mode === "full";
        const camera = new THREE.PerspectiveCamera(30, el.clientWidth / el.clientHeight, 0.1, 20);
        if (full) {
          camera.position.set(0, 0.98, 2.95);
          camera.lookAt(0, 0.84, 0);
        } else if (mode === "hero") {
          // three-quarter framing: head to hips, room for the outfit to read
          camera.position.set(0, 1.12, 1.88);
          camera.lookAt(0, 0.98, 0);
        } else {
          camera.position.set(0, 1.38, 0.85);
          camera.lookAt(0, 1.33, 0);
        }

        scene.add(new THREE.AmbientLight(0xffffff, 0.9));
        const key = new THREE.DirectionalLight(0xffe9f4, 1.4);
        key.position.set(0.5, 1.5, 1.5);
        scene.add(key);

        const loader = new GLTFLoader();
        loader.register((p) => new VRMLoaderPlugin(p));
        const gltf = await loader.loadAsync(url, (e) => {
          if (e.total) onProgress?.(Math.min(99, Math.round((e.loaded / e.total) * 100)));
        });
        const vrm = gltf.userData.vrm;
        if (!vrm) throw new Error("not a vrm file");
        if (dead) return;
        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.combineSkeletons(gltf.scene);
        VRMUtils.rotateVRM0(vrm);
        scene.add(vrm.scene);
        vrmRef.current = vrm;

        // classify materials into customization groups, remember base textures
        matGroups.current = new Map();
        origMaps.current = new Map();
        vrm.scene.traverse((o) => {
          if (!o.isMesh) return;
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) {
            const g = groupOf(m.name);
            if (!g || matGroups.current.has(m)) continue;
            matGroups.current.set(m, g);
            origMaps.current.set(m, {
              map: SLOTS[0][1](m),
              shade: SLOTS[1][1](m),
            });
          }
        });
        const hues = {};
        const seen = new Set();
        for (const [m, g] of matGroups.current) {
          if (seen.has(g) || !origMaps.current.get(m)?.map?.image) continue;
          seen.add(g);
          hues[g] = sampleHue(origMaps.current.get(m).map.image);
        }
        baseHues.current = hues;

        // arms down out of t-pose
        const setRot = (bone, z) => {
          const n = vrm.humanoid?.getNormalizedBoneNode(bone);
          if (n) n.rotation.z = z;
        };
        setRot("leftUpperArm", -1.38);
        setRot("rightUpperArm", 1.38);

        // eyes (and a little head) follow the visitor's cursor
        const lookTarget = new THREE.Object3D();
        lookTarget.position.set(0, 1.38, 2);
        scene.add(lookTarget);
        if (vrm.lookAt) vrm.lookAt.target = lookTarget;
        let px = 0;
        const onPointer = (e) => {
          px = e.clientX / window.innerWidth - 0.5;
          const py = e.clientY / window.innerHeight - 0.5;
          lookTarget.position.set(px * 1.4, 1.38 - py * 0.7, 2);
        };
        window.addEventListener("pointermove", onPointer);
        cleanupFns.push(() => window.removeEventListener("pointermove", onPointer));

        const onResize = () => {
          renderer.setSize(el.clientWidth, el.clientHeight);
          camera.aspect = el.clientWidth / el.clientHeight;
          camera.updateProjectionMatrix();
        };
        const ro = new ResizeObserver(onResize);
        ro.observe(el);
        cleanupFns.push(() => ro.disconnect());

        const clock = new THREE.Clock();
        clockRef.current = clock;
        const rUpper = vrm.humanoid?.getNormalizedBoneNode("rightUpperArm");
        const rLower = vrm.humanoid?.getNormalizedBoneNode("rightLowerArm");
        const lUpper = vrm.humanoid?.getNormalizedBoneNode("leftUpperArm");
        const lLower = vrm.humanoid?.getNormalizedBoneNode("leftLowerArm");
        const baseSceneY = vrm.scene.rotation.y;
        const baseScenePos = vrm.scene.position.y;
        let waving = false;
        let acting = false;
        let nextBlink = 2;
        let blinkT = -1;
        const ease = (p) => p * p * (3 - 2 * p);
        const loop = () => {
          if (dead) return;
          raf = requestAnimationFrame(loop);
          const d = clock.getDelta();
          const t = clock.elapsedTime;
          const head = vrm.humanoid?.getNormalizedBoneNode("head");
          const chest =
            vrm.humanoid?.getNormalizedBoneNode("chest") || vrm.humanoid?.getNormalizedBoneNode("spine");
          if (head) {
            head.rotation.y = Math.sin(t * 0.5) * 0.06 + px * 0.25;
            head.rotation.x = Math.sin(t * 0.9) * 0.02;
          }
          if (chest) chest.rotation.x = Math.sin(t * 1.1) * 0.015;
          if (waveRef.current > t && rUpper && rLower) {
            waving = true;
            const p = 1 - (waveRef.current - t) / 2.4;
            const raise = Math.min(1, p * 4) * Math.min(1, (1 - p) * 4);
            rUpper.rotation.z = 1.38 - 1.8 * raise;
            rLower.rotation.z = -raise * (0.4 + Math.sin(t * 12) * 0.35);
          } else if (waving && rUpper && rLower) {
            waving = false;
            rUpper.rotation.z = 1.38;
            rLower.rotation.z = 0;
          }
          // one-shot action animations (bow / spin / jump / cheer / nod)
          const act = actRef.current;
          if (act && t < act.until) {
            acting = true;
            const p = Math.max(0, Math.min(1, 1 - (act.until - t) / act.dur));
            const env = Math.min(1, p * 3.5) * Math.min(1, (1 - p) * 3.5); // rise, hold, settle
            if (act.kind === "bow") {
              if (chest) chest.rotation.x += env * 0.42;
              if (head) head.rotation.x += env * 0.22;
            } else if (act.kind === "spin") {
              vrm.scene.rotation.y = baseSceneY + ease(p) * Math.PI * 2;
            } else if (act.kind === "jump") {
              vrm.scene.position.y = baseScenePos + Math.abs(Math.sin(p * Math.PI * 2)) * 0.05;
            } else if (act.kind === "cheer") {
              if (rUpper) rUpper.rotation.z = 1.38 - 2.5 * env;
              if (lUpper) lUpper.rotation.z = -1.38 + 2.5 * env;
              if (rLower) rLower.rotation.z = -env * 0.3;
              if (lLower) lLower.rotation.z = env * 0.3;
              vrm.scene.position.y = baseScenePos + Math.max(0, Math.sin(p * Math.PI * 3)) * env * 0.04;
            } else if (act.kind === "nod") {
              if (head) head.rotation.x += Math.sin(p * Math.PI * 3) * env * 0.3;
            }
          } else if (acting) {
            acting = false;
            actRef.current = null;
            vrm.scene.rotation.y = baseSceneY;
            vrm.scene.position.y = baseScenePos;
            if (rUpper) rUpper.rotation.z = 1.38;
            if (lUpper) lUpper.rotation.z = -1.38;
            if (rLower) rLower.rotation.z = 0;
            if (lLower) lLower.rotation.z = 0;
          }
          const em = vrm.expressionManager;
          if (em) {
            if (blinkT < 0 && t > nextBlink) blinkT = 0;
            if (blinkT >= 0) {
              blinkT += d;
              const v = blinkT < 0.08 ? blinkT / 0.08 : Math.max(0, 1 - (blinkT - 0.08) / 0.1);
              em.setValue("blink", v);
              if (blinkT > 0.2) {
                blinkT = -1;
                nextBlink = t + 2 + Math.random() * 3.5;
                em.setValue("blink", 0);
              }
            }
          }
          vrm.update(d);
          renderer.render(scene, camera);
        };
        loop();
        onProgress?.(100);
        setReady(true);
        onReady?.();
      } catch (e) {
        console.error("vrm stage:", e);
        if (!dead) {
          setFailed(true);
          onReady?.(); // never leave the site stuck on a loading state
        }
      }
    })();
    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      for (const fn of cleanupFns) fn();
      vrmRef.current = null;
      threeRef.current = null;
      renderer?.dispose();
      if (renderer?.domElement?.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    };
  }, [url, mode]);

  // reactions
  useEffect(() => {
    if (!signal) return;
    let bubbleT = null;
    if (signal.text) {
      setBubble(signal.text);
      bubbleT = setTimeout(() => setBubble(null), 7000);
    }
    if (signal.kind === "greet" && clockRef.current) {
      waveRef.current = clockRef.current.elapsedTime + 2.4;
    }
    const ACT_DUR = { bow: 1.7, spin: 1.3, jump: 1.1, cheer: 2.0, nod: 1.2 };
    if (ACT_DUR[signal.kind] && clockRef.current) {
      const dur = ACT_DUR[signal.kind];
      actRef.current = { kind: signal.kind, dur, until: clockRef.current.elapsedTime + dur };
    }
    const em = vrmRef.current?.expressionManager;
    if (em) {
      const expr =
        { win: "happy", buy: "surprised", loss: "sad", speak: "happy", greet: "happy", bow: "happy", spin: "happy", jump: "surprised", cheer: "happy", nod: "relaxed" }[signal.kind] || "happy";
      try {
        em.setValue(expr, 1);
        setTimeout(() => {
          try {
            em.setValue(expr, 0);
          } catch {}
        }, 2600);
      } catch {}
    }
    return () => bubbleT && clearTimeout(bubbleT);
  }, [signal]);

  // customization: applied instantly whenever it changes
  const customKey = JSON.stringify(custom ?? null);
  useEffect(() => {
    if (!ready || !threeRef.current || !vrmRef.current) return;
    applyCustom(threeRef.current, matGroups.current, baseHues.current, origMaps.current, custom);
    applyHeadwear(threeRef.current, vrmRef.current, headwear.current, custom?.meshes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customKey, ready]);

  return (
    <div className={mode === "stage" ? "charstage" : "charfull"} ref={holder}>
      {bubble && <div className="charbubble">{bubble}</div>}
      {failed && <div className="char-failed">mochi is off-screen. model failed to load.</div>}
      {ready && !failed && chipHref && (
        <a className="custom-chip" href={chipHref}>dress her</a>
      )}
    </div>
  );
}
