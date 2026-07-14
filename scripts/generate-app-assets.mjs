// Generates the source images @capacitor/assets consumes (assets/icon-only.png,
// assets/splash.png, assets/splash-dark.png) from inline SVG in the Demi
// palette. Rerun after design changes: `node scripts/generate-app-assets.mjs
// && npx capacitor-assets generate --ios`.
import sharp from "sharp";
import { mkdirSync } from "node:fs";

mkdirSync("assets", { recursive: true });

// App icon: the lime "D" mark on deep forest, matching the in-app avatar.
const icon = `
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="1024" fill="#2c3a2e"/>
  <circle cx="512" cy="512" r="340" fill="#d3e29f"/>
  <text x="512" y="512" text-anchor="middle" dominant-baseline="central"
        font-family="Helvetica, Arial, sans-serif" font-weight="700"
        font-size="440" fill="#2c3a2e">D</text>
</svg>`;

// Splash: centered mark on forest; Capacitor letterboxes it per device.
const splash = (bg, ring, ink) => `
<svg width="2732" height="2732" viewBox="0 0 2732 2732" xmlns="http://www.w3.org/2000/svg">
  <rect width="2732" height="2732" fill="${bg}"/>
  <circle cx="1366" cy="1366" r="300" fill="${ring}"/>
  <text x="1366" y="1366" text-anchor="middle" dominant-baseline="central"
        font-family="Helvetica, Arial, sans-serif" font-weight="700"
        font-size="380" fill="${ink}">D</text>
</svg>`;

await sharp(Buffer.from(icon)).png().toFile("assets/icon-only.png");
await sharp(Buffer.from(splash("#2c3a2e", "#d3e29f", "#2c3a2e"))).png().toFile("assets/splash.png");
await sharp(Buffer.from(splash("#1a231c", "#d3e29f", "#1a231c"))).png().toFile("assets/splash-dark.png");

console.log("Wrote assets/icon-only.png, assets/splash.png, assets/splash-dark.png");
