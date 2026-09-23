import type { PriceSnapshot } from "@/lib/prices/types";
import { T_TOKENS, tokenById, type TToken } from "@/lib/tokens";
import type { Jar } from "./types";

export type JarHeadline =
  | { kind: "received"; token: TToken; amount: number; usd: number | null }
  | { kind: "holds"; token: TToken; amount: number; usd: number | null }
  | { kind: "empty" };

/** Picks the most valuable token for the one-line headline (OG image, jar header). Prefers tagged tips over balances. */
export function jarHeadline(jar: Jar, prices: PriceSnapshot | null): JarHeadline {
  const price = (id: TToken["id"]) => prices?.tokens[id]?.usd ?? null;
  const best = (entries: Array<[TToken["id"], number]>) =>
    entries
      .filter(([, amount]) => amount > 0)
      .map(([id, amount]) => ({ token: tokenById(id), amount, usd: price(id) == null ? null : amount * price(id)! }))
      .sort((a, b) => (b.usd ?? b.amount) - (a.usd ?? a.amount))[0];

  const received = best(T_TOKENS.map((t) => [t.id, jar.received[t.id] ?? 0]));
  if (received) return { kind: "received", ...received };
  const holds = best(jar.holdings.map((h) => [h.token, h.amount]));
  if (holds) return { kind: "holds", ...holds };
  return { kind: "empty" };
}

export function jarTotalUsd(jar: Jar, prices: PriceSnapshot | null): number | null {
  if (!prices) return null;
  let total = 0;
  for (const h of jar.holdings) {
    const p = prices.tokens[h.token]?.usd;
    if (p == null) return null;
    total += h.amount * p;
  }
  return total;
}
