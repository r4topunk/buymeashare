import { formatTokenAmount, formatUsd } from "@/lib/format";
import type { Jar } from "@/lib/jar/types";
import type { PriceSnapshot } from "@/lib/prices/types";
import { T_TOKENS } from "@/lib/tokens";

/** Displayed price (PRICE_SOURCE) plus the other one, e.g. "$1,050 market · Tessera mark: $980". */
function priceLine(p: PriceSnapshot["tokens"][keyof PriceSnapshot["tokens"]] | undefined): string {
  if (!p || p.usd == null) return "no price";
  const main = `${formatUsd(p.usd)} ${p.source === "tessera" ? "Tessera mark" : "market"}`;
  if (p.source === "market" && p.tesseraMark != null) return `${main} · Tessera mark: ${formatUsd(p.tesseraMark)}`;
  if (p.source === "tessera" && p.dex != null) return `${main} · market: ${formatUsd(p.dex)}`;
  return main;
}

export function Holdings({ jar, prices }: { jar: Jar; prices: PriceSnapshot | null }) {
  return (
    <ul className="divide-y divide-border rounded-xl border bg-card">
      {T_TOKENS.map((t) => {
        const h = jar.holdings.find((x) => x.token === t.id);
        const amount = h?.amount ?? 0;
        const p = prices?.tokens[t.id];
        const value = p?.usd != null ? amount * p.usd : null;
        return (
          <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <div className="font-medium">{t.symbol}</div>
              <div className="text-xs text-muted-foreground">
                {t.company} pre-IPO exposure · {priceLine(p)}
              </div>
            </div>
            <div className="text-right tabular-nums">
              <div className={amount > 0 ? "font-medium" : "text-muted-foreground"}>{formatTokenAmount(amount)}</div>
              <div className="text-xs text-muted-foreground">{formatUsd(value)}</div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
