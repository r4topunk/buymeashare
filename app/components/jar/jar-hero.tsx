"use client";

import { Suspense, use, useEffect, useMemo, useState } from "react";
import { CountUp } from "@/components/fx/rolling-number";
import { Coin } from "@/components/fx/coin";
import { formatTokenAmount, formatUsd } from "@/lib/format";
import type { Jar } from "@/lib/jar/types";
import type { PriceSnapshot } from "@/lib/prices/types";
import { T_TOKENS } from "@/lib/tokens";
import { cn } from "@/lib/utils";
import { holdingCoins } from "./coins";
import { Vessel } from "./vessel";

/**
 * The creator's jar as an object: glass, coins for what it holds, and the total counting up.
 * `jar` is a promise from the server component so the page (and the tip form) never waits on the RPC.
 */
export function JarHero({
  jar,
  prices,
  label,
  size = "md",
}: {
  jar: Promise<Jar | null>;
  prices: PriceSnapshot | null;
  label: string;
  size?: "md" | "lg";
}) {
  return (
    <div className={cn("relative mx-auto flex w-full flex-col items-center", size === "lg" ? "max-w-[340px] sm:max-w-[380px]" : "max-w-[230px] sm:max-w-[290px] lg:max-w-[420px]")}>
      <div aria-hidden className="pointer-events-none absolute top-[2%] left-1/2 aspect-square w-[150%] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,oklch(0.72_0.13_62/0.2),oklch(0.6_0.1_55/0.06)_60%,transparent)]" />
      <Suspense fallback={<EmptyJar label={label} loading />}>
        <LoadedJar jar={jar} prices={prices} label={label} />
      </Suspense>
    </div>
  );
}

function EmptyJar({ label, loading }: { label: string; loading?: boolean }) {
  return (
    <>
      <Vessel coins={NO_COINS} label={`${label}: loading`} />
      <div className="mt-4 flex flex-col items-center gap-1">
        <div className={cn("h-9 w-36 rounded-lg bg-white/[0.06]", loading && "animate-pulse")} />
        <div className="h-4 w-24 rounded bg-white/[0.04]" />
      </div>
    </>
  );
}

const NO_COINS: never[] = [];

function LoadedJar({ jar: jarPromise, prices, label }: { jar: Promise<Jar | null>; prices: PriceSnapshot | null; label: string }) {
  const jar = use(jarPromise);
  const coins = useMemo(() => (jar ? holdingCoins(jar.holdings, prices) : []), [jar, prices]);
  const base = useMemo(() => {
    if (!jar || !prices) return null;
    let t = 0;
    for (const h of jar.holdings) {
      const p = prices.tokens[h.token]?.usd;
      if (p == null) return null;
      t += h.amount * p;
    }
    return t;
  }, [jar, prices]);

  // Confirmed tips this session count up immediately; once the refreshed jar includes them, the real total wins.
  const [bonus, setBonus] = useState<{ base: number; usd: number } | null>(null);
  useEffect(() => {
    const on = (e: Event) => {
      const usd = (e as CustomEvent<{ usd: number }>).detail?.usd ?? 0;
      setBonus((b) => ({ base: base ?? 0, usd: (b && b.base === (base ?? 0) ? b.usd : 0) + usd }));
    };
    window.addEventListener("bmas:tip-landed", on);
    return () => window.removeEventListener("bmas:tip-landed", on);
  }, [base]);
  const total = base == null ? null : bonus && base <= bonus.base + 0.01 ? base + bonus.usd : base;

  const held = T_TOKENS.map((t) => ({ t, amount: jar?.holdings.find((h) => h.token === t.id)?.amount ?? 0 })).filter((r) => r.amount > 0);
  const summary = total != null ? `${label}: ${formatUsd(total)} in T-Tokens` : label;

  return (
    <>
      <Vessel coins={coins} label={summary} />
      <div className="relative mt-3 flex flex-col items-center gap-1.5 text-center">
        {total != null ? (
          <CountUp value={total} from={0} format={formatUsd} duration={1600} className="font-display text-[44px] leading-none tracking-[-0.02em]" />
        ) : (
          <span className="font-display text-[44px] leading-none text-muted-foreground">—</span>
        )}
        <span className="text-xs text-muted-foreground">{held.length || bonus ? "in the jar" : jar ? "Empty jar. Be the first tip." : "Jar unavailable right now"}</span>
        {held.length ? (
          <ul className="mt-1 flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {held.map(({ t, amount }) => (
              <li key={t.id} className="flex items-center gap-1.5 tabular-nums">
                <Coin token={t.id} size={12} />
                {formatTokenAmount(amount)} {t.symbol}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </>
  );
}
