import type { Jar } from "@/lib/jar/types";
import type { PriceSnapshot } from "@/lib/prices/types";
import type { LockedTip } from "@/lib/tip/types";
import { T_TOKENS, type TTokenId } from "@/lib/tokens";
import { rand, type CoinSpec } from "./vessel-engine";

/** Max coins drawn for holdings, so there's always room left for new tips and sealed coins. */
const MAX_HOLDING_COINS = 30;

/**
 * Coins that represent a jar's holdings. Decorative, on a log scale (the real numbers are always printed next to
 * the jar): $3 -> 4 coins, $1k -> 18, $100k+ -> 30. Every token with a balance gets at least one coin.
 */
export function holdingCoins(holdings: Array<{ token: TTokenId; amount: number }>, prices: PriceSnapshot | null): CoinSpec[] {
  const rows = T_TOKENS.map((t) => {
    const amount = holdings.find((h) => h.token === t.id)?.amount ?? 0;
    const price = prices?.tokens[t.id]?.usd ?? null;
    return { token: t.id, amount, usd: price != null ? amount * price : null };
  }).filter((r) => r.amount > 0);
  if (!rows.length) return [];
  const total = rows.reduce((n, r) => n + (r.usd ?? 0), 0);
  const n = total > 0 ? Math.min(MAX_HOLDING_COINS, Math.max(rows.length, Math.round(6 * Math.log10(total + 1)))) : rows.length;
  // Largest remainder, with a floor of one coin per held token.
  const shares = rows.map((r) => (total > 0 && r.usd != null ? r.usd / total : 1 / rows.length));
  const counts = shares.map((s) => Math.max(1, Math.floor(s * n)));
  let left = n - counts.reduce((a, b) => a + b, 0);
  const order = shares.map((s, i) => [s * n - Math.floor(s * n), i] as const).sort((a, b) => b[0] - a[0]);
  for (let k = 0; left > 0 && k < order.length; k++, left--) counts[order[k][1]]++;
  const coins: CoinSpec[] = [];
  rows.forEach((r, i) => {
    for (let j = 0; j < counts[i]; j++) {
      const id = `${r.token}-${j}`;
      coins.push({ id, token: r.token, r: 14 + Math.floor(rand(id, 7) * 6) });
    }
  });
  // Interleave tokens so the pour mixes metals instead of layering them.
  return coins.sort((a, b) => rand(a.id, 11) - rand(b.id, 11));
}

/**
 * Coins for a jar: one coin per tagged tip (id `tip-<signature>`, the same id the flying coin uses, so a tip
 * confirmed this session is never drawn twice), plus log-scale coins for any balance that didn't come from tips.
 */
export function jarCoins(jar: Jar, prices: PriceSnapshot | null): CoinSpec[] {
  const tips = jar.tips.filter((t) => t.memoTags.kind !== "claim").slice(0, MAX_HOLDING_COINS);
  const tipCoins: CoinSpec[] = tips.map((t) => ({ id: `tip-${t.signature}`, token: t.token, r: TIP_COIN_R }));
  const fromTips = (token: TTokenId) => tips.filter((t) => t.token === token).reduce((n, t) => n + t.amount, 0);
  const residual = jar.holdings
    .map((h) => ({ token: h.token, amount: h.amount - fromTips(h.token) }))
    .filter((h) => {
      const price = prices?.tokens[h.token]?.usd;
      return h.amount > 0 && (price == null || h.amount * price >= 0.5);
    });
  const rest = holdingCoins(residual, prices).slice(0, Math.max(0, MAX_HOLDING_COINS - tipCoins.length));
  return [...tipCoins, ...rest].sort((a, b) => rand(a.id, 11) - rand(b.id, 11));
}

/** Sealed coins for locked tips that haven't been claimed. */
export function lockedCoins(locks: LockedTip[]): CoinSpec[] {
  return locks.filter((l) => l.status !== "claimed").map((l) => ({ id: `lock-${l.escrow}`, token: l.token, r: 18, locked: true }));
}

export const TIP_COIN_R = 18;
