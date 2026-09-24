import { ArrowUpRightIcon } from "lucide-react";
import { Coin } from "@/components/fx/coin";
import { explorerTx, formatDateTime, formatTokenAmount, formatUsd, shortAddress } from "@/lib/format";
import type { Jar } from "@/lib/jar/types";
import type { PriceSnapshot } from "@/lib/prices/types";
import { tokenById } from "@/lib/tokens";
import { TIP_MEMO } from "@/lib/tip/memo";

export function TipHistory({ jar, prices }: { jar: Jar; prices: PriceSnapshot | null }) {
  if (jar.tips.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 px-4 py-7 text-center text-sm text-muted-foreground text-pretty">
        No tips yet. Tips are transactions tagged <code className="font-mono text-xs">{TIP_MEMO}</code> that reach this wallet&apos;s T-Token accounts.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <ul className="surface divide-y divide-white/[0.06] rounded-2xl">
        {jar.tips.map((t) => {
          const token = tokenById(t.token);
          const price = prices?.tokens[t.token]?.usd;
          return (
            <li key={t.signature} className="flex items-center gap-3 px-4 py-3 text-sm">
              <Coin token={t.token} size={28} />
              <div className="min-w-0 flex-1">
                <div>
                  <span className="font-medium tabular-nums">{formatTokenAmount(t.amount)}</span> {token.symbol}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {t.memoTags.kind === "claim" ? "claimed locked tip" : <>from <span className="font-mono">{shortAddress(t.from)}</span></>}
                  {t.blockTime ? ` · ${formatDateTime(t.blockTime)}` : ""}
                </div>
              </div>
              <div className="flex flex-col items-end gap-0.5">
                <div className="text-xs tabular-nums text-muted-foreground">{price != null ? formatUsd(t.amount * price) : ""}</div>
                <a
                  href={explorerTx(t.signature)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  tx <ArrowUpRightIcon className="size-3" />
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
