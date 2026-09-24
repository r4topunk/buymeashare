/* eslint-disable @next/next/no-img-element -- Satori (next/og) renders plain <img>; next/image does not apply here. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { z } from "zod";
import { holdingCoins } from "@/components/jar/coins";
import { PRODUCT_NAME } from "@/lib/brand";
import { METALS } from "@/lib/fx/metals";
import { formatTokenAmount, formatUsd, shortAddress } from "@/lib/format";
import { getJar } from "@/lib/jar/getJar";
import { jarHeadline, jarTotalUsd, type JarHeadline } from "@/lib/jar/summary";
import { getPrices } from "@/lib/prices";
import { tipQuerySchema, walletSchema } from "@/lib/schemas";
import { DEFAULT_TOKEN_ID, T_TOKENS, tokenById } from "@/lib/tokens";
import { ART_VB, CoinDisc, Glyph, JAR_BACK, JAR_FRONT, coinsLayer, dropTrail, pourCoins, rand } from "./art";

export const dynamic = "force-dynamic";

const querySchema = z.object({ wallet: walletSchema, size: z.enum(["card", "square"]).catch("card") });

const TIMEOUT_MS = 5_000;
function withTimeout<T>(p: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([p.catch(() => fallback), new Promise<T>((r) => setTimeout(() => r(fallback), TIMEOUT_MS))]);
}

// Same faces as the app (layout.tsx): Instrument Serif for display, Geist for UI. Bundled TTFs (Satori can't read
// woff2), read once per server instance. If a file is missing the card still renders with the default font.
type FontSpec = { name: string; file: string; weight: 400 | 500 | 600; style: "normal" | "italic" };
const FONT_FILES: FontSpec[] = [
  { name: "Instrument Serif", file: "InstrumentSerif-Regular.ttf", weight: 400, style: "normal" },
  { name: "Instrument Serif", file: "InstrumentSerif-Italic.ttf", weight: 400, style: "italic" },
  { name: "Geist", file: "Geist-Medium.ttf", weight: 500, style: "normal" },
  { name: "Geist", file: "Geist-SemiBold.ttf", weight: 600, style: "normal" },
  { name: "Geist Mono", file: "GeistMono-Medium.ttf", weight: 500, style: "normal" },
];
let fontsPromise: Promise<Array<Omit<FontSpec, "file"> & { data: Buffer }>> | null = null;
function loadFonts() {
  fontsPromise ??= Promise.all(
    FONT_FILES.map(async ({ file, ...f }) => ({ ...f, data: await readFile(join(process.cwd(), "assets/og", file)) })),
  ).catch(() => {
    fontsPromise = null;
    return [];
  });
  return fontsPromise;
}

const C = {
  bg: "#0f0c09",
  fg: "#f6f3ee",
  muted: "#b1a9a2",
  faint: "#8a827a",
  brand: "#fb9a3d",
  hairline: "rgba(255,255,255,0.1)",
};

/** Big numerals: whole dollars once the cents stop mattering. */
function bigUsd(v: number): string {
  return v >= 1000 ? `$${Math.round(v).toLocaleString("en-US")}` : formatUsd(v);
}

/** Chip amounts: two decimals are plenty next to a coin; tiny balances keep their significant digits. */
function chipAmount(v: number): string {
  return v >= 1 ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : formatTokenAmount(v);
}

function clip(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}

/**
 * Share card for /tip/<wallet> (1200x630). `?size=square` renders a 600x600 variant (Blink icon).
 * Dark room, glass jar with the creator's coins poured in (log scale, like the app), one more coin dropping in.
 * Copy rule: never "share/equity/stock" for the token. If data can't be read, the empty variant renders.
 */
export async function GET(req: Request) {
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const parsed = querySchema.safeParse(sp);
  if (!parsed.success) return new Response("invalid wallet", { status: 400 });
  const { wallet, size } = parsed.data;
  const q = tipQuerySchema.parse(sp);
  const who = clip(q.name ?? shortAddress(wallet), 22);
  const token = tokenById(q.token ?? DEFAULT_TOKEN_ID);

  const [jar, prices, fonts] = await Promise.all([withTimeout(getJar(wallet), null), withTimeout(getPrices(), null), loadFonts()]);
  const headline: JarHeadline = jar ? jarHeadline(jar, prices) : { kind: "empty" };
  const held = jar ? T_TOKENS.map((t) => ({ t, amount: jar.holdings.find((h) => h.token === t.id)?.amount ?? 0 })).filter((r) => r.amount > 0) : [];
  const total = jar && held.length ? jarTotalUsd(jar, prices) : null;
  const empty = headline.kind === "empty" && !held.length;
  const coins = jar ? holdingCoins(jar.holdings, prices) : [];

  const square = size === "square";
  const W = square ? 600 : 1200;
  const H = square ? 600 : 630;

  // Jar art placement (viewBox units -> px).
  const S = square ? 0.78 : 1.4;
  const artW = ART_VB.w * S;
  const artH = ART_VB.h * S;
  const artLeft = square ? W - artW + 34 : 640;
  const artTop = square ? H - artH + 6 : -14;
  const px = (x: number) => artLeft + (x - ART_VB.x) * S;
  const py = (y: number) => artTop + (y - ART_VB.y) * S;
  const pile = pourCoins(coins);
  const drop = { id: "drop", token: token.id, x: 158, y: -34, r: 19 };

  const tokenMetal = METALS[token.id];
  const metalText = {
    backgroundImage: `linear-gradient(180deg, ${tokenMetal.hi} 0%, ${tokenMetal.mid} 55%, ${tokenMetal.lo} 120%)`,
    backgroundClip: "text" as const,
    color: "transparent",
  };

  const headText = `Tip ${who} in ${token.symbol}`;
  const heroSize = square
    ? headText.length <= 18 ? 64 : headText.length <= 26 ? 54 : 44
    : empty
      ? headText.length <= 18 ? 108 : headText.length <= 26 ? 92 : headText.length <= 34 ? 76 : 66
      : headText.length <= 20 ? 64 : headText.length <= 28 ? 56 : 48;

  const bigNumber = total != null ? bigUsd(total) : headline.kind !== "empty" ? `${formatTokenAmount(headline.amount)} ${headline.token.symbol}` : null;
  const numberSize = square ? (total == null ? 56 : 80) : total == null ? 92 : bigNumber && bigNumber.length > 9 ? 124 : 150;

  const subline =
    headline.kind === "received"
      ? `${who} has received ${formatTokenAmount(headline.amount)} ${headline.token.symbol} in tips`
      : headline.kind === "holds" && total == null
        ? `${who} holds ${formatTokenAmount(headline.amount)} ${headline.token.symbol}`
        : null;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: C.bg, color: C.fg, fontFamily: "Geist" }}>
        {/* Room: warm lamp behind the jar, a faint second light top-left, table falloff at the bottom. */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: W,
            height: H,
            backgroundImage: [
              `radial-gradient(circle at ${square ? "70% 72%" : "76% 58%"}, rgba(222,144,70,0.30) 0%, rgba(174,111,66,0.10) 32%, rgba(15,12,9,0) 58%)`,
              "radial-gradient(circle at 0% 0%, rgba(255,226,163,0.07) 0%, rgba(15,12,9,0) 45%)",
              "linear-gradient(180deg, rgba(0,0,0,0) 70%, rgba(0,0,0,0.35) 100%)",
            ].join(", "),
          }}
        />

        {/* Jar: back glass, coins, falling coin, front glass. */}
        <img src={JAR_BACK} width={artW} height={artH} style={{ position: "absolute", left: artLeft, top: artTop }} alt="" />
        <img src={dropTrail(drop.x, drop.y, drop.r)} width={artW} height={artH} style={{ position: "absolute", left: artLeft, top: artTop }} alt="" />
        <img src={coinsLayer([...pile, drop])} width={artW} height={artH} style={{ position: "absolute", left: artLeft, top: artTop }} alt="" />
        {pile.map((c) => (
          <Glyph key={c.id} token={c.token} x={px(c.x)} y={py(c.y)} d={c.r * 2 * S} angle={Math.round((rand(c.id, 31) - 0.5) * 70)} />
        ))}
        <Glyph token={drop.token} x={px(drop.x)} y={py(drop.y)} d={drop.r * 2 * S} angle={-14} />
        <img src={JAR_FRONT} width={artW} height={artH} style={{ position: "absolute", left: artLeft, top: artTop }} alt="" />

        {/* Copy column. */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: square ? W : 740,
            height: H,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: square ? "40px 40px 36px" : "56px 0 50px 72px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: square ? 20 : 24, fontWeight: 600, letterSpacing: -0.3 }}>
            <div style={{ display: "flex", width: square ? 22 : 26, height: square ? 22 : 26, borderRadius: 99, backgroundImage: `radial-gradient(circle at 32% 28%, #ffe2a3 0%, ${C.brand} 45%, #903f1c 100%)`, boxShadow: "inset 0 0 0 1.5px #903f1c, 0 0 18px rgba(251,154,61,0.45)" }} />
            <span>{PRODUCT_NAME}</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", width: square ? 300 : 668 }}>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                fontFamily: "Instrument Serif",
                fontSize: heroSize,
                lineHeight: 1.02,
                letterSpacing: -heroSize * 0.015,
                color: C.fg,
              }}
            >
              {/* One flex item per word, so the line wraps like text (Satori has no inline layout). */}
              {[...`Tip ${who}`.split(/\s+/).map((w) => ({ w, style: {} })), { w: "in", style: { fontStyle: "italic" as const, color: C.muted } }].map(
                ({ w, style }, i) => (
                  <span key={i} style={{ marginRight: heroSize * 0.22, ...style }}>
                    {w}
                  </span>
                ),
              )}
              <span style={{ fontStyle: "italic", ...metalText }}>{token.symbol}</span>
            </div>

            {empty ? (
              <div style={{ display: "flex", flexDirection: "column", gap: square ? 18 : 30, marginTop: square ? 14 : 22 }}>
                <div style={{ display: "flex", fontSize: square ? 17 : 30, fontWeight: 500, color: C.muted, letterSpacing: -0.3 }}>
                  {`${token.company} pre-IPO exposure, from $1.`}
                </div>
                <div style={{ display: "flex" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      height: square ? 48 : 64,
                      padding: square ? "0 22px" : "0 30px",
                      borderRadius: square ? 14 : 18,
                      fontSize: square ? 18 : 24,
                      fontWeight: 600,
                      letterSpacing: -0.3,
                      color: "#2b1308",
                      backgroundImage: "linear-gradient(180deg, #ffb95b 0%, #fb9437 55%, #ed7429 100%)",
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6), inset 0 -2px 1px rgba(0,0,0,0.12), 0 6px 0 0 #903f1c, 0 7px 0 0 #4e1c0a, 0 18px 40px -10px rgba(251,154,61,0.5)",
                    }}
                  >
                    Drop the first coin
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", marginTop: square ? 10 : 18 }}>
                {bigNumber ? (
                  <div style={{ display: "flex", flexDirection: square ? "column" : "row", alignItems: square ? "flex-start" : "flex-end", gap: square ? 4 : 18 }}>
                    <span style={{ fontFamily: "Instrument Serif", fontSize: numberSize, lineHeight: 1, letterSpacing: -numberSize * 0.02, color: C.fg }}>
                      {bigNumber}
                    </span>
                    {total != null ? (
                      <span style={{ fontFamily: "Instrument Serif", fontStyle: "italic", fontSize: square ? 30 : 44, lineHeight: 1, paddingBottom: square ? 0 : numberSize * 0.14, color: C.muted }}>
                        in the jar
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {subline ? (
                  <div style={{ display: "flex", marginTop: square ? 8 : 14, fontSize: square ? 17 : 24, fontWeight: 500, color: C.muted, letterSpacing: -0.2 }}>
                    {subline}
                  </div>
                ) : held.length && !square ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: square ? "8px 16px" : "10px 22px", marginTop: square ? 10 : 16 }}>
                    {held.map(({ t, amount }) => (
                      <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: square ? 17 : 23, fontWeight: 500, color: C.muted }}>
                        <CoinDisc token={t.id} size={square ? 20 : 26} />
                        <span style={{ color: C.fg }}>{chipAmount(amount)}</span>
                        <span>{t.symbol}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: square ? 15 : 20, color: C.faint }}>
              <span style={{ fontFamily: "Geist Mono", color: C.muted, padding: "5px 12px", borderRadius: 99, border: `1px solid ${C.hairline}`, background: "rgba(255,255,255,0.04)" }}>
                {shortAddress(wallet)}
              </span>
              {q.name ? <span>name unverified</span> : null}
            </div>
            <div style={{ display: "flex", fontSize: square ? 15 : 20, fontWeight: 500, color: C.faint }}>Tessera pre-IPO T-Tokens · not equity</div>
          </div>
        </div>
      </div>
    ),
    {
      width: W,
      height: H,
      fonts,
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    },
  );
}
