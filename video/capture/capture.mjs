#!/usr/bin/env node
/**
 * Records the Buy Me a Share demo take. Only the page is captured here; render.mjs builds the final video
 * (window, 60 fps cursor, camera zooms, title cards, part labels) from what this script logs.
 *
 *   node capture.mjs [--base http://localhost:3200] [--out ../out/take] [--dsf 2] [--headed]
 *
 * Needs the app built with NEXT_PUBLIC_DEMO_FLAGS=1 (or `next dev`): tips, claims and reclaims are simulated and
 * nothing is sent on-chain, except Part 4, which shows the real mainnet jar and its transaction.
 *
 * Writes to --out:
 *   frames/*.jpg   CDP screencast frames (page + 4px timecode strip at the bottom)
 *   stamps.json    screencast timestamp per frame (ms)
 *   tc.json        [{code, w}] when each timecode colour was painted (w = recorder clock, ms)
 *   events.json    [{w, type, ...}] scenes, cuts, cursor path, clicks, cursor shape, camera cues, URLs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg("--base", "http://localhost:3200");
const OUT = path.resolve(arg("--out", path.join(HERE, "../out/take")));
const DSF = Number(arg("--dsf", "2"));
const PW = process.env.PLAYWRIGHT ?? "playwright";
const W = 1440, H = 810, STRIP = 4; // 16:9 viewport + timecode strip underneath
// Slow motion: the page's clocks run at K x real time and render.mjs speeds the take back up, so the ~37 fps the
// screencast manages at 2x becomes ~37/K fps of page time (coin flight, confetti and jar physics come out smooth).
// Every duration in this script is in page time; sleep() and moveTo() convert to wall time.
const K = Number(arg("--slowmo", "0.4"));

const CREATOR = "BV2KTH6X17ueowpX2b58JDJC41WpLYPf8tfr2WTaiNRg"; // test creator wallet (empty on mainnet)
const FAN = "H4KB32QYTbgHWQathSgSwatGoxHCeeTo7V87X5JiYB9Q"; // test fan wallet
const LIVE = "DrPUR2AiAk9rp1NJDs3dQn73xZt1nTG3jLKZzqsLYFsk"; // real mainnet jar (first real tip, 24/09)
const NARRATION = JSON.parse(fs.readFileSync(path.join(HERE, "narration.json"), "utf8"));
// On-screen time per scene: at least the scratch narration, with headroom for a slower TTS voice.
const minMs = (id) => Math.round((NARRATION.find((n) => n.id === id).voSeconds * 1.1 + 0.6) * 1000); // page time

const events = [];
const log = (type, data = {}) => events.push({ w: Date.now(), type, ...data });

const { chromium } = await import(PW);
const browser = await chromium.launch({
  channel: "chromium",
  headless: !process.argv.includes("--headed"),
  // A real device scale factor (not viewport emulation): CDP screencast only delivers frames at window pixel size.
  args: ["--disable-frame-rate-limit", "--hide-scrollbars", "--enable-gpu", "--use-angle=metal", "--ignore-gpu-blocklist",
    `--force-device-scale-factor=${DSF}`, `--window-size=${W},${H + STRIP + 87}`],
});
const ctx = await browser.newContext({ viewport: null, colorScheme: "dark", permissions: ["clipboard-read", "clipboard-write"] });
const clockSrc = fs.readFileSync(path.join(HERE, "clock.js"), "utf8").replace(/^\s*\/\/.*$/gm, "").trim().replace(/;$/, "");
await ctx.addInitScript({ content: `(${clockSrc})(${JSON.stringify({ k: K })});` });
await ctx.addInitScript({ path: path.join(HERE, "page.js") });
await ctx.addInitScript({ path: path.join(HERE, "wallet.js") });
await ctx.exposeBinding("__recKind", (_src, kind) => log("kind", { kind }));
const page = await ctx.newPage();
{
  // Headless window chrome height differs between builds: fix the window so the page is exactly W x (H + STRIP).
  const inner = await page.evaluate(() => [innerWidth, innerHeight, devicePixelRatio]);
  if (inner[0] !== W || inner[1] !== H + STRIP || inner[2] !== DSF) {
    const cdp0 = await ctx.newCDPSession(page);
    const { windowId } = await cdp0.send("Browser.getWindowForTarget");
    const { bounds } = await cdp0.send("Browser.getWindowBounds", { windowId });
    await cdp0.send("Browser.setWindowBounds", { windowId, bounds: { width: bounds.width + W - inner[0], height: bounds.height + H + STRIP - inner[1] } });
    const now = await page.evaluate(() => [innerWidth, innerHeight, devicePixelRatio]);
    if (now[0] !== W || now[1] !== H + STRIP || now[2] !== DSF) throw new Error(`page is ${now.join("x")}, expected ${W}x${H + STRIP}@${DSF}`);
  }
}
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));

// ---------- warm every route so nothing cold-starts on camera ----------
for (const u of ["/", `/tip/${CREATOR}?name=Maya&x=maya&demoSuccess=1`, `/jar/${CREATOR}?demoLocks=110&demoJar=1`, `/deposits/${FAN}?demoDeposits=1`, `/jar/${LIVE}`])
  await page.goto(BASE + u, { waitUntil: "networkidle", timeout: 120000 });

// ---------- motion ----------
let seed = 11;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const sleep = (ms) => page.waitForTimeout(ms / K); // page-time ms -> wall
const pos = { x: W * 0.62, y: H * 0.58 };
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

async function mouseTo(x, y) {
  await page.mouse.move(x, y);
  pos.x = x; pos.y = y;
  log("move", { x, y });
}

async function moveTo(x, y, ms) {
  const sx = pos.x, sy = pos.y;
  const dist = Math.hypot(x - sx, y - sy);
  if (dist < 1) return;
  ms ??= Math.min(950, Math.max(380, 280 + dist * 0.5));
  ms /= K; // wall
  const bend = (rnd() - 0.5) * Math.min(80, dist * 0.16);
  const nx = -(y - sy) / dist, ny = (x - sx) / dist;
  const t0 = Date.now();
  for (;;) {
    const t = Math.min(1, (Date.now() - t0) / ms);
    const e = ease(t);
    const arc = Math.sin(Math.PI * e) * bend;
    await mouseTo(sx + (x - sx) * e + nx * arc, sy + (y - sy) * e + ny * arc);
    if (t >= 1) break;
    await page.waitForTimeout(8);
  }
}

async function boxOf(target) {
  const loc = typeof target === "string" ? page.locator(target).first() : target.first();
  try {
    await loc.waitFor({ state: "visible", timeout: 10000 });
  } catch {
    throw new Error(`not visible: ${loc}`);
  }
  return loc.boundingBox();
}

const dbg = (m) => process.env.DEBUG_STEPS && console.log(`  [${((Date.now() - T0) / 1000).toFixed(1)}s] ${m}`);
const T0 = Date.now();
async function hover(target, { at, ms, pause = 0 } = {}) {
  dbg(`hover ${String(target).slice(0, 70)}`);
  let b = await boxOf(target);
  if (b.y < 70 || b.y + b.height > H - 30) {
    await scrollBy(b.y + b.height / 2 - H / 2);
    b = await boxOf(target);
  }
  const [fx, fy] = at ?? [0.5 + (rnd() - 0.5) * 0.2, 0.5 + (rnd() - 0.5) * 0.2];
  await moveTo(b.x + b.width * fx, b.y + b.height * fy, ms);
  if (pause) await sleep(pause);
}

async function press() {
  dbg("press");
  log("down", { x: pos.x, y: pos.y });
  await page.mouse.down();
  await sleep(90);
  await page.mouse.up();
  log("up", { x: pos.x, y: pos.y });
}

async function click(target, opts = {}) {
  await hover(target, opts);
  await sleep(opts.before ?? 150);
  await press();
  await sleep(opts.after ?? 250);
}

async function typeText(text, per = 85) {
  for (const ch of text) {
    await page.keyboard.type(ch);
    await sleep(per * (0.6 + rnd() * 0.8));
  }
}

async function scrollBy(dy, ms) {
  ms ??= Math.min(1400, Math.max(650, Math.abs(dy) * 1.3));
  await page.evaluate(({ dy, ms }) => new Promise((res) => {
    const start = scrollY, t0 = performance.now();
    const to = Math.max(0, Math.min(document.documentElement.scrollHeight - innerHeight, start + dy));
    const step = (now) => {
      const t = Math.min(1, (now - t0) / ms);
      const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
      scrollTo(0, start + (to - start) * e);
      t < 1 ? requestAnimationFrame(step) : res();
    };
    requestAnimationFrame(step);
  }), { dy, ms });
  await mouseTo(pos.x, pos.y);
}

/** Camera cue for render.mjs: zoom `s`x onto a point of a box (page CSS px), or back to the full window with cam(null). */
async function cam(target, s = 1.4, { at = [0.5, 0.5] } = {}) {
  if (!target) return log("cam", { s: 1 });
  const b = await boxOf(target);
  log("cam", { x: b.x + b.width * at[0], y: b.y + b.height * at[1], s });
}

/** Next <Link>s navigate client-side and would drop the demo flags: navigate to the flagged URL instead, 150 ms
 *  later so the cut starts on this page. */
async function redirectLink(link, url) {
  await link.first().evaluate((a, url) => {
    a.addEventListener("click", (e) => { e.preventDefault(); e.stopImmediatePropagation(); setTimeout(() => { location.href = url; }, 150); }, { capture: true, once: true });
  }, url);
}

/** Page loads are recorded but cut by render.mjs: every change of page becomes a hard cut to a ready page. */
let cutInScene = 0;
async function cut(fn) {
  const c0 = Date.now();
  log("cutStart");
  await fn();
  await mouseTo(pos.x + 0.5, pos.y);
  await mouseTo(pos.x - 0.5, pos.y);
  await sleep(250);
  log("cutEnd", { url: page.url() });
  cutInScene += Date.now() - c0;
}

async function goto(url, ready) {
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  if (ready) await ready.first().waitFor({ state: "visible", timeout: 30000 });
}

/** Which test account the Demo Wallet exposes, and whether this site is already approved (auto-connect). */
async function setWallet(account, connected) {
  await page.evaluate(({ account, connected }) => {
    localStorage.setItem("rec:account", account);
    localStorage.setItem("rec:approved", connected ? account : "");
    if (connected) localStorage.setItem("walletName", JSON.stringify("Demo Wallet"));
    else localStorage.removeItem("walletName");
  }, { account, connected });
}

async function connectWallet() {
  await click(page.locator(".wallet-adapter-button-trigger", { hasText: "Select Wallet" }), { after: 500 });
  await click(page.locator(".wallet-adapter-modal-list li", { hasText: "Demo Wallet" }), { after: 300 });
  const approve = page.locator("#recw-primary");
  await approve.waitFor();
  await sleep(500);
  await click(approve, { after: 600 });
}

/** A wallet approval is an ordinary click: no zoom. */
async function approveInWallet() {
  const approve = page.locator("#recw-primary");
  await approve.waitFor({ timeout: 40000 });
  await sleep(700);
  await click(approve, { after: 300 });
}

// ---------- scenes ----------
const scenes = {
  async "p1-why"() {
    await sleep(700);
    await hover(page.getByText("pre-IPO exposure.").first(), { at: [0.6, 0.5], pause: 1300 });
    const tap = await boxOf(page.getByText("Tap the jar"));
    await moveTo(tap.x + tap.width / 2 + 10, tap.y - 140, 900);
    await press();
    await sleep(1400);
  },

  async "p1-connect"() {
    await connectWallet();
    await hover(page.locator(".wallet-adapter-button-trigger").first(), { pause: 400 });
  },

  async "p1-link"() {
    await click(page.getByRole("link", { name: "Create your link" }), { after: 1100 });
    await cam(page.locator("#wallet"), 1.3, { at: [0.5, 2.2] });
    await click(page.getByRole("button", { name: /Use connected wallet/ }), { after: 700 });
    await click("#name", { after: 150 });
    await typeText("Maya", 95);
    await click("#handle", { after: 150 });
    await typeText("maya", 95);
    await sleep(500);
    await hover(page.getByText(/\/tip\/BV2K/).first(), { at: [0.35, 0.5], pause: 900 });
  },

  async "p1-share"() {
    await scrollBy(420, 1100);
    const note = page.getByText("This is the card people see");
    await cam(note, 1.3, { at: [0.8, -3.2] });
    await hover(note, { at: [0.45, 0.5], pause: 200 });
    await moveTo(pos.x + 130, pos.y - 200, 800);
    await sleep(900);
    await click(page.getByRole("button", { name: "Copy link" }), { after: 1400 });
    await cam(null);
  },

  async "p2-open"() {
    await cut(async () => {
      await setWallet("fan", false);
      await goto(`${BASE}/tip/${CREATOR}?name=Maya&x=maya&demoSuccess=1`, page.getByText("Select Wallet"));
    });
    await hover(page.getByText("unverified").first(), { pause: 700 });
    await hover("canvas", { at: [0.5, 0.6], pause: 900 });
  },

  async "p2-connect"() {
    await connectWallet();
  },

  async "p2-choose"() {
    await cam(page.locator("form"), 1.3, { at: [0.5, 0.3] });
    await click(page.locator("button", { hasText: "T-Kalshi" }), { after: 450 });
    await click(page.locator("button", { hasText: "T-SpaceX" }), { after: 450 });
    await click(page.locator("button", { hasText: "T-OpenAI" }), { after: 500 });
    await click(page.getByRole("button", { name: "$5", exact: true }), { after: 350 });
    await click(page.getByRole("button", { name: "$3", exact: true }), { after: 400 });
    await click(page.locator("button", { hasText: /^SOL$/ }), { after: 500 });
    await click(page.locator("button", { hasText: /^USDC$/ }), { after: 300 });
    await cam(null);
  },

  async "p2-tip"() {
    await click(page.getByRole("button", { name: /^Tip \$3\.00/ }), { after: 200 });
    await approveInWallet();
    await cam("canvas", 1.3, { at: [0.5, 0.6] });
    await page.getByText("Tip sent", { exact: true }).waitFor({ timeout: 40000 });
    await sleep(1700); // the receipt may auto-scroll into view 1.5 s after it appears
    await cam(null);
  },

  async "p2-lock"() {
    await click(page.getByRole("button", { name: /Tip again/ }), { after: 300 });
    await page.getByRole("button", { name: /^Tip \$3\.00/ }).waitFor({ timeout: 5000 });
    await sleep(700); // the receipt's exit animation shifts the form up
    await click("#lock-switch", { after: 900 });
    const warn = page.getByText("Tessera redemption window");
    await cam(warn, 1.4, { at: [0.9, 1.5] });
    await hover(warn, { at: [0.3, 0.5], pause: 1300 });
    await click(page.locator("button", { hasText: "Demo" }), { after: 500 });
    await cam(null);
    await click(page.getByRole("button", { name: /^Tip \$5\.00/ }), { after: 200 });
    await approveInWallet();
    await cam("canvas", 1.3, { at: [0.5, 0.6] });
    await page.getByText("Locked tip sent").waitFor({ timeout: 40000 });
    await sleep(1400);
    await cam(null);
  },

  async "p3-jar"() {
    await cut(async () => {
      await setWallet("creator", false);
      await goto(`${BASE}/jar/${CREATOR}?demoLocks=110&demoJar=1`, page.getByRole("button", { name: "Claim" }));
    });
    await connectWallet();
    await hover(page.getByText("in the jar", { exact: true }), { pause: 700 });
    await hover(page.getByText(/^Holdings$/), { pause: 200 });
    await moveTo(pos.x + 60, pos.y + 62, 500);
    await sleep(600);
    const unlocks = page.getByText(/Unlocks in/).first();
    await cam(unlocks, 1.5, { at: [-0.4, 0.5] });
    await hover(unlocks, { pause: 900 });
  },

  async "p3-claim"() {
    await cam(null);
    await click(page.getByRole("button", { name: "Claim" }).first(), { after: 100 });
    await approveInWallet();
    await cam("canvas", 1.3, { at: [0.5, 0.6] });
    await sleep(2200);
    await cam(null);
  },

  async "p3-refund"() {
    await cut(async () => {
      await setWallet("fan", true);
      await goto(`${BASE}/deposits/${FAN}?demoDeposits=1`, page.getByRole("button", { name: "Reclaim deposit" }));
      await page.locator(".wallet-adapter-button-trigger", { hasText: "H4KB" }).waitFor({ timeout: 10000 }).catch(() => {});
    });
    await click(page.getByRole("button", { name: "Reclaim deposit" }), { after: 100 });
    await approveInWallet();
    await sleep(1400);
  },

  async "p4-live"() {
    await cut(async () => {
      await setWallet("fan", false);
      await goto(`${BASE}/jar/${LIVE}`, page.getByText(/from B45H/));
      await sleep(500);
    });
    await hover(page.getByText("in the jar", { exact: true }), { pause: 800 });
    const row = page.getByText(/from B45H/).first();
    await cam(row, 1.5, { at: [0.8, 0.2] });
    await hover(row, { at: [0.4, 0.5], pause: 900 });
    const tx = page.locator("a", { hasText: "tx" }).first();
    const sig = (await tx.getAttribute("href")).split("/tx/")[1].split("?")[0];
    await redirectLink(tx, `https://explorer.solana.com/tx/${sig}`);
    await click(tx, { after: 0 });
    await cut(async () => {
      await page.waitForLoadState("domcontentloaded");
      await page.getByText("Success", { exact: true }).first().waitFor({ timeout: 30000 });
      await sleep(400);
      log("cam", { s: 1 });
    });
    await hover(page.getByText("Success", { exact: true }).first(), { pause: 900 });
  },

  async "p4-why"() {
    const fee = page.getByText(/^◎?0\.0000/).first();
    await cam(fee, 1.6, { at: [0.2, 0.5] });
    await hover(fee, { at: [0.6, 0.5], pause: 1500 });
    const size = page.getByText(/Max is 1,232 bytes/).first();
    await cam(size, 1.6, { at: [0.1, 0.5] });
    await hover(size, { at: [0.2, 0.5], pause: 1700 });
    await cam(null);
    await sleep(600);
  },
};

// ---------- capture ----------
fs.rmSync(OUT, { recursive: true, force: true });
const FR = path.join(OUT, "frames");
fs.mkdirSync(FR, { recursive: true });

await page.goto(BASE + "/", { waitUntil: "networkidle" });
await setWallet("creator", false);
await page.reload({ waitUntil: "networkidle" });
await sleep(2000);
await mouseTo(pos.x, pos.y);

const cdp = await ctx.newCDPSession(page);
const stamps = [];
let n = 0;
cdp.on("Page.screencastFrame", (ev) => {
  // Ack first: the next frame is only produced after the ack.
  cdp.send("Page.screencastFrameAck", { sessionId: ev.sessionId }).catch(() => {});
  stamps.push(Math.round(ev.metadata.timestamp * 1000));
  fs.promises.writeFile(path.join(FR, String(n++).padStart(5, "0") + ".jpg"), Buffer.from(ev.data, "base64"));
});
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 82, maxWidth: W * DSF, maxHeight: (H + STRIP) * DSF, everyNthFrame: 1 });

// Timecode: a new strip colour every 60 ms, logged with the recorder clock.
const tc = [];
let code = 0, tcBusy = false;
const tcTimer = setInterval(async () => {
  if (tcBusy) return;
  tcBusy = true;
  const c = (code % 4095) + 1;
  try {
    await page.evaluate((c) => window.__recTC?.(c), c);
    code = c;
    tc.push({ code: c, w: Date.now() });
  } catch {}
  tcBusy = false;
}, 60);
await sleep(300);

log("url", { url: page.url() });
log("move", { x: pos.x, y: pos.y });
for (const s of NARRATION.filter((s) => !s.cardOnly)) {
  const t0 = Date.now();
  cutInScene = 0;
  log("scene", { id: s.id });
  process.stdout.write(`scene ${s.id} ... `);
  try {
    await scenes[s.id]();
  } catch (e) {
    console.log(`FAILED: ${e.message.split("\n")[0]}`);
    errors.push(`${s.id}: ${e.message.split("\n")[0]}`);
  }
  const spent = (Date.now() - t0 - cutInScene) * K; // on-screen page time
  if (spent < minMs(s.id)) await sleep(minMs(s.id) - spent);
  console.log(`${(spent / 1000).toFixed(1)}s on screen${cutInScene ? ` (+${(cutInScene / 1000).toFixed(1)}s loading, cut)` : ""}`);
}
log("end");
await sleep(600);
clearInterval(tcTimer);
await cdp.send("Page.stopScreencast");
await sleep(500);

fs.writeFileSync(path.join(OUT, "stamps.json"), JSON.stringify(stamps));
fs.writeFileSync(path.join(OUT, "tc.json"), JSON.stringify(tc));
fs.writeFileSync(path.join(OUT, "events.json"), JSON.stringify({ W, H, STRIP, DSF, K, events }));
const span = (stamps.at(-1) - stamps[0]) / 1000;
console.log(`\nframes ${n} over ${span.toFixed(1)}s => ${(n / span).toFixed(1)} fps`);
console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "no errors");
await browser.close();
