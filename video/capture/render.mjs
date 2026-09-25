#!/usr/bin/env node
/**
 * Builds the final demo video from a capture take, at a constant 60 fps:
 * warm wallpaper + browser window + the captured page (picked by the timecode strip) + a smooth cursor drawn from the
 * recorded path + eased camera zooms + a "Part / step" label + animated title cards between parts.
 * Page loads marked as cuts are removed. Frames are drawn on a canvas in headless Chromium by parallel workers and
 * encoded by ffmpeg.
 *
 *   node render.mjs [--take ../out/take] [--out ../out] [--workers 4] [--from 0 --to 20] (seconds, for previews)
 *
 * Writes (in --out): buymeashare-demo.mp4 (no audio), buymeashare-demo-scratch-vo.mp4, narration.srt,
 * timecodes.json, and ../tts-narration.md.
 */
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const TAKE = path.resolve(arg("--take", path.join(HERE, "../out/take")));
const OUT = path.resolve(arg("--out", path.join(HERE, "../out")));
const WORKERS = Number(arg("--workers", "4"));
const PW = process.env.PLAYWRIGHT ?? "playwright";
const FONTS = path.resolve(HERE, "../../app/assets/og");
const FPS = 60;
const HOST = "buymeashare.r4to.com";

const narration = JSON.parse(fs.readFileSync(path.join(HERE, "narration.json"), "utf8"));
const { W, H, STRIP, DSF, K = 1, events } = JSON.parse(fs.readFileSync(path.join(TAKE, "events.json"), "utf8"));
const stamps = JSON.parse(fs.readFileSync(path.join(TAKE, "stamps.json"), "utf8"));
const tc = JSON.parse(fs.readFileSync(path.join(TAKE, "tc.json"), "utf8"));

// Canvas layout (1920x1080): window with a 36px title bar, content keeps the 16:9 page.
const L = { wx: 80, wy: 27, ww: 1760, bar: 36, r: 14 };
L.cx = L.wx; L.cy = L.wy + L.bar; L.cw = L.ww; L.ch = Math.round(L.cw * H / W); L.wh = L.bar + L.ch;
const SC = L.cw / W; // page CSS px -> canvas px

// ---------- 1. frame -> recorder clock, from the timecode strip ----------
const px = STRIP * DSF;
const raw = execFileSync("ffmpeg", ["-v", "error", "-framerate", "60", "-i", path.join(TAKE, "frames/%05d.jpg"),
  "-vf", `crop=iw/4:${Math.max(2, px - 4)}:iw*3/8:ih-${px - 2},scale=1:1:flags=area`, "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:"],
  { maxBuffer: 1 << 27 });
const q = (v) => Math.max(0, Math.min(15, Math.round((v - 8) / 16)));
const frameWall = new Array(stamps.length).fill(-Infinity);
{
  let p = -1, firstStamp = 0;
  for (let i = 0; i < stamps.length; i++) {
    const r = raw[i * 3], g = raw[i * 3 + 1], b = raw[i * 3 + 2];
    // Only colours on the 16-level grid are timecodes; anything else is page content (strip not painted yet).
    const onGrid = [r, g, b].every((v) => Math.abs((v - 8) / 16 - q(v)) < 0.3);
    const code = !onGrid || (r < 4 && g < 4 && b < 4) ? 0 : (q(r) << 8) | (q(g) << 4) | q(b);
    if (code) {
      // Codes are painted in order: look only a little ahead, so a stray match can never jump the clock forward.
      let j = -1;
      for (let k = Math.max(0, p); k < Math.min(tc.length, Math.max(0, p) + 40); k++) if (tc[k].code === code) { j = k; break; }
      if (j >= 0 && j !== p) { p = j; firstStamp = stamps[i]; }
    }
    if (p >= 0) frameWall[i] = Math.max(frameWall[i - 1] ?? -Infinity, tc[p].w + Math.min(150, Math.max(0, stamps[i] - firstStamp)));
  }
}
const frameAt = (w) => { // last frame shown at recorder time w
  let lo = 0, hi = frameWall.length - 1, ans = frameWall.findIndex((x) => x > -Infinity);
  while (lo <= hi) { const m = (lo + hi) >> 1; if (frameWall[m] <= w) { ans = m; lo = m + 1; } else hi = m - 1; }
  return ans;
};

// ---------- 2. edit list: title cards + captured scenes minus page loads ----------
const ev = [...events].sort((a, b) => a.w - b.w);
const endW = ev.find((e) => e.type === "end").w;
const sceneW = Object.fromEntries(ev.filter((e) => e.type === "scene").map((e) => [e.id, e.w]));
const cuts = [];
ev.forEach((e) => { if (e.type === "cutStart") cuts.push([e.w, null]); if (e.type === "cutEnd") cuts.at(-1)[1] = e.w; });
const subtractCuts = (a, b) => {
  let pieces = [[a, b]];
  for (const [c0, c1] of cuts) pieces = pieces.flatMap(([x, y]) => (c1 <= x || c0 >= y ? [[x, y]] : [[x, c0], [c1, y]].filter(([u, v]) => v - u > 30)));
  return pieces;
};
const CARD = 2.4, FADE_IN_CARD = 0.35, FADE_OUT_CARD = 0.45, VO_LEAD = 0.35;
const segs = []; // {t0, t1, kind: 'card'|'cap', ...}
const vo = []; // {id, t, max}
let T = 0;
const capScenes = narration.filter((n) => !n.cardOnly);
for (const n of narration) {
  if (n.cardOnly) {
    const dur = Math.max(2.8, n.voSeconds * 1.1 + 1.6);
    segs.push({ t0: T, t1: T + dur, kind: "card", card: n.card, big: true });
    vo.push({ id: n.id, t: T + 0.6, max: +(dur - 1.2).toFixed(1) });
    T += dur;
    continue;
  }
  if (n.card) { segs.push({ t0: T, t1: T + CARD, kind: "card", card: n.card }); T += CARD; }
  const next = capScenes[capScenes.indexOf(n) + 1];
  const start = T;
  for (const [a, b] of subtractCuts(sceneW[n.id], next ? sceneW[next.id] : endW)) {
    // Slow-motion take: 1 wall second of capture = K seconds of video.
    segs.push({ t0: T, t1: T + ((b - a) / 1000) * K, kind: "cap", w0: a, scene: n.id });
    T += ((b - a) / 1000) * K;
  }
  vo.push({ id: n.id, t: start + VO_LEAD, max: +(T - start - VO_LEAD - 0.3).toFixed(1) });
}
const DURATION = T;

// ---------- 3. per-frame state ----------
const byType = (t) => ev.filter((e) => e.type === t);
const moves = byType("move"), kinds = byType("kind"), clicks = ev.filter((e) => e.type === "down" || e.type === "up");
const urls = ev.filter((e) => e.type === "url" || e.type === "cutEnd");
const lastBefore = (arr, w) => { let lo = 0, hi = arr.length - 1, ans = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (arr[m].w <= w) { ans = m; lo = m + 1; } else hi = m - 1; } return ans; };
function cursorAt(w) {
  const i = lastBefore(moves, w);
  const a = moves[Math.max(0, i)], b = moves[i + 1];
  let x = a.x, y = a.y;
  if (b && b.w > a.w && w > a.w) { const t = Math.min(1, (w - a.w) / (b.w - a.w)); x += (b.x - a.x) * t; y += (b.y - a.y) * t; }
  const k = lastBefore(kinds, w), c = lastBefore(clicks, w);
  const ringMs = 480 / K; // wall
  const rings = byType("down").filter((e) => e.w <= w && w - e.w < ringMs).map((e) => ({ x: e.x, y: e.y, age: (w - e.w) / ringMs }));
  return { x, y, kind: k >= 0 ? kinds[k].kind : "arrow", down: c >= 0 && clicks[c].type === "down", rings };
}
// Camera: each cue eases from wherever the camera was to its target over CAM_MS.
const CAM_MS = 750 / K; // wall ms, so the move lasts 0.75 s of video
const cams = byType("cam");
const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const camStarts = [];
{
  let cur = { x: W / 2, y: H / 2, s: 1 };
  cams.forEach((c, i) => {
    if (i > 0) { const p = cams[i - 1], t = easeIO(Math.min(1, (c.w - p.w) / CAM_MS)); const f = camStarts[i - 1]; cur = { x: f.x + (tgt(p).x - f.x) * t, y: f.y + (tgt(p).y - f.y) * t, s: f.s + (tgt(p).s - f.s) * t }; }
    camStarts.push(cur);
  });
}
function tgt(c) { return c.s === 1 ? { x: W / 2, y: H / 2, s: 1 } : { x: c.x, y: c.y, s: c.s }; }
function camAt(w) {
  const i = lastBefore(cams, w);
  let st = { x: W / 2, y: H / 2, s: 1 };
  if (i >= 0) { const f = camStarts[i], g = tgt(cams[i]), t = easeIO(Math.min(1, (w - cams[i].w) / CAM_MS)); st = { x: f.x + (g.x - f.x) * t, y: f.y + (g.y - f.y) * t, s: f.s + (g.s - f.s) * t }; }
  const s = st.s, fx = L.cx + st.x * SC, fy = L.cy + st.y * SC;
  const vx = s <= 1.001 ? 960 : Math.min(1920 - 960 / s, Math.max(960 / s, fx));
  const vy = s <= 1.001 ? 540 : Math.min(1080 - 540 / s, Math.max(540 / s, fy));
  // Blend toward the centred frame as s approaches 1, so zooming out never swings sideways.
  const k = Math.min(1, (s - 1) / 0.25);
  return { s, vx: 960 + (vx - 960) * k, vy: 540 + (vy - 540) * k };
}
function prettyUrl(u) {
  if (!/localhost/.test(u)) return u.replace(/^https?:\/\//, "");
  const p = u.replace(/^https?:\/\/[^/]+/, "").replace(/#.*$/, "").replace(/[?&](demoSuccess|demoLocks|demoDeposits|demoJar)=[^&]*/g, "").replace(/\?&/, "?").replace(/\?$/, "");
  return HOST + (p === "/" ? "" : p);
}
const sceneMeta = Object.fromEntries(narration.map((n) => [n.id, n]));
function capSpec(w, sceneId) {
  const u = lastBefore(urls, w);
  const m = sceneMeta[sceneId];
  return { fi: frameAt(w), cur: cursorAt(w), cam: camAt(w), url: prettyUrl(u >= 0 ? urls[u].url : ""), part: m.part, step: m.step };
}
const segAt = (t) => segs.find((s) => t >= s.t0 && t < s.t1) ?? segs.at(-1);
const specs = [];
const totalFrames = Math.ceil(DURATION * FPS);
let chipKey = "", chipSince = 0;
for (let f = 0; f < totalFrames; f++) {
  const t = f / FPS, s = segAt(t), si = segs.indexOf(s);
  const spec = { t };
  if (s.kind === "cap") {
    spec.cap = capSpec(s.w0 + ((t - s.t0) * 1000) / K, s.scene);
    const key = spec.cap.part + spec.cap.step;
    if (key !== chipKey) { chipKey = key; chipSince = t; }
    spec.chipAge = t - chipSince;
  } else {
    const lt = t - s.t0, dur = s.t1 - s.t0, prev = segs[si - 1], next = segs[si + 1];
    let alpha = 1;
    if (prev?.kind === "cap" && lt < FADE_IN_CARD) { alpha = lt / FADE_IN_CARD; spec.cap = capSpec(prev.w0 + ((prev.t1 - prev.t0) * 1000) / K - 1, prev.scene); spec.chipAge = 99; }
    if (next?.kind === "cap" && dur - lt < FADE_OUT_CARD) { alpha = (dur - lt) / FADE_OUT_CARD; spec.cap = capSpec(next.w0, next.scene); spec.chipAge = 0; }
    spec.card = { ...s.card, lt, dur, alpha, big: !!s.big };
    chipKey = "";
  }
  spec.black = Math.max(0, 1 - t / 0.5, (t - (DURATION - 0.9)) / 0.9);
  specs.push(spec);
}

// Karaoke captions (from karaoke.py): the line on screen and how far the voice is into it.
const CAPS = arg("--captions") ? JSON.parse(fs.readFileSync(path.resolve(arg("--captions")), "utf8")) : [];
for (const spec of specs) {
  const t = spec.t;
  const i = CAPS.findIndex((l, k) => t >= l.t0 - 0.15 && t < Math.min(l.t1 + 0.5, (CAPS[k + 1]?.t0 ?? Infinity) - 0.15));
  if (i < 0) continue;
  const l = CAPS[i];
  spec.caption = { age: t - (l.t0 - 0.15), out: Math.max(0, t - l.t1), words: l.words.map((w) => ({ w: w.w, p: Math.max(0, Math.min(1, (t - w.t0) / Math.max(0.05, w.t1 - w.t0))) })) };
}

if (process.argv.includes("--dump")) {
  for (const s of segs) console.log(s.kind.padEnd(4), s.t0.toFixed(2), s.t1.toFixed(2), s.scene ?? s.card?.title ?? "", s.w0 ? `w0=${s.w0}` : "");
  for (const t of (arg("--at", "") || "").split(",").filter(Boolean).map(Number)) { const sp = specs[Math.round(t * FPS)]; console.log(t, JSON.stringify({ fi: sp.cap?.fi, url: sp.cap?.url, step: sp.cap?.step, card: sp.card?.title })); }
  process.exit(0);
}

// ---------- 4. draw (headless Chromium canvas, parallel workers) ----------
const FR = path.join(TAKE, "frames");
const html = `<!doctype html><meta charset=utf-8><body style="margin:0;background:#000"><canvas id=c width=1920 height=1080></canvas><script>
const L=${JSON.stringify(L)}, PW=${W * DSF}, PH=${H * DSF}, FR=${JSON.stringify("file://" + FR + "/")};
const C=document.getElementById('c'), ctx=C.getContext('2d');
ctx.imageSmoothingQuality='high';
const fonts=[['Serif','InstrumentSerif-Regular.ttf'],['SerifI','InstrumentSerif-Italic.ttf'],['Geist','Geist-Medium.ttf','500'],['Geist','Geist-SemiBold.ttf','600']];
window.ready=(async()=>{for(const [n,f,w] of fonts){const ff=new FontFace(n,'url(file://${FONTS}/'+f+')',{weight:w||'400'});await ff.load();document.fonts.add(ff);}})();
function noise(c,a){const x=c.getContext('2d'),d=x.createImageData(c.width,c.height);for(let i=0;i<d.data.length;i+=4){const v=Math.random()*255;d.data[i]=d.data[i+1]=d.data[i+2]=v;d.data[i+3]=a;}const n=document.createElement('canvas');n.width=c.width;n.height=c.height;n.getContext('2d').putImageData(d,0,0);x.drawImage(n,0,0);}
function mk(fn){const c=document.createElement('canvas');c.width=1920;c.height=1080;fn(c.getContext('2d'));return c;}
const wall=mk(x=>{let g=x.createLinearGradient(0,0,1920,1080);g.addColorStop(0,'#ff9448');g.addColorStop(.38,'#d0521c');g.addColorStop(.72,'#7a2410');g.addColorStop(1,'#2b0d07');x.fillStyle=g;x.fillRect(0,0,1920,1080);
  g=x.createRadialGradient(300,120,0,300,120,900);g.addColorStop(0,'rgba(255,214,150,.55)');g.addColorStop(1,'rgba(255,214,150,0)');x.fillStyle=g;x.fillRect(0,0,1920,1080);
  g=x.createRadialGradient(1700,1000,0,1700,1000,800);g.addColorStop(0,'rgba(120,40,160,.35)');g.addColorStop(1,'rgba(120,40,160,0)');x.fillStyle=g;x.fillRect(0,0,1920,1080);});
noise(wall,10);
const cardBg=mk(x=>{x.fillStyle='#0d0907';x.fillRect(0,0,1920,1080);let g=x.createRadialGradient(560,300,0,560,300,1100);g.addColorStop(0,'rgba(236,112,40,.40)');g.addColorStop(1,'rgba(236,112,40,0)');x.fillStyle=g;x.fillRect(0,0,1920,1080);
  g=x.createRadialGradient(1500,900,0,1500,900,900);g.addColorStop(0,'rgba(140,50,170,.22)');g.addColorStop(1,'rgba(140,50,170,0)');x.fillStyle=g;x.fillRect(0,0,1920,1080);});
noise(cardBg,9);
function svgImg(s){const i=new Image();i.src='data:image/svg+xml;base64,'+btoa(s);return i;}
const CUR={
 arrow:{img:svgImg('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24"><path d="M2 1.6 L2 19.2 L6.3 15.2 L9.1 21.6 L12.2 20.3 L9.5 14 L15.4 14 Z" fill="#000" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>'),hx:2.2,hy:1.8},
 hand:{img:svgImg('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24"><path d="M8 3 C8 1.7 11 1.7 11 3 L11 9.2 C11 8 13.8 8 13.8 9.4 L13.8 9.8 C13.8 8.6 16.5 8.6 16.5 10 L16.5 10.6 C16.5 9.4 19.2 9.4 19.2 10.8 L19.2 16 C19.2 19.5 17.2 22.3 14 22.3 L11 22.3 C8.8 22.3 7.6 21.2 6.4 19.6 L3.2 14.8 C2.5 13.6 3.9 12.3 5.1 13.1 L8 15.2 Z" fill="#fff" stroke="#000" stroke-width="1.2" stroke-linejoin="round"/><path d="M11 9.4 L11 14.2 M13.8 9.9 L13.8 14.2 M16.5 10.7 L16.5 14.2" stroke="#000" stroke-width="1" stroke-linecap="round"/></svg>'),hx:9.5,hy:2},
 ibeam:{img:svgImg('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24"><path d="M9 3 C10.5 3 11.5 3.6 12 4.4 C12.5 3.6 13.5 3 15 3 M12 4.4 L12 19.6 M9 21 C10.5 21 11.5 20.4 12 19.6 C12.5 20.4 13.5 21 15 21" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/><path d="M9 3 C10.5 3 11.5 3.6 12 4.4 C12.5 3.6 13.5 3 15 3 M12 4.4 L12 19.6 M9 21 C10.5 21 11.5 20.4 12 19.6 C12.5 20.4 13.5 21 15 21" fill="none" stroke="#000" stroke-width="1.4" stroke-linecap="round"/></svg>'),hx:12,hy:12}};
const cache=new Map();
async function img(fi){if(cache.has(fi))return cache.get(fi);const i=new Image();i.src=FR+String(fi).padStart(5,'0')+'.jpg';await i.decode();cache.set(fi,i);if(cache.size>4)cache.delete(cache.keys().next().value);return i;}
function rr(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)), eo=t=>1-Math.pow(1-t,3), pr=(lt,a,b)=>eo(clamp((lt-a)/(b-a),0,1));
async function drawCap(s){
  const cam=s.cam;ctx.setTransform(cam.s,0,0,cam.s,960-cam.vx*cam.s,540-cam.vy*cam.s);
  ctx.drawImage(wall,-200,-120,2320,1320);
  ctx.save();ctx.shadowColor='rgba(0,0,0,.55)';ctx.shadowBlur=80;ctx.shadowOffsetY=28;rr(L.wx,L.wy,L.ww,L.wh,L.r);ctx.fillStyle='#0f0c0a';ctx.fill();ctx.restore();
  ctx.save();rr(L.wx,L.wy,L.ww,L.wh,L.r);ctx.clip();
  let g=ctx.createLinearGradient(0,L.wy,0,L.wy+L.bar);g.addColorStop(0,'#27221e');g.addColorStop(1,'#1c1815');ctx.fillStyle=g;ctx.fillRect(L.wx,L.wy,L.ww,L.bar);
  [['#ff5f57',20],['#febc2e',40],['#28c840',60]].forEach(([c,dx])=>{ctx.beginPath();ctx.arc(L.wx+dx,L.wy+L.bar/2,6,0,7);ctx.fillStyle=c;ctx.fill();});
  const pw=640,px=L.wx+L.ww/2-pw/2,py=L.wy+6;rr(px,py,pw,L.bar-12,7);ctx.fillStyle='rgba(255,255,255,.075)';ctx.fill();
  ctx.font='500 13px Geist';ctx.textBaseline='middle';const host=s.url.split('/')[0],rest=s.url.slice(host.length);
  const full=ctx.measureText(s.url).width,tx=Math.max(px+34,L.wx+L.ww/2-full/2);
  ctx.fillStyle='#8f857c';ctx.fillRect(tx-19,py+9,9,7);ctx.strokeStyle='#8f857c';ctx.lineWidth=1.4;ctx.beginPath();ctx.arc(tx-14.5,py+9,3,Math.PI,0);ctx.stroke();
  ctx.save();ctx.beginPath();ctx.rect(px+30,py,pw-44,L.bar-12);ctx.clip();
  ctx.fillStyle='#efe7df';ctx.fillText(host,tx,py+(L.bar-12)/2+1);ctx.fillStyle='#8f857c';ctx.fillText(rest,tx+ctx.measureText(host).width,py+(L.bar-12)/2+1);ctx.restore();
  ctx.drawImage(await img(s.fi),0,0,PW,PH,L.cx,L.cy,L.cw,L.ch);
  ctx.restore();
  rr(L.wx+.5,L.wy+.5,L.ww-1,L.wh-1,L.r);ctx.strokeStyle='rgba(255,255,255,.10)';ctx.lineWidth=1;ctx.stroke();
  const sc=L.cw/${W};
  for(const r of s.cur.rings){const a=r.age;ctx.beginPath();ctx.arc(L.cx+r.x*sc,L.cy+r.y*sc,10+30*eo(a),0,7);ctx.strokeStyle='rgba(255,255,255,'+(.7*(1-a))+')';ctx.lineWidth=2.5;ctx.stroke();ctx.fillStyle='rgba(255,255,255,'+(.14*(1-a))+')';ctx.fill();}
  const cu=CUR[s.cur.kind]||CUR.arrow,size=40*(s.cur.down?.84:1),k=size/24,cx=L.cx+s.cur.x*sc,cy=L.cy+s.cur.y*sc;
  ctx.save();ctx.shadowColor='rgba(0,0,0,.45)';ctx.shadowBlur=6;ctx.shadowOffsetY=2;ctx.drawImage(cu.img,cx-cu.hx*k,cy-cu.hy*k,size,size);ctx.restore();
  ctx.setTransform(1,0,0,1,0,0);
}
const SIDE={Creator:'#ff9a4d',Fan:'#5fd7a4',Mainnet:'#b9a8ff'};
function drawChip(s,age){
  if(!s.part)return;const a=pr(age,0,.4);if(a<=0)return;
  const [pn,side]=s.part.split(' · ');const col=SIDE[side]||'#ff9a4d';
  ctx.save();ctx.globalAlpha*=a;ctx.translate(0,(1-a)*14);
  ctx.font='600 15px Geist';ctx.letterSpacing='2.4px';const t1=(pn+' · '+side).toUpperCase(),w1=ctx.measureText(t1).width;
  ctx.letterSpacing='0px';ctx.font='500 22px Geist';const w2=ctx.measureText(s.step).width;
  const x=L.wx+28,h=54,y=L.wy+L.wh-28-h,w=24+w1+22+1+22+w2+26;
  ctx.save();ctx.shadowColor='rgba(0,0,0,.5)';ctx.shadowBlur=30;ctx.shadowOffsetY=10;rr(x,y,w,h,h/2);ctx.fillStyle='rgba(0,0,0,.01)';ctx.fill();ctx.restore();frost(x,y,w,h,h/2,14);rr(x,y,w,h,h/2);ctx.fillStyle='rgba(18,13,10,.72)';ctx.fill();
  ctx.strokeStyle='rgba(255,255,255,.14)';ctx.lineWidth=1;ctx.stroke();
  ctx.textBaseline='middle';ctx.font='600 15px Geist';ctx.letterSpacing='2.4px';ctx.fillStyle=col;ctx.fillText(t1,x+24,y+h/2+1);
  ctx.letterSpacing='0px';ctx.fillStyle='rgba(255,255,255,.18)';ctx.fillRect(x+24+w1+22,y+15,1,h-30);
  ctx.font='500 22px Geist';ctx.fillStyle='#f5efe8';ctx.fillText(s.step,x+24+w1+22+1+22,y+h/2+1);
  ctx.restore();
}
const TMP=document.createElement('canvas');TMP.width=1920;TMP.height=1080;const tctx=TMP.getContext('2d');
/** Frosted glass: blur what is already drawn behind a rounded rect (copy first: a canvas cannot filter-draw itself). */
function frost(x,y,w,h,r,b){const p=40;tctx.clearRect(0,0,1920,1080);tctx.drawImage(C,x-p,y-p,w+2*p,h+2*p,x-p,y-p,w+2*p,h+2*p);
  ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;rr(x,y,w,h,r);ctx.clip();ctx.filter='blur('+b+'px)';ctx.drawImage(TMP,x-p,y-p,w+2*p,h+2*p,x-p,y-p,w+2*p,h+2*p);ctx.filter='none';ctx.restore();}
function drawCaption(c){
  const a=pr(c.age,0,.22)*(1-clamp((c.out-.3)/.2,0,1));if(a<=0)return;
  ctx.save();ctx.font='600 40px Geist';const sp=ctx.measureText(' ').width;
  const ws=c.words.map(w=>ctx.measureText(w.w).width);const tw=ws.reduce((s,x)=>s+x,0)+sp*(ws.length-1);
  const h=70,w=tw+56,x=960-w/2,y=1080-110-h+(1-a)*16;
  ctx.globalAlpha=a;ctx.shadowColor='rgba(0,0,0,.5)';ctx.shadowBlur=34;ctx.shadowOffsetY=10;rr(x,y,w,h,22);ctx.fillStyle='rgba(0,0,0,.01)';ctx.fill();ctx.shadowColor='transparent';
  frost(x,y,w,h,22,16);
  rr(x,y,w,h,22);ctx.fillStyle='rgba(16,12,10,.74)';ctx.fill();ctx.strokeStyle='rgba(255,255,255,.12)';ctx.lineWidth=1;ctx.stroke();
  ctx.textBaseline='middle';let tx=x+28;
  c.words.forEach((wd,i)=>{
    const active=wd.p>0&&wd.p<1,done=wd.p>=1;
    const lift=active?Math.sin(Math.PI*Math.min(1,wd.p*2.2))*3:0;
    ctx.fillStyle=active?'#ffa24f':done?'#f7f0e8':'rgba(247,240,232,.5)';
    if(active){ctx.shadowColor='rgba(255,140,50,.55)';ctx.shadowBlur=18;}
    ctx.fillText(wd.w,tx,y+h/2+2-lift);ctx.shadowColor='transparent';ctx.shadowBlur=0;
    tx+=ws[i]+sp;
  });
  ctx.restore();
}
function coin(x,y,r,c1,c2,l){ctx.save();const g=ctx.createRadialGradient(x-r*.35,y-r*.35,r*.1,x,y,r);g.addColorStop(0,c1);g.addColorStop(1,c2);ctx.beginPath();ctx.arc(x,y,r,0,7);ctx.fillStyle=g;ctx.fill();ctx.lineWidth=3;ctx.strokeStyle='rgba(255,255,255,.35)';ctx.stroke();ctx.font='400 '+(r*1.05)+'px Serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='rgba(40,25,10,.75)';ctx.fillText(l,x,y+2);ctx.restore();}
function drawCard(c){
  ctx.save();ctx.globalAlpha=c.alpha;const z=1+.025*(c.lt/c.dur);ctx.setTransform(z,0,0,z,960-960*z,540-540*z);ctx.drawImage(cardBg,0,0);ctx.setTransform(1,0,0,1,0,0);
  ctx.textAlign='center';ctx.textBaseline='alphabetic';
  const top=c.big?360:410;
  if(c.big){const a=pr(c.lt,0,.6);ctx.globalAlpha=c.alpha*a;const cy=top-60+(1-a)*16;coin(900,cy,34,'#ffe08a','#c48a1c','O');coin(960,cy,34,'#7ee0b0','#1f7a55','K');coin(1020,cy,34,'#f1f3f6','#9aa3ad','S');}
  let a=pr(c.lt,.05,.6);ctx.globalAlpha=c.alpha*a;ctx.font='600 22px Geist';ctx.letterSpacing='6px';ctx.fillStyle='#ff9a4d';ctx.fillText(c.label.toUpperCase(),960,top+(1-a)*18);ctx.letterSpacing='0px';
  a=pr(c.lt,.3,.9);ctx.globalAlpha=c.alpha*a;ctx.fillStyle='rgba(255,154,77,.8)';ctx.fillRect(960-70*a,top+26,140*a,2);
  a=pr(c.lt,.18,.85);ctx.globalAlpha=c.alpha*a;ctx.font='400 '+(c.big?164:150)+'px Serif';ctx.fillStyle='#f7f0e8';ctx.fillText(c.title,960,top+180+(1-a)*40);
  a=pr(c.lt,.38,1.0);ctx.globalAlpha=c.alpha*a;ctx.font='500 38px Geist';ctx.fillStyle='rgba(247,240,232,.72)';ctx.fillText(c.subtitle,960,top+262+(1-a)*24);
  ctx.textAlign='left';ctx.restore();
}
window.frame=async(s)=>{
  ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.fillStyle='#000';ctx.fillRect(0,0,1920,1080);
  if(s.cap){await drawCap(s.cap);drawChip(s.cap,s.chipAge);}
  if(s.card)drawCard(s.card);
  if(s.caption)drawCaption(s.caption);
  if(s.black>0){ctx.globalAlpha=Math.min(1,s.black);ctx.fillStyle='#000';ctx.fillRect(0,0,1920,1080);ctx.globalAlpha=1;}
  return C.toDataURL('image/jpeg',.93);
};
</script>`;
const htmlPath = path.join(TAKE, "render.html");
fs.writeFileSync(htmlPath, html);

const from = Math.floor(Number(arg("--from", "0")) * FPS), to = Math.min(totalFrames, Math.ceil(Number(arg("--to", String(DURATION))) * FPS));
const { chromium } = await import(PW);
const browser = await chromium.launch({ channel: "chromium", args: ["--allow-file-access-from-files", "--enable-gpu", "--use-angle=metal", "--ignore-gpu-blocklist"] });
const chunkDir = path.join(TAKE, "chunks");
fs.rmSync(chunkDir, { recursive: true, force: true });
fs.mkdirSync(chunkDir, { recursive: true });
const per = Math.ceil((to - from) / WORKERS);
const t0 = Date.now();
let done = 0;
const chunks = await Promise.all(Array.from({ length: WORKERS }, async (_, wi) => {
  const a = from + wi * per, b = Math.min(to, a + per);
  if (a >= b) return null;
  const pg = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  pg.on("pageerror", (e) => console.error("render page error:", e.message));
  await pg.goto("file://" + htmlPath);
  await pg.evaluate(() => window.ready);
  await pg.waitForTimeout(300);
  const file = path.join(chunkDir, `c${wi}.mp4`);
  const ff = spawn("ffmpeg", ["-v", "error", "-y", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
    "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p", "-r", String(FPS), file], { stdio: ["pipe", "inherit", "inherit"] });
  for (let f = a; f < b; f++) {
    const data = await pg.evaluate((s) => window.frame(s), specs[f]);
    if (!ff.stdin.write(Buffer.from(data.slice(data.indexOf(",") + 1), "base64"))) await new Promise((r) => ff.stdin.once("drain", r));
    if (++done % 300 === 0) process.stdout.write(`\r  ${done}/${to - from} frames (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on("close", r));
  await pg.close();
  return file;
}));
await browser.close();
console.log(`\n  drawn in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
const list = path.join(chunkDir, "list.txt");
fs.writeFileSync(list, chunks.filter(Boolean).map((f) => `file '${f}'`).join("\n"));
const video = path.join(OUT, from > 0 || to < totalFrames ? "preview.mp4" : "buymeashare-demo.mp4");
execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", video], { stdio: "inherit" });
if (video.endsWith("preview.mp4")) { console.log(video); process.exit(0); }

// ---------- 5. scratch voice-over, subtitles, timecodes, TTS script ----------
const clips = vo.map((v) => ({ ...v, file: path.join(OUT, "vo", `${v.id}.aiff`), n: sceneMeta[v.id] }));
const af = clips.map((c, i) => `[${i + 1}:a]aresample=48000,adelay=${Math.round(c.t * 1000)}:all=1[a${i}]`).join(";") +
  `;${clips.map((_, i) => `[a${i}]`).join("")}amix=inputs=${clips.length}:normalize=0,apad[a]`;
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", video, ...clips.flatMap((c) => ["-i", c.file]), "-filter_complex", af,
  "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", path.join(OUT, "buymeashare-demo-scratch-vo.mp4")], { stdio: "inherit" });
const srtT = (t) => { const ms = Math.round(t * 1000); return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`; };
let srt = "", k = 1;
for (const c of clips) {
  const sentences = c.n.text.match(/[^.?!:]+[.?!:]+(\s|$)|[^.?!:]+$/g).map((x) => x.trim()).filter(Boolean);
  const chars = sentences.reduce((n, x) => n + x.length, 0);
  let t = c.t;
  for (const x of sentences) { const d = (c.n.voSeconds * x.length) / chars; srt += `${k++}\n${srtT(t)} --> ${srtT(t + d - 0.05)}\n${x}\n\n`; t += d; }
}
fs.writeFileSync(path.join(OUT, "narration.srt"), srt);
const tcOut = clips.map((c) => ({ id: c.id, voiceStartsAt: +c.t.toFixed(2), maxVoiceSeconds: c.max, scratchVoiceSeconds: c.n.voSeconds }));
fs.writeFileSync(path.join(OUT, "timecodes.json"), JSON.stringify({ duration: +DURATION.toFixed(2), scenes: tcOut }, null, 2));
const mmss = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;
fs.writeFileSync(path.join(HERE, "../tts-narration.md"), [
  "# Buy Me a Share: narration for TTS (English)", "",
  "Generated by `capture/render.mjs` from `capture/narration.json` and the recorded take. Do not edit the times by hand.", "",
  "Two voices, first person: **female = the creator** (she receives the tips), **male = the fan** (he gives them). One clip per block, named after its id (e.g. `p1-why.mp3`), in `video/tts/`; then run `node capture/mux-voice.mjs`.",
  "Scratch voices: macOS Samantha (female) and Reed (male), 160 wpm.",
  "Each clip must fit its `max` length; `scratch` is the length of the scratch voice for reference.",
  "Pronunciation hints: \"Tessera\" = \"teh-SEH-rah\", \"USDC\" = \"U S D C\", \"pre-IPO\" = \"pre I P O\".", "",
  "", "| Voice | Blocks |", "|---|---|",
  `| Female (creator) | ${clips.filter((c) => c.n.voice === "female").map((c) => "`" + c.id + "`").join(", ")} |`,
  `| Male (fan) | ${clips.filter((c) => c.n.voice === "male").map((c) => "`" + c.id + "`").join(", ")} |`, "",
  ...clips.flatMap((c) => [`## ${c.id}  ·  ${c.n.voice === "female" ? "FEMALE (creator)" : "MALE (fan)"}  ·  starts ${mmss(c.t)}  ·  max ${c.max}s  ·  scratch ${c.n.voSeconds}s`, "", c.n.text, ""]),
].join("\n"));
console.log(`video ${video} (${DURATION.toFixed(1)}s)`);
console.table(tcOut);
