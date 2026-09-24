// Renders every docs/visuals/src/<name>.html to docs/images/<name>.png at 2x device scale.
// Each source draws one #frame element (its own dark rounded card); only that element is captured, with a
// transparent page around it, so the image also sits well on GitHub's light theme.
// Usage: node docs/visuals/render.mjs [name,name]   (screenshots.html reads docs/images/screens/*, see capture.mjs)
import { readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, "src");
const OUT = join(here, "../images");
const only = process.argv[2]?.split(",");
const BUDGET = 750 * 1024;

const names = (await readdir(SRC)).filter((f) => f.endsWith(".html")).map((f) => f.slice(0, -5));
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: 2 });

for (const name of names) {
  if (only && !only.includes(name)) continue;
  const page = await ctx.newPage();
  await page.goto(pathToFileURL(join(SRC, `${name}.html`)).href, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => document.body.dataset.ready !== "0", null, { timeout: 10_000 });
  const png = await page.locator("#frame").screenshot({ omitBackground: true, animations: "disabled" });
  // Lossless recompression first; palette quantisation (which can band the soft gradients) only above the budget.
  let out = await sharp(png).png({ compressionLevel: 9, effort: 10, adaptiveFiltering: true }).toBuffer();
  if (out.length > BUDGET) out = await sharp(png).png({ palette: true, quality: 100, dither: 1, effort: 10, compressionLevel: 9 }).toBuffer();
  const file = join(OUT, `${name}.png`);
  await writeFile(file, out);
  const meta = await sharp(out).metadata();
  console.log(`${name}.png  ${meta.width}x${meta.height}  ${((await stat(file)).size / 1024).toFixed(0)} KB`);
  await page.close();
}
await browser.close();
