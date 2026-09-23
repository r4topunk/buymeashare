import { ImageResponse } from "next/og";
import { z } from "zod";
import { PRODUCT_NAME } from "@/lib/brand";
import { formatTokenAmount, formatUsd, shortAddress } from "@/lib/format";
import { getJar } from "@/lib/jar/getJar";
import { jarHeadline, type JarHeadline } from "@/lib/jar/summary";
import { getPrices } from "@/lib/prices";
import { tipQuerySchema, walletSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

const querySchema = z.object({ wallet: walletSchema, size: z.enum(["card", "square"]).catch("card") });

const TIMEOUT_MS = 5_000;
function withTimeout<T>(p: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([p.catch(() => fallback), new Promise<T>((r) => setTimeout(() => r(fallback), TIMEOUT_MS))]);
}

/**
 * Share card for /tip/<wallet>. `?size=square` renders a 600x600 variant (Blink icon).
 * Copy rule: never "share/equity/stock" for the token.
 */
export async function GET(req: Request) {
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const parsed = querySchema.safeParse(sp);
  if (!parsed.success) return new Response("invalid wallet", { status: 400 });
  const { wallet, size } = parsed.data;
  const name = tipQuerySchema.parse(sp).name;
  const who = name ?? shortAddress(wallet);

  const [jar, prices] = await Promise.all([withTimeout(getJar(wallet), null), withTimeout(getPrices(), null)]);
  const headline: JarHeadline = jar ? jarHeadline(jar, prices) : { kind: "empty" };

  const line =
    headline.kind === "empty" ? `Tip ${who} in T-OpenAI` : headline.kind === "received" ? `${who} has received` : `${who} holds`;
  const amountLine =
    headline.kind === "empty"
      ? "OpenAI pre-IPO exposure, from $1"
      : `${formatTokenAmount(headline.amount)} ${headline.token.symbol}${headline.usd != null ? ` (~${formatUsd(headline.usd)})` : ""}`;
  const square = size === "square";
  const W = square ? 600 : 1200;
  const H = square ? 600 : 630;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: square ? 44 : 72,
          background: "linear-gradient(135deg, #fdf8f1 0%, #f7ead9 100%)",
          color: "#1c1a17",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: square ? 26 : 32, fontWeight: 600 }}>
          <div style={{ width: 18, height: 18, borderRadius: 9, background: "#d9622b" }} />
          {PRODUCT_NAME}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: square ? 40 : 60, fontWeight: 600, letterSpacing: -1.5, lineHeight: 1.05 }}>
            {line}
          </div>
          <div style={{ fontSize: square ? 44 : 64, fontWeight: 700, letterSpacing: -2, color: "#b84a17", lineHeight: 1.05 }}>{amountLine}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: square ? 18 : 24, color: "#6b645b" }}>
          <span>Tessera pre-IPO T-Tokens · not equity</span>
          <span>{shortAddress(wallet)}</span>
        </div>
      </div>
    ),
    {
      width: W,
      height: H,
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    },
  );
}
