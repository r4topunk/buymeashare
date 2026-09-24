import { Holdings } from "@/components/jar/holdings";
import { TipHistory } from "@/components/jar/tip-history";
import { Skeleton } from "@/components/ui/skeleton";
import { formatUsd } from "@/lib/format";
import { getJar } from "@/lib/jar/getJar";
import { jarTotalUsd } from "@/lib/jar/summary";
import { getPrices } from "@/lib/prices";

/** Server component: reads the jar from mainnet. Wrap in <Suspense fallback={<JarSkeleton />}>. */
export async function JarSection({ wallet, title = "Jar", showHoldings = true }: { wallet: string; title?: string; showHoldings?: boolean }) {
  const [jar, prices] = await Promise.all([getJar(wallet), getPrices().catch(() => null)]);
  const total = jarTotalUsd(jar, prices);
  return (
    <section className="flex flex-col gap-4">
      {showHoldings ? (
        <>
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold tracking-[-0.01em]">{title}</h2>
            <span className="text-sm tabular-nums text-muted-foreground">{total != null ? `${formatUsd(total)} total` : ""}</span>
          </div>
          <Holdings jar={jar} prices={prices} />
        </>
      ) : null}
      <div className="flex items-baseline justify-between">
        <h3 className={showHoldings ? "text-sm font-medium text-muted-foreground" : "text-lg font-semibold tracking-[-0.01em]"}>Tip history</h3>
        {!showHoldings && total != null ? <span className="text-sm tabular-nums text-muted-foreground">{formatUsd(total)} total</span> : null}
      </div>
      <TipHistory jar={jar} prices={prices} />
      {jar.errors.length > 0 ? (
        <p className="text-xs text-muted-foreground">Some on-chain data could not be read (RPC limits). Refresh to retry.</p>
      ) : null}
    </section>
  );
}

export function JarSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-6 w-24 bg-white/[0.06]" />
      <Skeleton className="h-44 w-full rounded-2xl bg-white/[0.04]" />
      <Skeleton className="h-20 w-full rounded-2xl bg-white/[0.04]" />
    </div>
  );
}
