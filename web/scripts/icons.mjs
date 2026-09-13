import sharp from "sharp";
import { mkdirSync } from "node:fs";

const svg = (pad) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0B4A33"/><stop offset="1" stop-color="#17966B"/></linearGradient></defs>
  <rect width="512" height="512" rx="${pad ? 0 : 112}" fill="url(#g)"/>
  <rect x="${128 + pad}" y="${168 + pad}" width="${256 - 2 * pad}" height="${176 - 2 * pad}" rx="28" fill="#F2FBF4"/>
  <rect x="${128 + pad}" y="${216 + pad}" width="${256 - 2 * pad}" height="28" fill="#0B4A33"/>
  <circle cx="${352 - pad}" cy="${276}" r="22" fill="#AC8112"/>
</svg>`;

mkdirSync("public/icons", { recursive: true });
const out = async (name, size, pad = 0) => sharp(Buffer.from(svg(pad))).resize(size, size).png().toFile(`public/icons/${name}`);
await out("icon-192.png", 192);
await out("icon-512.png", 512);
await out("maskable-512.png", 512, 48);
await out("apple-touch-icon-180.png", 180);
console.log("icons written");
