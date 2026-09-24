/**
 * Coin jar physics + rendering on a 2D canvas. Framework-agnostic: no React, no app state.
 *
 * - Verlet integration, fixed 1/120 s substeps, position constraints against the glass (shared geometry) and
 *   between coins. Low-speed damping so piles settle, and the RAF loop PARKS when everything is at rest.
 * - Coins are pre-rendered sprites (per token/size/locked) and drawn rotated with their rolling angle.
 * - Emits impact events (speed, size) for coins flagged audible, so sound follows the physics.
 */
import { METALS, type Metal } from "@/lib/fx/metals";
import { CX, INNER, VB_H, VB_W, innerHalfWidth } from "./vessel-geometry";

export type CoinToken = keyof typeof METALS;
export type CoinSpec = { id: string; token: CoinToken; r: number; locked?: boolean };

type Body = CoinSpec & {
  x: number;
  y: number;
  px: number;
  py: number;
  a: number;
  audible: boolean;
  lastSound: number;
  landed: boolean;
  onLand?: () => void;
};

export type ImpactEvent = { speed: number; size: number; locked: boolean };

const DT = 1 / 120;
const G = 2300;
const ITER = 5;

export class VesselEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private bodies: Body[] = [];
  private queue: Array<{ at: number; body: Body }> = [];
  private sprites = new Map<string, HTMLCanvasElement>();
  private raf: number | null = null;
  private last = 0;
  private acc = 0;
  private restFrames = 0;
  private scale = 1;
  private dpr = 1;
  private cssWidth = 0;
  /** Frames rendered since creation (verification: proves the loop parks). */
  frames = 0;
  private dead = false;
  private time = 0;
  private impactListener: ((e: ImpactEvent) => void) | null = null;
  private rmQuery: MediaQueryList | null = typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  /** Live: follows the OS setting, so there is no window where a stale React value lets a pour through. */
  get reducedMotion(): boolean {
    return this.rmQuery?.matches ?? false;
  }

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas unavailable");
    this.ctx = ctx;
  }

  onImpact(fn: ((e: ImpactEvent) => void) | null) {
    this.impactListener = fn;
  }

  /** CSS width of the canvas; height follows the viewBox aspect. */
  resize(cssWidth: number, dpr: number) {
    if (this.dead || cssWidth <= 0) return;
    const d = Math.min(dpr || 1, 2);
    // Compare against our own state, not the canvas: a previous engine (StrictMode remount) may have sized it already.
    if (cssWidth === this.cssWidth && d === this.dpr) return;
    this.cssWidth = cssWidth;
    this.canvas.width = Math.round(cssWidth * d);
    this.canvas.height = Math.round(((cssWidth * VB_H) / VB_W) * d);
    this.scale = cssWidth / VB_W;
    this.dpr = d;
    this.sprites.clear();
    this.draw();
  }

  /**
   * Reconcile to a coin set by id. New coins pour in from the mouth (or appear settled with `instant`);
   * coins no longer listed are removed.
   */
  setCoins(specs: CoinSpec[], { instant = false }: { instant?: boolean } = {}) {
    if (this.dead) return;
    const want = new Map(specs.map((s) => [s.id, s]));
    this.bodies = this.bodies.filter((b) => want.has(b.id));
    this.queue = this.queue.filter((q) => want.has(q.body.id));
    const have = new Set([...this.bodies.map((b) => b.id), ...this.queue.map((q) => q.body.id)]);
    const fresh = specs.filter((s) => !have.has(s.id));
    if (!fresh.length) {
      // Locked flag may flip (claimed): refresh in place.
      for (const b of this.bodies) {
        const s = want.get(b.id);
        if (s) b.locked = s.locked;
      }
      this.wake();
      return;
    }
    if (instant || this.reducedMotion) {
      this.placeSettled(fresh);
      this.draw();
      return;
    }
    let at = this.time + 0.05;
    for (const s of fresh) {
      this.queue.push({ at, body: this.makeBody(s, CX + (rand(s.id, 1) - 0.5) * 90, -s.r - 4, false) });
      at += 0.05;
    }
    this.wake();
  }

  /** Drop one coin through the mouth. Resolves when it first lands. */
  drop(spec: CoinSpec, { x, vy = 380 }: { x?: number; vy?: number } = {}): Promise<void> {
    if (this.dead) return Promise.resolve();
    this.bodies = this.bodies.filter((b) => b.id !== spec.id);
    if (this.reducedMotion) {
      this.placeSettled([spec]);
      this.draw();
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const b = this.makeBody(spec, x ?? CX + (Math.random() - 0.5) * 30, 18, true);
      b.py = b.y - vy * DT;
      b.onLand = resolve;
      this.bodies.push(b);
      this.wake();
    });
  }

  /** Toss everything up a little (tap on the jar). */
  shake(strength = 1) {
    if (this.dead || this.reducedMotion) return;
    for (const b of this.bodies) {
      const up = (260 + Math.random() * 380) * strength;
      b.px = b.x - (Math.random() - 0.5) * 220 * strength * DT;
      b.py = b.y + up * DT;
      b.audible = true;
    }
    this.wake();
  }

  /** Screen-space (CSS px, relative to the canvas) of the jar mouth, for flights that end there. */
  mouthPoint(): { x: number; y: number } {
    return { x: CX * this.scale, y: 26 * this.scale };
  }

  destroy() {
    this.dead = true;
    if (this.raf != null) cancelAnimationFrame(this.raf);
    this.raf = null;
    this.bodies = [];
    this.queue = [];
    this.sprites.clear();
    this.impactListener = null;
  }

  // -------------------------------------------------------------------------------------------------------------------

  private makeBody(s: CoinSpec, x: number, y: number, audible: boolean): Body {
    const vx = (rand(s.id, 2) - 0.5) * 80;
    return { ...s, x, y, px: x - vx * DT, py: y - 60 * DT, a: rand(s.id, 3) * Math.PI * 2, audible, lastSound: 0, landed: false };
  }

  /** Deterministic packing from the floor up, then a short relax. Used for reduced motion and instant fills. */
  private placeSettled(specs: CoinSpec[]) {
    const all = [...this.bodies];
    for (const s of specs) {
      const b = this.makeBody(s, CX, INNER.bottom - s.r, false);
      // Find the lowest free slot scanning rows.
      let placed = false;
      for (let y = INNER.bottom - s.r; y > 40 && !placed; y -= 4) {
        const half = innerHalfWidth(y) - s.r - 1;
        for (let k = 0; k <= 24 && !placed; k++) {
          const x = CX + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (half / 12) * (rand(s.id, 5) * 0.4 + 0.8);
          if (Math.abs(x - CX) > half) continue;
          if (this.cornerOk(x, y, s.r) && all.every((o) => (o.x - x) ** 2 + (o.y - y) ** 2 >= (o.r + s.r - 1) ** 2)) {
            b.x = b.px = x;
            b.y = b.py = y;
            placed = true;
          }
        }
      }
      b.landed = true;
      all.push(b);
      this.bodies.push(b);
    }
    for (let i = 0; i < 90; i++) this.step(true);
    for (const b of this.bodies) {
      b.px = b.x;
      b.py = b.y;
    }
  }

  private cornerOk(x: number, y: number, r: number): boolean {
    const cy = INNER.bottom - INNER.corner;
    if (y <= cy) return true;
    const cxL = CX - INNER.bodyHalf + INNER.corner;
    const cxR = CX + INNER.bodyHalf - INNER.corner;
    const ccx = x < cxL ? cxL : x > cxR ? cxR : null;
    if (ccx == null) return true;
    return Math.hypot(x - ccx, y - cy) <= INNER.corner - r;
  }

  private wake() {
    if (this.dead) return;
    // Reduced motion: coins are placed settled, so there is nothing to animate. Paint once and stay parked.
    if (this.reducedMotion) {
      this.draw();
      return;
    }
    this.restFrames = 0;
    if (this.raf == null) {
      this.last = performance.now();
      this.acc = 0;
      this.raf = requestAnimationFrame(this.frame);
    }
  }

  private frame = (now: number) => {
    this.raf = null;
    if (this.dead) return;
    const elapsed = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.acc += elapsed;
    let steps = 0;
    while (this.acc >= DT && steps < 6) {
      this.step(false);
      this.acc -= DT;
      steps++;
    }
    this.draw();
    this.frames++;
    const moving = this.queue.length > 0 || this.bodies.some((b) => Math.abs(b.x - b.px) + Math.abs(b.y - b.py) > 0.02);
    this.restFrames = moving ? 0 : this.restFrames + 1;
    if (this.restFrames < 12) this.raf = requestAnimationFrame(this.frame);
  };

  private step(silent: boolean) {
    this.time += DT;
    while (this.queue.length && this.queue[0].at <= this.time) this.bodies.push(this.queue.shift()!.body);

    const bs = this.bodies;
    const pre: Array<[number, number]> = new Array(bs.length);
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      let vx = (b.x - b.px) * 0.999;
      let vy = (b.y - b.py) * 0.999;
      // Settling damping: kills micro-jitter so the loop can park.
      const sp = Math.abs(vx) + Math.abs(vy);
      if (b.landed && sp < 0.05) {
        vx *= 0.4;
        vy *= 0.4;
      }
      b.px = b.x;
      b.py = b.y;
      b.x += vx;
      b.y += vy + G * DT * DT;
      pre[i] = [b.x - b.px, b.y - b.py];
    }

    for (let it = 0; it < ITER; it++) {
      for (let i = 0; i < bs.length; i++) {
        const a = bs[i];
        for (let j = i + 1; j < bs.length; j++) {
          const b = bs[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const min = a.r + b.r;
          const d2 = dx * dx + dy * dy;
          if (d2 >= min * min || d2 === 0) continue;
          const d = Math.sqrt(d2);
          const push = ((min - d) / d) * 0.5;
          a.x -= dx * push;
          a.y -= dy * push;
          b.x += dx * push;
          b.y += dy * push;
          if (it === 0) {
            this.friction(a, 0.04);
            this.friction(b, 0.04);
            if (a.landed) b.landed = true;
            if (b.landed) a.landed = true;
          }
        }
      }
      for (const b of bs) this.walls(b, it === 0);
    }

    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      const vx = b.x - b.px;
      const vy = b.y - b.py;
      b.a += (vx / b.r) * 0.9;
      const dv = Math.hypot(pre[i][0] - vx, pre[i][1] - vy) / DT;
      if (dv > 90 && b.y > 30) {
        if (!b.landed || b.onLand) {
          b.landed = true;
          const cb = b.onLand;
          b.onLand = undefined;
          cb?.();
        }
        if (!silent && b.audible && this.time - b.lastSound > 0.07 && dv > 140) {
          b.lastSound = this.time;
          try {
            this.impactListener?.({ speed: dv, size: (b.r - 12) / 10, locked: !!b.locked });
          } catch {
            /* a listener must not take the loop down */
          }
        }
      }
    }
  }

  private friction(b: Body, f: number) {
    b.px += (b.x - b.px) * f;
  }

  private walls(b: Body, first: boolean) {
    const r = b.r;
    // Mouth/neck/shoulder/body side walls (only once inside the jar; above the rim it can come from anywhere).
    if (b.y > 30) {
      const half = innerHalfWidth(b.y) - r;
      if (b.x < CX - half) {
        b.x = CX - half;
        if (first) this.bounce(b, "x");
      } else if (b.x > CX + half) {
        b.x = CX + half;
        if (first) this.bounce(b, "x");
      }
    }
    // Floor.
    if (b.y > INNER.bottom - r) {
      b.y = INNER.bottom - r;
      if (first) this.bounce(b, "y");
      b.landed = true;
    }
    // Rounded bottom corners.
    const cy = INNER.bottom - INNER.corner;
    if (b.y > cy) {
      const cxL = CX - INNER.bodyHalf + INNER.corner;
      const cxR = CX + INNER.bodyHalf - INNER.corner;
      const ccx = b.x < cxL ? cxL : b.x > cxR ? cxR : null;
      if (ccx != null) {
        const dx = b.x - ccx;
        const dy = b.y - cy;
        const d = Math.hypot(dx, dy);
        const max = INNER.corner - r;
        if (d > max) {
          b.x = ccx + (dx / d) * max;
          b.y = cy + (dy / d) * max;
          b.landed = true;
        }
      }
    }
  }

  /** Restitution on the glass + tangential friction. */
  private bounce(b: Body, axis: "x" | "y") {
    const e = 0.32;
    if (axis === "y") {
      const vy = b.y - b.py;
      b.py = b.y + vy * e;
      b.px += (b.x - b.px) * 0.12;
    } else {
      const vx = b.x - b.px;
      b.px = b.x + vx * e;
      b.py += (b.y - b.py) * 0.06;
    }
  }

  private draw() {
    const c = this.ctx;
    const k = this.scale * this.dpr;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(k, 0, 0, k, 0, 0);
    // Back to front: older coins first. Sorting by y keeps overlaps plausible (lower = in front).
    const order = [...this.bodies].sort((a, b) => a.y - b.y);
    for (const b of order) {
      const s = this.sprite(b);
      const half = s.width / k / 2;
      c.save();
      c.translate(b.x, b.y);
      c.rotate(b.a);
      c.drawImage(s, -half, -half, half * 2, half * 2);
      c.restore();
    }
  }

  private sprite(b: Body): HTMLCanvasElement {
    const key = `${b.token}:${b.r}:${b.locked ? 1 : 0}`;
    let s = this.sprites.get(key);
    if (s) return s;
    const k = this.scale * this.dpr;
    const pad = 2;
    const size = Math.ceil((b.r + pad) * 2 * k);
    s = document.createElement("canvas");
    s.width = s.height = size;
    const c = s.getContext("2d")!;
    c.scale(k, k);
    paintCoin(c, b.r + pad, b.r + pad, b.r, METALS[b.token], !!b.locked);
    this.sprites.set(key, s);
    return s;
  }
}

/** Embossed coin, lit from the top left. */
export function paintCoin(c: CanvasRenderingContext2D, x: number, y: number, r: number, m: Metal, locked: boolean) {
  // Drop shadow on the coin below.
  c.save();
  c.shadowColor = "rgba(0,0,0,0.45)";
  c.shadowBlur = r * 0.35;
  c.shadowOffsetY = r * 0.12;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = m.lo;
  c.fill();
  c.restore();

  // Body.
  const body = c.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.05, x, y, r * 1.05);
  body.addColorStop(0, m.hi);
  body.addColorStop(0.45, m.mid);
  body.addColorStop(1, m.lo);
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = body;
  c.fill();

  // Rim bevel: bright top-left, dark bottom-right.
  const bevel = c.createLinearGradient(x - r, y - r, x + r, y + r);
  bevel.addColorStop(0, "rgba(255,255,255,0.75)");
  bevel.addColorStop(0.5, "rgba(255,255,255,0.05)");
  bevel.addColorStop(1, "rgba(0,0,0,0.45)");
  c.lineWidth = r * 0.11;
  c.strokeStyle = bevel;
  c.beginPath();
  c.arc(x, y, r - c.lineWidth / 2, 0, Math.PI * 2);
  c.stroke();

  // Reeded edge ticks.
  if (r >= 11) {
    c.save();
    c.strokeStyle = "rgba(0,0,0,0.16)";
    c.lineWidth = Math.max(0.5, r * 0.035);
    const n = 36;
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      c.beginPath();
      c.moveTo(x + Math.cos(t) * r * 0.8, y + Math.sin(t) * r * 0.8);
      c.lineTo(x + Math.cos(t) * r * 0.87, y + Math.sin(t) * r * 0.87);
      c.stroke();
    }
    c.restore();
  }

  // Inner field: recessed ring (dark top-left, light bottom-right).
  const inner = c.createLinearGradient(x - r, y - r, x + r, y + r);
  inner.addColorStop(0, "rgba(0,0,0,0.28)");
  inner.addColorStop(1, "rgba(255,255,255,0.55)");
  c.lineWidth = Math.max(0.6, r * 0.05);
  c.strokeStyle = inner;
  c.beginPath();
  c.arc(x, y, r * 0.74, 0, Math.PI * 2);
  c.stroke();

  if (locked) {
    // Sealed: amber band + padlock.
    c.lineWidth = r * 0.16;
    c.strokeStyle = "rgba(255,170,60,0.95)";
    c.beginPath();
    c.arc(x, y, r * 0.9, 0, Math.PI * 2);
    c.stroke();
    drawPadlock(c, x, y + r * 0.06, r * 0.46, m);
  } else {
    const fs = r * 1.0;
    c.font = `700 ${fs}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    // Emboss: highlight below-right, shadow above-left read as a raised letter under top-left light.
    c.fillStyle = "rgba(255,255,255,0.55)";
    c.fillText(m.glyph, x + r * 0.04, y + r * 0.09);
    c.fillStyle = m.ink;
    c.fillText(m.glyph, x, y + r * 0.05);
  }

  // Specular glint.
  const glint = c.createRadialGradient(x - r * 0.42, y - r * 0.5, 0, x - r * 0.42, y - r * 0.5, r * 0.55);
  glint.addColorStop(0, "rgba(255,255,255,0.65)");
  glint.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = glint;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
}

/** Padlock glyph centred on (x, y); `s` is roughly its half height. Shackle on top, body with a keyhole. */
function drawPadlock(c: CanvasRenderingContext2D, x: number, y: number, s: number, m: Metal) {
  c.save();
  c.fillStyle = m.ink;
  c.strokeStyle = m.ink;
  c.lineWidth = s * 0.26;
  c.lineCap = "butt";
  const bodyTop = y - s * 0.05;
  c.beginPath();
  c.moveTo(x - s * 0.5, bodyTop);
  c.lineTo(x - s * 0.5, y - s * 0.45);
  c.arc(x, y - s * 0.45, s * 0.5, Math.PI, 0);
  c.lineTo(x + s * 0.5, bodyTop);
  c.stroke();
  const w = s * 1.5;
  const h = s * 1.05;
  c.beginPath();
  c.roundRect(x - w / 2, bodyTop, w, h, s * 0.2);
  c.fill();
  c.fillStyle = m.mid;
  c.beginPath();
  c.arc(x, bodyTop + h * 0.42, s * 0.16, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

/** Stable pseudo-random in [0,1) per id + salt (so the same jar looks the same on every render). */
export function rand(id: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
