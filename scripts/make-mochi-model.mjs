// builds public/model/ — downloads the hiyori sample rig and recolors its
// textures into the mochi palette (rose-pink hair, plum uniform accents, pink
// ribbon) so the model is unique to this site. skin, face and the cream
// cardigan are left untouched. run: node scripts/make-mochi-model.mjs
import fs from "fs";
import path from "path";
import sharp from "sharp";

const BASE = "https://cdn.jsdelivr.net/gh/Live2D/CubismWebSamples@master/Samples/Resources/Hiyori/";
const OUT = path.join(process.cwd(), "public", "model");

const FILES = [
  "Hiyori.moc3",
  "Hiyori.physics3.json",
  "Hiyori.pose3.json",
  "Hiyori.userdata3.json",
  "Hiyori.cdi3.json",
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `motions/Hiyori_m${String(n).padStart(2, "0")}.motion3.json`),
];

function rgb2hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max ? d / max : 0, max];
}

function hsv2rgb(h, s, v) {
  h = ((h % 360) + 360) % 360;
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r, g, b;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

// texture_00: face parts live at x <= 535, everything to the right is hair.
// hair -> rose pink, shading depth preserved via value.
function tex00(data, w) {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const x = (i / 4) % w;
    const y = Math.floor(i / 4 / w);
    const [h, s, v] = rgb2hsv(data[i], data[i + 1], data[i + 2]);
    if (x <= 535) {
      // iris ovals: navy -> violet
      if (x >= 110 && x <= 425 && y >= 840 && y <= 990 && s > 0.15 && h >= 180 && h <= 270) {
        const [r, g, b] = hsv2rgb(295, Math.min(0.85, s * 1.15), v);
        data[i] = r; data[i + 1] = g; data[i + 2] = b;
      }
      continue;
    }
    if (v < 0.1) continue; // keep line art dark
    const nv = Math.pow(v, 0.72); // lift shadows so dark hair reads pink, not mud
    const nh = 332 + v * 10;
    const ns = Math.min(0.85, Math.max(0.42, s * 0.9 + (1 - v) * 0.5));
    const [r, g, b] = hsv2rgb(nh, ns, nv);
    data[i] = r; data[i + 1] = g; data[i + 2] = b;
  }
  return data;
}

// texture_01: navy/blue cloth -> plum; the bright blue ribbon -> hot pink;
// dark browns (loafers) -> rose-mauve. cream cardigan and skin untouched.
function tex01(data) {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const [h, s, v] = rgb2hsv(data[i], data[i + 1], data[i + 2]);
    let nh = null, ns = s;
    if (h >= 185 && h <= 255 && s > 0.12) {
      if (s > 0.45 && v > 0.45) { nh = 330; ns = Math.min(0.85, s * 1.1); } // ribbon
      else nh = h + 75; // skirt, socks, sailor collar -> plum
    } else if (h >= 10 && h <= 40 && s >= 0.3 && v <= 0.7) {
      nh = 340; ns = s * 0.9; // loafers
    }
    if (nh != null) {
      const [r, g, b] = hsv2rgb(nh, ns, v);
      data[i] = r; data[i + 1] = g; data[i + 2] = b;
    }
  }
  return data;
}

async function get(rel) {
  const r = await fetch(BASE + encodeURI(rel));
  if (!r.ok) throw new Error(`${rel}: ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

fs.mkdirSync(path.join(OUT, "textures"), { recursive: true });
fs.mkdirSync(path.join(OUT, "motions"), { recursive: true });

for (const f of FILES) {
  const name = f.startsWith("motions/") ? f : f.replace("Hiyori", "mochi");
  fs.writeFileSync(path.join(OUT, name), await get(f));
  console.log("saved", name);
}

for (const [src, fn] of [
  ["Hiyori.2048/texture_00.png", tex00],
  ["Hiyori.2048/texture_01.png", tex01],
]) {
  const img = sharp(await get(src));
  const { width, height } = await img.metadata();
  const raw = await img.raw().toBuffer();
  const out = await sharp(fn(raw, width), { raw: { width, height, channels: 4 } }).png().toBuffer();
  const name = "textures/" + path.basename(src);
  fs.writeFileSync(path.join(OUT, name), out);
  console.log("recolored", name);
}

const model = JSON.parse((await get("Hiyori.model3.json")).toString());
model.FileReferences.Moc = "mochi.moc3";
model.FileReferences.Textures = ["textures/texture_00.png", "textures/texture_01.png"];
model.FileReferences.Physics = "mochi.physics3.json";
model.FileReferences.Pose = "mochi.pose3.json";
model.FileReferences.UserData = "mochi.userdata3.json";
model.FileReferences.DisplayInfo = "mochi.cdi3.json";
fs.writeFileSync(path.join(OUT, "mochi.model3.json"), JSON.stringify(model, null, "\t"));
console.log("wrote mochi.model3.json");
