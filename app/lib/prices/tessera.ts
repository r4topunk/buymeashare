import { z } from "zod";
import { serverEnv } from "@/lib/env";

/**
 * GET https://rest-api.tessera.pe/v1/public/token-details
 * Observed shape (2026-09-23): array of
 * { id, name, symbol, code, sector, mint, markPrice, holders, markValuation }.
 * Only `mint` and `markPrice` are load-bearing; everything else is optional so an additive API change never breaks us.
 */
export const tesseraTokenSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  symbol: z.string().optional(),
  code: z.string().optional(),
  sector: z.string().optional(),
  mint: z.string(),
  markPrice: z.number().positive().nullable().optional(),
  holders: z.number().nullable().optional(),
  markValuation: z.number().nullable().optional(),
});
export const tesseraTokenDetailsSchema = z.array(tesseraTokenSchema);
export type TesseraToken = z.infer<typeof tesseraTokenSchema>;

export async function fetchTesseraTokenDetails(): Promise<TesseraToken[]> {
  const res = await fetch(`${serverEnv().TESSERA_API_URL}/token-details`, {
    next: { revalidate: 30 },
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`Tessera token-details HTTP ${res.status}`);
  return tesseraTokenDetailsSchema.parse(await res.json());
}
