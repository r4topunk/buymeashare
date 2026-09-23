import { PAY_ASSETS, T_TOKENS, type TTokenId } from "@/lib/tokens";
import { fetchJupiterPrices } from "./jupiter";
import { PRICE_SOURCE } from "./source";
import { fetchTesseraTokenDetails } from "./tessera";
import type { PriceSnapshot, TokenPrice } from "./types";

export type { PriceSnapshot, TokenPrice } from "./types";
export { PRICE_SOURCE, type PriceSource } from "./source";

/**
 * Server-side price snapshot. `usd` follows PRICE_SOURCE ("market" = Jupiter DEX, "tessera" = Tessera mark),
 * falling back to the other one; SOL/USD from Jupiter.
 * Both upstream fetches use Next's fetch cache with revalidate=30s.
 */
export async function getPrices(): Promise<PriceSnapshot> {
  const errors: string[] = [];
  const [tessera, jupiter] = await Promise.allSettled([
    fetchTesseraTokenDetails(),
    fetchJupiterPrices([PAY_ASSETS.SOL.mint, ...T_TOKENS.map((t) => t.mint)]),
  ]);
  if (tessera.status === "rejected") errors.push(`tessera: ${String(tessera.reason)}`);
  if (jupiter.status === "rejected") errors.push(`jupiter: ${String(jupiter.reason)}`);

  const marks = new Map<string, number>();
  if (tessera.status === "fulfilled") {
    for (const t of tessera.value) if (t.markPrice) marks.set(t.mint, t.markPrice);
  }
  const dex = jupiter.status === "fulfilled" ? jupiter.value : {};

  const tokens = {} as Record<TTokenId, TokenPrice>;
  for (const t of T_TOKENS) {
    const mark = marks.get(t.mint) ?? null;
    const dexPrice = dex[t.mint] ?? null;
    const [first, second] =
      PRICE_SOURCE === "market"
        ? ([[dexPrice, "market"], [mark, "tessera"]] as const)
        : ([[mark, "tessera"], [dexPrice, "market"]] as const);
    const pick = first[0] != null ? first : second[0] != null ? second : null;
    tokens[t.id] = {
      tesseraMark: mark,
      dex: dexPrice,
      usd: pick?.[0] ?? null,
      source: pick?.[1] ?? "none",
    };
  }
  return { tokens, solUsd: dex[PAY_ASSETS.SOL.mint] ?? null, fetchedAt: Date.now(), errors };
}
