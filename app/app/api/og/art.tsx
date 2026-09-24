/* eslint-disable @next/next/no-img-element -- Satori (next/og) renders plain <img>; next/image does not apply here. */
import { rand, type CoinSpec } from "@/components/jar/vessel-engine";
import { BODY, CX, INNER, JAR_BODY_PATH, NECK, RIM, VB_H, VB_W } from "@/components/jar/vessel-geometry";
import { METALS } from "@/lib/fx/metals";
import type { TTokenId } from "@/lib/tokens";

/**
 * Share-card art (Satori). The same glass + metal as the app's Vessel, but static. Layers, back to front: back glass
 * (SVG), all coin bodies (one SVG, gradients only: CSS box-shadows cost ~40 ms per coin in Satori), monograms (text,
 * so they use a real font), front glass (SVG). Coins are placed by a deterministic "pour" (each coin rests in the
 * lowest notch of the pile) inside the shared jar geometry, so a jar looks the same on every render.
 */

/** Extra room around the jar's viewBox for the floor shadow and the coin dropping in. */
const PAD = { x: 40, top: 96, bottom: 28 };
export const ART_VB = { x: -PAD.x, y: -PAD.top, w: VB_W + PAD.x * 2, h: VB_H + PAD.top + PAD.bottom };

type Placed = { id: string; token: TTokenId; x: number; y: number; r: number };

function floorY(x: number, r: number): number {
  const left = CX - INNER.bodyHalf + INNER.corner;
  const right = CX + INNER.bodyHalf - INNER.corner;
  const cy = INNER.bottom - INNER.corner;
  const rr = INNER.corner - r;
  const dx = x < left ? left - x : x > right ? x - right : 0;
  return dx > 0 ? cy + Math.sqrt(Math.max(0, rr * rr - dx * dx)) : INNER.bottom - r;
}

/** Deterministic pile: every coin settles in a local minimum of the pile surface, nudged toward a random x. */
export function pourCoins(coins: CoinSpec[]): Placed[] {
  const placed: Placed[] = [];
  const minX = CX - INNER.bodyHalf;
  const maxX = CX + INNER.bodyHalf;
  for (const c of coins) {
    const r = c.r;
    const xs: number[] = [];
    const ys: number[] = [];
    for (let x = minX + r; x <= maxX - r; x += 1.5) {
      let y = floorY(x, r);
      for (const p of placed) {
        const dx = x - p.x;
        const d = r + p.r - 0.6;
        if (Math.abs(dx) < d) y = Math.min(y, p.y - Math.sqrt(d * d - dx * dx));
      }
      xs.push(x);
      ys.push(y);
    }
    // A handful of coins huddles near the middle; a full jar spreads across the whole floor.
    const spread = Math.min(1, coins.length / 12);
    const target = CX + (rand(c.id, 21) - 0.5) * (maxX - minX - 2 * r) * spread;
    let best = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < xs.length; i++) {
      const rest = (i === 0 || ys[i] >= ys[i - 1]) && (i === xs.length - 1 || ys[i] >= ys[i + 1]);
      if (!rest) continue;
      const score = ys[i] - Math.abs(xs[i] - target) * 0.05;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best < 0 || ys[best] - r < BODY.top + 6) break; // full to the shoulder
    placed.push({ id: c.id, token: c.token, x: xs[best], y: ys[best], r });
  }
  return placed;
}

const svgUri = (body: string) =>
  `data:image/svg+xml;base64,${Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${ART_VB.x} ${ART_VB.y} ${ART_VB.w} ${ART_VB.h}">${body}</svg>`,
  ).toString("base64")}`;

/** Back glass, table shadow and warm bounce light (drawn under the coins). */
export const JAR_BACK = svgUri(`
<defs>
  <linearGradient id="glass" x1="0" x2="1" y1="0" y2="0">
    <stop offset="0" stop-color="#cfebe9" stop-opacity="0.2"/>
    <stop offset="0.18" stop-color="#e4f3f1" stop-opacity="0.05"/>
    <stop offset="0.82" stop-color="#e4f3f1" stop-opacity="0.04"/>
    <stop offset="1" stop-color="#cfebe9" stop-opacity="0.16"/>
  </linearGradient>
  <radialGradient id="floor" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="#000" stop-opacity="0.7"/>
    <stop offset="1" stop-color="#000" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="bounce" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="#fb9a3d" stop-opacity="0.34"/>
    <stop offset="1" stop-color="#fb9a3d" stop-opacity="0"/>
  </radialGradient>
</defs>
<ellipse cx="${CX}" cy="${BODY.bottom + 7}" rx="${BODY.half + 34}" ry="18" fill="url(#floor)"/>
<ellipse cx="${CX}" cy="${BODY.bottom + 4}" rx="${BODY.half - 6}" ry="10" fill="url(#bounce)"/>
<path d="${JAR_BODY_PATH} Z" fill="url(#glass)"/>
<path d="M ${CX - BODY.half + 16} ${BODY.bottom - 10} Q ${CX} ${BODY.bottom - 2} ${CX + BODY.half - 16} ${BODY.bottom - 10}" stroke="#fff" stroke-opacity="0.07" stroke-width="10" fill="none" stroke-linecap="round"/>
`);

/** Front glass: outline, cylinder reflections, rim (drawn over the coins). */
export const JAR_FRONT = svgUri(`
<defs>
  <linearGradient id="streak" x1="0" x2="0" y1="0" y2="1">
    <stop offset="0" stop-color="#fff" stop-opacity="0.36"/>
    <stop offset="0.55" stop-color="#fff" stop-opacity="0.13"/>
    <stop offset="1" stop-color="#fff" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="rim" x1="0" x2="0" y1="0" y2="1">
    <stop offset="0" stop-color="#fff" stop-opacity="0.22"/>
    <stop offset="1" stop-color="#fff" stop-opacity="0.04"/>
  </linearGradient>
  <linearGradient id="edge" x1="0" x2="1" y1="0" y2="0">
    <stop offset="0" stop-color="#fff" stop-opacity="0.55"/>
    <stop offset="0.5" stop-color="#fff" stop-opacity="0.16"/>
    <stop offset="1" stop-color="#fff" stop-opacity="0.45"/>
  </linearGradient>
</defs>
<path d="${JAR_BODY_PATH}" fill="none" stroke="url(#edge)" stroke-width="1.8"/>
<path d="${JAR_BODY_PATH}" fill="none" stroke="#fff" stroke-opacity="0.05" stroke-width="7"/>
<rect x="${CX - BODY.half + 14}" y="${BODY.top + 8}" width="13" height="150" rx="6.5" fill="url(#streak)"/>
<rect x="${CX - BODY.half + 33}" y="${BODY.top + 18}" width="4" height="96" rx="2" fill="url(#streak)" opacity="0.7"/>
<rect x="${CX + BODY.half - 17}" y="${BODY.top + 20}" width="5" height="120" rx="2.5" fill="url(#streak)" opacity="0.45"/>
<path d="M ${CX - NECK.half - 4} ${NECK.bottom + 18} Q ${CX - BODY.half + 20} ${NECK.bottom + 30} ${CX - BODY.half + 12} ${BODY.top - 4}" stroke="#fff" stroke-opacity="0.32" stroke-width="3" fill="none" stroke-linecap="round"/>
<path d="M ${CX - BODY.half + 22} ${BODY.bottom - 5} Q ${CX} ${BODY.bottom + 1} ${CX + BODY.half - 22} ${BODY.bottom - 5}" stroke="#fff" stroke-opacity="0.24" stroke-width="2" fill="none" stroke-linecap="round"/>
<rect x="${CX - RIM.half}" y="${RIM.top}" width="${RIM.half * 2}" height="${RIM.bottom - RIM.top}" rx="7" fill="url(#rim)" stroke="#fff" stroke-opacity="0.42" stroke-width="1.2"/>
<path d="M ${CX - RIM.half + 8} ${RIM.top + 4} L ${CX + RIM.half - 8} ${RIM.top + 4}" stroke="#fff" stroke-opacity="0.58" stroke-width="1.4" stroke-linecap="round"/>
`);

/** Motion trail above the coin dropping into the mouth. */
export function dropTrail(x: number, y: number, r: number) {
  const lines = [-0.45, 0, 0.45]
    .map(
      (k, i) =>
        `<line x1="${x + k * r}" y1="${y - r - 8 - i * 3}" x2="${x + k * r}" y2="${y - r - 38 + i * 6}" stroke="url(#trail)" stroke-width="${i === 1 ? 2.2 : 1.4}" stroke-linecap="round"/>`,
    )
    .join("");
  return svgUri(`
<defs>
  <linearGradient id="trail" x1="0" x2="0" y1="1" y2="0">
    <stop offset="0" stop-color="#ffe2a3" stop-opacity="0.55"/>
    <stop offset="1" stop-color="#ffe2a3" stop-opacity="0"/>
  </linearGradient>
  <radialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="#fb9a3d" stop-opacity="0.3"/>
    <stop offset="1" stop-color="#fb9a3d" stop-opacity="0"/>
  </radialGradient>
</defs>
<circle cx="${x}" cy="${y}" r="${r * 2.4}" fill="url(#halo)"/>
${lines}`);
}

type Disc = { token: TTokenId; x: number; y: number; r: number };

function coinDefs(): string {
  const bodies = (Object.keys(METALS) as TTokenId[])
    .map((t) => {
      const m = METALS[t];
      return `<radialGradient id="body-${t}" cx="0.32" cy="0.28" r="0.99"><stop offset="0" stop-color="${m.hi}"/><stop offset="0.42" stop-color="${m.mid}"/><stop offset="1" stop-color="${m.lo}"/></radialGradient>`;
    })
    .join("");
  return `<defs>${bodies}
<linearGradient id="bevel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.75"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.05"/><stop offset="1" stop-color="#000" stop-opacity="0.45"/></linearGradient>
<linearGradient id="field" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.28"/><stop offset="1" stop-color="#fff" stop-opacity="0.55"/></linearGradient>
<radialGradient id="glint" cx="0.29" cy="0.25" r="0.28"><stop offset="0" stop-color="#fff" stop-opacity="0.65"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<radialGradient id="shade" cx="0.5" cy="0.5" r="0.5"><stop offset="0.6" stop-color="#000" stop-opacity="0.55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
</defs>`;
}

/** Coin body in SVG (same layers as paintCoin() in the engine), without the monogram. */
function coinBody({ token, x, y, r }: Disc): string {
  const m = METALS[token];
  const lw = r * 0.11;
  const tick = r * 0.035;
  const reed = 2 * Math.PI * r * 0.835;
  return `<circle cx="${x}" cy="${y + r * 0.12}" r="${r * 1.12}" fill="url(#shade)"/>
<circle cx="${x}" cy="${y}" r="${r}" fill="url(#body-${token})"/>
<circle cx="${x}" cy="${y}" r="${r - 0.4}" fill="none" stroke="${m.edge}" stroke-opacity="0.5" stroke-width="0.8"/>
<circle cx="${x}" cy="${y}" r="${r - lw / 2}" fill="none" stroke="url(#bevel)" stroke-width="${lw}"/>
<circle cx="${x}" cy="${y}" r="${r * 0.835}" fill="none" stroke="#000" stroke-opacity="0.16" stroke-width="${r * 0.07}" stroke-dasharray="${tick} ${reed / 36 - tick}"/>
<circle cx="${x}" cy="${y}" r="${r * 0.74}" fill="none" stroke="url(#field)" stroke-width="${Math.max(0.6, r * 0.05)}"/>
<circle cx="${x}" cy="${y}" r="${r}" fill="url(#glint)"/>`;
}

/** All coin bodies of the pile (plus the falling one) as one SVG layer, in art viewBox units. */
export function coinsLayer(discs: Disc[]): string {
  return svgUri(`${coinDefs()}${discs.map(coinBody).join("")}`);
}

/** Single coin as an image (chips, brand mark). */
export function coinImage(token: TTokenId): string {
  return `data:image/svg+xml;base64,${Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-22 -22 44 44">${coinDefs()}${coinBody({ token, x: 0, y: 0, r: 20 })}</svg>`,
  ).toString("base64")}`;
}

/** Embossed monogram over a coin body: a light copy below-right, the ink on top (as the canvas coins do). */
export function Glyph({ token, x, y, d, angle = 0 }: { token: TTokenId; x: number; y: number; d: number; angle?: number }) {
  const m = METALS[token];
  const fs = d * 0.5;
  const letter = (color: string, dx: number, dy: number) => (
    <div
      style={{
        position: "absolute",
        left: x - d / 2 + dx,
        top: y - d / 2 + dy,
        width: d,
        height: d,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Geist",
        fontWeight: 600,
        fontSize: fs,
        lineHeight: 1,
        color,
        transform: `rotate(${angle}deg)`,
      }}
    >
      {m.glyph}
    </div>
  );
  return (
    <>
      {letter("rgba(255,255,255,0.5)", d * 0.02, d * 0.045)}
      {letter(m.ink, 0, d * 0.02)}
    </>
  );
}

/** A coin with its monogram, for small inline uses (chips). */
export function CoinDisc({ token, size }: { token: TTokenId; size: number }) {
  const pad = size * (22 / 20 - 1);
  return (
    <div style={{ display: "flex", position: "relative", width: size, height: size }}>
      <img src={coinImage(token)} width={size + pad * 2} height={size + pad * 2} style={{ position: "absolute", left: -pad, top: -pad }} alt="" />
      <Glyph token={token} x={size / 2} y={size / 2} d={size} />
    </div>
  );
}

/** Seeds for coins by token (for a decorative handful when there are no holdings to size by). */
export function seedCoins(tokens: TTokenId[], prefix: string): CoinSpec[] {
  return tokens.map((token, i) => {
    const id = `${prefix}-${i}`;
    return { id, token, r: 15 + Math.floor(rand(id, 7) * 5) };
  });
}

export { rand };
