import { Holdings } from "@/components/jar/holdings";
import { TipHistory } from "@/components/jar/tip-history";
import { Skeleton } from "@/components/ui/skeleton";
import { formatUsd } from "@/lib/format";
import { getJar } from "@/lib/jar/getJar";
import { jarTotalUsd } from "@/lib/jar/summary";
import { getPrices } from "@/lib/prices";

/** Server component: reads the jar from mainnet. Wrap in <Suspense fallback={<JarSkeleton />}>. */
export async function JarSection({ wallet, title = "Jar" }: { wallet: string; title?: string }) {
  const [jar, prices] = await Promise.all([getJar(wallet), getPrices().catch(() => null)]);
  const total = jarTotalUsd(jar, prices);
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <span className="text-sm tabular-nums text-muted-foreground">{total != null ? `${formatUsd(total)} total` : ""}</span>
      </div>
      <Holdings jar={jar} prices={prices} />
      <h3 className="text-sm font-medium text-muted-foreground">Tip history</h3>
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
      <Skeleton className="h-6 w-24" />
      <Skeleton className="h-44 w-full rounded-xl" />
      <Skeleton className="h-20 w-full rounded-xl" />
    </div>
  );
}
