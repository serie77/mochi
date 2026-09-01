// builds logo + favicon from the green-screen headshot capture.
// usage: node scripts/make-logo.mjs <headshot.png>
import fs from "fs";
import sharp from "sharp";

const src = process.argv[2];
if (!src) throw new Error("pass the headshot png path");

// crop off the t-pose arms at the bottom, then chroma-key the green
const CROP = { left: 150, top: 60, width: 724, height: 750 };
const img = sharp(src).extract(CROP).ensureAlpha();
const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
const { width, height } = info;

let minX = width, minY = height, maxX = 0, maxY = 0;
for (let i = 0; i < data.length; i += 4) {
  const r = data[i], g = data[i + 1], b = data[i + 2];
  if (g > 100 && g > r * 1.5 && g > b * 1.5) {
    data[i + 3] = 0; // key out green
  } else {
    if (g > 60 && g > r && g > b) {
      data[i + 1] = Math.min(g, Math.round(Math.max(r, b) * 1.05)); // despill edges
    }
    const px = (i / 4) % width;
    const py = Math.floor(i / 4 / width);
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }
}

const rgba = { raw: { width, height, channels: 4 } };
const bboxW = maxX - minX + 1;
const bboxH = maxY - minY + 1;
const size = Math.max(bboxW, bboxH);
const head = await sharp(Buffer.from(data), rgba)
  .extract({ left: minX, top: minY, width: bboxW, height: bboxH })
  .extend({
    left: Math.floor((size - bboxW) / 2),
    right: Math.ceil((size - bboxW) / 2),
    top: Math.floor((size - bboxH) / 2),
    bottom: Math.ceil((size - bboxH) / 2),
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .png()
  .toBuffer();

await sharp(head).resize(512, 512).png().toFile("public/logo.png");
console.log("logo.png");

// silhouette: alpha kept, all color -> brand pink
const sil = await sharp(head).raw().toBuffer({ resolveWithObject: true });
for (let i = 0; i < sil.data.length; i += 4) {
  if (sil.data[i + 3] > 0) {
    sil.data[i] = 255;
    sil.data[i + 1] = 79;
    sil.data[i + 2] = 163;
  }
}
const silImg = sharp(Buffer.from(sil.data), {
  raw: { width: sil.info.width, height: sil.info.height, channels: 4 },
});
await silImg.clone().resize(180, 180).png().toFile("public/favicon-180.png");
await silImg.clone().resize(32, 32).png().toFile("public/favicon.png");
console.log("favicon.png + favicon-180.png (silhouette)");
