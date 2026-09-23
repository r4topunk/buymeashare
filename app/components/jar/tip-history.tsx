import { explorerTx, formatDateTime, formatTokenAmount, formatUsd, shortAddress } from "@/lib/format";
import type { Jar } from "@/lib/jar/types";
import type { PriceSnapshot } from "@/lib/prices/types";
import { tokenById } from "@/lib/tokens";
import { TIP_MEMO } from "@/lib/tip/memo";

export function TipHistory({ jar, prices }: { jar: Jar; prices: PriceSnapshot | null }) {
  if (jar.tips.length === 0) {
    return (
      <div className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
        No tips yet. Tips are transactions tagged <code className="font-mono text-xs">{TIP_MEMO}</code> that reach this wallet&apos;s T-Token accounts.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <ul className="divide-y divide-border rounded-xl border bg-card">
        {jar.tips.map((t) => {
          const token = tokenById(t.token);
          const price = prices?.tokens[t.token]?.usd;
          return (
            <li key={t.signature} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div className="min-w-0">
                <div>
                  <span className="font-medium tabular-nums">{formatTokenAmount(t.amount)}</span> {token.symbol}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t.memoTags.kind === "claim" ? "claimed locked tip" : <>from <span className="font-mono">{shortAddress(t.from)}</span></>}
                  {t.blockTime ? ` · ${formatDateTime(t.blockTime)}` : ""}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs tabular-nums text-muted-foreground">{price != null ? formatUsd(t.amount * price) : ""}</div>
                <a href={explorerTx(t.signature)} target="_blank" rel="noreferrer" className="text-xs underline underline-offset-2">
                  tx
                </a>
              </div>
            </li>
          );
        })}
      </ul>
      {jar.truncated ? <p className="text-xs text-muted-foreground">Showing the latest {jar.tips.length} tips.</p> : null}
    </div>
  );
}
