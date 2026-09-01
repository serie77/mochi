// builds public/hero.png from a green-screen full-body capture.
// usage: node scripts/make-hero.mjs <capture.png>
import fs from "fs";
import sharp from "sharp";

const src = process.argv[2];
if (!src) throw new Error("pass the capture png path");

const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height } = info;

let minX = width, minY = height, maxX = 0, maxY = 0;
for (let i = 0; i < data.length; i += 4) {
  const r = data[i], g = data[i + 1], b = data[i + 2];
  if (g > 100 && g > r * 1.5 && g > b * 1.5) {
    data[i + 3] = 0;
  } else {
    if (g > 60 && g > r && g > b) {
      data[i + 1] = Math.min(g, Math.round(Math.max(r, b) * 1.05));
    }
    const px = (i / 4) % width;
    const py = Math.floor(i / 4 / width);
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }
}

await sharp(Buffer.from(data), { raw: { width, height, channels: 4 } })
  .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
  .resize({ height: 900, withoutEnlargement: true })
  .png()
  .toFile("public/hero.png");
console.log("hero.png");
