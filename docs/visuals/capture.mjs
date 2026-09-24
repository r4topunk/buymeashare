// Captures fresh raw screenshots of the running app into docs/images/screens/.
// Needs the dev server: `cd app && PORT=3001 pnpm dev`. Override with BASE=http://host:port.
// Usage: node docs/visuals/capture.mjs [name,name]
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "../images/screens");
const BASE = process.env.BASE ?? "http://localhost:3001";
const only = process.argv[2]?.split(",");

const TIP_R4TO = "/tip/DrPUR2AiAk9rp1NJDs3dQn73xZt1nTG3jLKZzqsLYFsk?name=r4to&x=r4topunk";
const TIP_ANA = "/tip/EXvTtxurWBUNNCtLojaN8ZBJFNJPZFSH3szoih9hh7YW?name=Ana&x=ana&demoSuccess=auto";
const OG = "/api/og?wallet=DrPUR2AiAk9rp1NJDs3dQn73xZt1nTG3jLKZzqsLYFsk&name=r4to";

const MOBILE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const DESKTOP = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 };

const SHOTS = [
  { name: "tip-mobile", path: TIP_R4TO, ctx: MOBILE, wait: 5000 },
  {
    name: "tip-lock-mobile",
    path: TIP_R4TO,
    ctx: MOBILE,
    wait: 4500,
    act: async (p) => {
      await p.click("#lock-switch");
      await p.waitForTimeout(1200);
      // Frame the lock panel and its warning, which sit below the fold.
      await p.evaluate(() => document.querySelector("#lock-switch").scrollIntoView({ block: "start" }));
      await p.evaluate(() => window.scrollBy(0, -120));
      await p.waitForTimeout(800);
    },
  },
  // The success demo flies a coin into the jar; wait until the physics and count-up settle.
  {
    name: "jar-desktop",
    path: TIP_ANA,
    ctx: DESKTOP,
    wait: 11000,
    // The success state scrolls the receipt into view; go back up so the jar and the total are in frame.
    act: async (p) => {
      await p.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await p.waitForTimeout(1200);
    },
  },
  { name: "og-card", path: OG, ctx: { viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 }, wait: 1500 },
];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
for (const s of SHOTS) {
  if (only && !only.includes(s.name)) continue;
  const ctx = await browser.newContext({ ...s.ctx, reducedMotion: "no-preference" });
  const page = await ctx.newPage();
  await page.goto(BASE + s.path, { waitUntil: "load", timeout: 120_000 });
  await page.waitForTimeout(s.wait);
  if (s.act) await s.act(page);
  const file = join(OUT, `${s.name}.png`);
  // Raw screenshots are kept lossless, except where that would blow the ~800 KB budget (palette quantisation).
  const raw = await page.screenshot();
  let out = await sharp(raw).png({ compressionLevel: 9, effort: 10, adaptiveFiltering: true }).toBuffer();
  if (out.length > 750 * 1024) out = await sharp(raw).png({ palette: true, quality: 100, dither: 1, effort: 10 }).toBuffer();
  await writeFile(file, out);
  console.log("saved", file);
  await ctx.close();
}
await browser.close();
