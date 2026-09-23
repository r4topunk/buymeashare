import { z } from "zod";
import { serverEnv } from "@/lib/env";

/**
 * GET https://lite-api.jup.ag/price/v3?ids=<mint,mint>
 * Observed shape (2026-09-23): { [mint]: { usdPrice, liquidity, decimals, blockId, priceChange24h, createdAt, stockData? } }.
 * Mints without a price are simply absent.
 */
const jupiterPriceEntrySchema = z.object({
  usdPrice: z.number().positive(),
  liquidity: z.number().optional(),
  decimals: z.number().optional(),
  priceChange24h: z.number().nullable().optional(),
});
export const jupiterPriceResponseSchema = z.record(z.string(), jupiterPriceEntrySchema.nullable());

export async function fetchJupiterPrices(mints: string[]): Promise<Record<string, number>> {
  const url = `${serverEnv().JUPITER_API_URL}/price/v3?ids=${mints.join(",")}`;
  const res = await fetch(url, {
    next: { revalidate: 30 },
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`Jupiter price HTTP ${res.status}`);
  const parsed = jupiterPriceResponseSchema.parse(await res.json());
  const out: Record<string, number> = {};
  for (const [mint, entry] of Object.entries(parsed)) if (entry) out[mint] = entry.usdPrice;
  return out;
}
