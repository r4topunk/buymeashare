/**
 * UI sound, synthesised with the Web Audio API (no files, no licences).
 *
 * Rules:
 * - No AudioContext at module load. It is created inside `unlock()`, which must run from a user gesture
 *   (pointerdown / keydown). Until then every call is a no-op.
 * - Muted means silent AND idle: nothing is scheduled.
 * - Every voice ramps to true zero before stop(), so nothing clicks.
 */

type Ctx = AudioContext;

const STORAGE_KEY = "bmas:sound";
const MAX_VOICES = 14;

let ctx: Ctx | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = readMuted();
const listeners = new Set<() => void>();
const voiceEnds: number[] = [];
let lastClink = -1;

function readMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "off";
  } catch {
    return false;
  }
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(next: boolean) {
  muted = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? "off" : "on");
  } catch {
    /* storage blocked: keep the in-memory value */
  }
  if (next && ctx && ctx.state === "running") void ctx.suspend();
  if (!next && ctx && ctx.state === "suspended") void ctx.resume();
  listeners.forEach((l) => l());
}

export function subscribeMuted(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Call from a user-gesture handler. Creates (once) and resumes the context. */
export function unlock() {
  if (typeof window === "undefined" || muted) return;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      ctx = new Ctor({ latencyHint: "interactive" });
    } catch {
      return;
    }
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 5;
    comp.attack.value = 0.002;
    comp.release.value = 0.18;
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(comp).connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === "suspended") void ctx.resume();
}

/** Returns a running context + start time, or null (muted / not unlocked / voice cap reached). */
function begin(exempt = false): { c: Ctx; out: GainNode; t: number } | null {
  if (muted || !ctx || !master || ctx.state !== "running") return null;
  const t = ctx.currentTime;
  while (voiceEnds.length && voiceEnds[0] < t) voiceEnds.shift();
  if (!exempt && voiceEnds.length >= MAX_VOICES) return null;
  return { c: ctx, out: master, t: t + 0.004 };
}

function track(end: number) {
  voiceEnds.push(end);
  voiceEnds.sort((a, b) => a - b);
}

/** Percussive envelope that always lands on true zero. */
function env(g: GainNode, t0: number, peak: number, attack: number, decay: number): number {
  const end = t0 + attack + decay;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(Math.max(peak * 0.0008, 1e-5), end);
  g.gain.linearRampToValueAtTime(0, end + 0.008);
  return end + 0.012;
}

function tone(
  c: Ctx,
  out: AudioNode,
  t0: number,
  o: { freq: number; to?: number; glide?: number; type?: OscillatorType; peak: number; attack?: number; decay: number },
): number {
  const osc = c.createOscillator();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.freq, t0);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + (o.glide ?? o.decay));
  const g = c.createGain();
  const end = env(g, t0, o.peak, o.attack ?? 0.002, o.decay);
  osc.connect(g).connect(out);
  osc.start(t0);
  osc.stop(end);
  return end;
}

function noise(
  c: Ctx,
  out: AudioNode,
  t0: number,
  o: { type: BiquadFilterType; freq: number; to?: number; q?: number; peak: number; attack?: number; decay: number },
): number {
  if (!noiseBuf) return t0;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = o.type;
  f.frequency.setValueAtTime(o.freq, t0);
  if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t0 + o.decay);
  f.Q.value = o.q ?? 0.8;
  const g = c.createGain();
  const end = env(g, t0, o.peak, o.attack ?? 0.001, o.decay);
  src.connect(f).connect(g).connect(out);
  src.start(t0, Math.random() * 0.3);
  src.stop(end);
  return end;
}

/** Struck metal: inharmonic partials (bar/plate ratios), high ones die first, plus a contact burst. */
function metal(c: Ctx, out: AudioNode, t0: number, f0: number, peak: number, length = 1): number {
  const ratios = [1, 2.76, 5.4, 8.93];
  const decays = [0.42, 0.22, 0.11, 0.06];
  const amps = [1, 0.55, 0.28, 0.14];
  let end = t0;
  ratios.forEach((r, i) => {
    const f = f0 * r;
    if (f > 16000) return;
    end = Math.max(end, tone(c, out, t0, { freq: f * (1 + (Math.random() - 0.5) * 0.006), peak: peak * amps[i], attack: 0.0012, decay: decays[i] * length }));
  });
  noise(c, out, t0, { type: "highpass", freq: 5200, peak: peak * 0.5, decay: 0.012 });
  return end;
}

// ---------------------------------------------------------------------------------------------------------------------
// Public voices

/** Soft detent tick for steppers and selectors. `pitch` 0..1 walks it up a little. */
export function tick(pitch = 0.5) {
  const b = begin(true);
  if (!b) return;
  const f = 1500 + pitch * 900;
  const end = Math.max(
    tone(b.c, b.out, b.t, { freq: f, to: f * 0.82, type: "triangle", peak: 0.4, attack: 0.001, decay: 0.03 }),
    noise(b.c, b.out, b.t, { type: "bandpass", freq: 3200, q: 1.4, peak: 0.3, decay: 0.01 }),
  );
  track(end);
}

/** Wooden "tok" when picking a token. */
export function select(index = 0) {
  const b = begin(true);
  if (!b) return;
  const base = [392, 494, 587][index % 3] ?? 440;
  const end = Math.max(
    tone(b.c, b.out, b.t, { freq: base * 2, to: base * 1.4, glide: 0.05, peak: 0.42, attack: 0.001, decay: 0.09 }),
    tone(b.c, b.out, b.t, { freq: base * 4.1, peak: 0.05, attack: 0.001, decay: 0.03 }),
    noise(b.c, b.out, b.t, { type: "bandpass", freq: 1800, q: 2, peak: 0.1, decay: 0.012 }),
  );
  track(end);
}

/** Key press: short low thump. */
export function press() {
  const b = begin(true);
  if (!b) return;
  const end = Math.max(
    tone(b.c, b.out, b.t, { freq: 180, to: 70, glide: 0.08, peak: 0.6, attack: 0.002, decay: 0.12 }),
    noise(b.c, b.out, b.t, { type: "lowpass", freq: 1400, peak: 0.16, decay: 0.03 }),
  );
  track(end);
}

/** Key release: a small upward snap. */
export function release() {
  const b = begin(true);
  if (!b) return;
  track(tone(b.c, b.out, b.t, { freq: 620, to: 980, glide: 0.04, type: "triangle", peak: 0.26, attack: 0.001, decay: 0.05 }));
}

/** Coin launch: an airy whoosh that rises. */
export function whoosh() {
  const b = begin();
  if (!b) return;
  track(noise(b.c, b.out, b.t, { type: "bandpass", freq: 500, to: 3400, q: 1.1, peak: 0.2, attack: 0.09, decay: 0.34 }));
}

/**
 * A coin hitting glass or other coins. `intensity` 0..1 from impact speed; `size` 0..1 (bigger coin = lower).
 * Rate-limited so a pile settling doesn't turn into noise.
 */
export function clink(intensity: number, size = 0.5) {
  const b = begin();
  if (!b) return;
  if (b.t - lastClink < 0.028) return;
  lastClink = b.t;
  const i = Math.min(1, Math.max(0.05, intensity));
  const f0 = 2350 - size * 700 + (Math.random() - 0.5) * 160;
  track(metal(b.c, b.out, b.t, f0, 0.1 + i * 0.36, 0.5 + i * 0.7));
}

/** Confirmed tip: a small bell arpeggio (major pentatonic, rising). */
export function chime() {
  const b = begin(true);
  if (!b) return;
  const notes = [1318.5, 1661.2, 1975.5, 2637];
  let end = b.t;
  notes.forEach((f, i) => {
    const t = b.t + i * 0.075;
    end = Math.max(
      end,
      tone(b.c, b.out, t, { freq: f, peak: 0.16 - i * 0.02, attack: 0.003, decay: 1.1 - i * 0.12 }),
      tone(b.c, b.out, t, { freq: f * 2.01, peak: 0.035, attack: 0.002, decay: 0.35 }),
    );
  });
  track(end);
}

/** Heavy "ka-chunk" for a lock: body thud, then a metallic latch. */
export function clunk() {
  const b = begin(true);
  if (!b) return;
  const t = b.t;
  const end = Math.max(
    tone(b.c, b.out, t, { freq: 120, to: 48, glide: 0.14, peak: 0.6, attack: 0.002, decay: 0.22 }),
    noise(b.c, b.out, t, { type: "lowpass", freq: 900, to: 200, peak: 0.34, decay: 0.08 }),
    metal(b.c, b.out, t + 0.055, 820, 0.12, 0.45),
    noise(b.c, b.out, t + 0.055, { type: "bandpass", freq: 2600, q: 3, peak: 0.12, decay: 0.02 }),
  );
  track(end);
}

/** Unseal (claim): latch opens, then a rising shimmer. */
export function unseal() {
  const b = begin(true);
  if (!b) return;
  const t = b.t;
  const end = Math.max(
    metal(b.c, b.out, t, 900, 0.1, 0.4),
    noise(b.c, b.out, t + 0.05, { type: "bandpass", freq: 900, to: 5200, q: 1.3, peak: 0.12, attack: 0.08, decay: 0.4 }),
    tone(b.c, b.out, t + 0.12, { freq: 988, peak: 0.1, attack: 0.004, decay: 0.8 }),
    tone(b.c, b.out, t + 0.2, { freq: 1480, peak: 0.08, attack: 0.004, decay: 0.9 }),
  );
  track(end);
}

/** Gentle error: two soft falling notes. */
export function error() {
  const b = begin(true);
  if (!b) return;
  const end = Math.max(
    tone(b.c, b.out, b.t, { freq: 466, type: "triangle", peak: 0.16, attack: 0.01, decay: 0.2 }),
    tone(b.c, b.out, b.t + 0.16, { freq: 349, type: "triangle", peak: 0.16, attack: 0.01, decay: 0.32 }),
  );
  track(end);
}

/** Toggle feedback for the mute button (plays only when turning sound on). */
export function toggleOn() {
  const b = begin(true);
  if (!b) return;
  track(Math.max(tone(b.c, b.out, b.t, { freq: 880, peak: 0.1, decay: 0.12 }), tone(b.c, b.out, b.t + 0.06, { freq: 1320, peak: 0.1, decay: 0.2 })));
}
