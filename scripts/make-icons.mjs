import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");

async function make(size, file, radius) {
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="#1f664a"/>
  <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-family="Arial Black, Arial, sans-serif" font-size="${Math.round(size * 0.38)}" font-weight="700" fill="white">FG</text>
</svg>`);
  await sharp(svg).png().toFile(path.join(dir, file));
}

await make(192, "icon-192.png", 40);
await make(512, "icon-512.png", 96);
await make(512, "icon-maskable-512.png", 0);
await make(180, "apple-touch-icon.png", 40);
console.log("icons ok");
