"use client";

import { LockIcon, LockOpenIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { Coin } from "@/components/fx/coin";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useChainClock, useLockList, type LockListState } from "@/hooks/use-lock-list";
import { formatDateTime, formatTokenAmount, shortAddress } from "@/lib/format";
import type { LockedTip } from "@/lib/tip/types";
import { tokenById } from "@/lib/tokens";
import { cn } from "@/lib/utils";
import { ClaimButton } from "./claim-button";
import { lockedCoins } from "./coins";
import { useVessel } from "./vessel-context";

/**
 * Dev-only `?demoLocks=1`: fake escrows (one unlocking in 25 s, one already claimable) so the sealed coins,
 * countdown and claim animation can be screenshotted without a keyed RPC. Dead code in production builds.
 */
function useDemoLocks(): LockListState | null {
  const [demo, setDemo] = useState<LockListState | null>(null);
  useEffect(() => {
    if (process.env.NODE_ENV !== "development" || !new URLSearchParams(window.location.search).has("demoLocks")) return;
    const now = Math.floor(Date.now() / 1000);
    const base = { totalRaw: "0", claimedRaw: "0", from: "H4KB32QYTbgHWQathSgSwatGoxHCeeTo7V87X5JiYB9Q", recipient: "demo", depositLamports: 5108640 };
    const locks: LockedTip[] = [
      { ...base, escrow: "demo-a", token: "openai", amount: 0.00481, unlockAt: now + 25, status: "locked", claimable: false },
      { ...base, escrow: "demo-b", token: "spacex", amount: 0.0172, unlockAt: now - 60, status: "claimable", claimable: true },
      { ...base, escrow: "demo-c", token: "kalshi", amount: 0.0221, unlockAt: now + 86400 * 180, status: "locked", claimable: false },
    ];
    const t = setTimeout(() => setDemo({ kind: "ready", list: { locks, chainTime: now }, skew: 0 }), 0);
    return () => clearTimeout(t);
  }, []);
  return demo;
}

export function LocksPanel({ creator }: { creator: string }) {
  const { state: live, refresh } = useLockList(creator, "recipient");
  const demo = useDemoLocks();
  const state = demo ?? live;
  const chainNow = useChainClock(state.kind === "ready" ? state.skew : null);
  const vessel = useVessel();
  const setLockCoins = vessel?.setLockCoins;
  const locks = state.kind === "ready" ? state.list.locks : null;

  useEffect(() => {
    if (locks) setLockCoins?.(lockedCoins(locks));
  }, [locks, setLockCoins]);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-[-0.01em]">
          <LockIcon className="size-4 text-brand" /> Locked tips
        </h2>
        {locks?.length ? <span className="text-sm text-muted-foreground tabular-nums">{locks.length} sealed</span> : null}
      </div>
      <p className="-mt-1 text-sm text-muted-foreground">Fans can lock a tip for up to 5 years. Claim it here once it unlocks.</p>
      {state.kind === "loading" ? <div className="h-20 animate-pulse rounded-2xl bg-white/[0.04]" /> : null}
      {state.kind === "error" ? (
        <Alert variant={state.unsupported ? "default" : "destructive"} className="rounded-2xl">
          <AlertTitle>{state.unsupported ? "Locked tips can't be read on this RPC" : "Could not load locked tips"}</AlertTitle>
          <AlertDescription className="break-words">{state.message}</AlertDescription>
        </Alert>
      ) : null}
      {locks && locks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 px-4 py-7 text-center text-sm text-muted-foreground">No locked tips.</div>
      ) : null}
      {locks && locks.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {locks.map((l) => (
            <LockRow key={l.escrow} lock={l} creator={creator} chainNow={chainNow} onClaimed={refresh} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function LockRow({ lock: l, creator, chainNow, onClaimed }: { lock: LockedTip; creator: string; chainNow: number | null; onClaimed: () => void }) {
  const [opened, setOpened] = useState(false);
  const unlocked = l.status === "claimable" || (chainNow != null && chainNow >= l.unlockAt);
  const left = chainNow != null ? Math.max(0, Math.round(l.unlockAt - chainNow)) : null;
  return (
    <li
      className={cn(
        "surface flex items-center gap-3 rounded-2xl px-4 py-3.5 text-sm transition-[border-color,box-shadow] duration-500",
        unlocked && !opened && "border-brand/40 shadow-[0_0_0_1px_color-mix(in_oklch,var(--brand)_30%,transparent),0_18px_40px_-20px_color-mix(in_oklch,var(--brand)_60%,transparent)]",
      )}
    >
      <span className="relative grid place-items-center">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={opened ? "open" : "sealed"}
            initial={{ scale: 0.4, rotate: -40, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            exit={{ scale: 1.6, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 20 }}
          >
            <Coin token={l.token} size={40} locked={!opened} />
          </motion.span>
        </AnimatePresence>
        {unlocked && !opened ? (
          <motion.span
            aria-hidden
            className="absolute inset-[-4px] rounded-full border border-brand/60"
            animate={{ scale: [1, 1.35], opacity: [0.8, 0] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
          />
        ) : null}
      </span>
      <div className="min-w-0 flex-1">
        <div>
          <span className="font-medium tabular-nums">{formatTokenAmount(l.amount)}</span> {tokenById(l.token).symbol}
        </div>
        <div className="text-xs text-muted-foreground text-pretty">
          from <span className="font-mono">{shortAddress(l.from)}</span> ·{" "}
          {opened ? "Claimed" : unlocked ? "Unlocked" : `Unlocks ${formatDateTime(l.unlockAt)}`}
        </div>
        {!unlocked && left != null && left < 3600 ? (
          <div className="mt-1 flex items-center gap-1.5 font-mono text-xs text-brand tabular-nums" aria-live="off">
            <LockIcon className="size-3" /> {String(Math.floor(left / 60)).padStart(2, "0")}:{String(left % 60).padStart(2, "0")}
          </div>
        ) : null}
        {opened ? (
          <div className="mt-1 flex items-center gap-1.5 text-xs text-brand">
            <LockOpenIcon className="size-3" /> In the jar
          </div>
        ) : null}
      </div>
      {opened ? null : (
        <ClaimButton
          lock={l}
          creator={creator}
          chainNow={chainNow}
          onClaimed={() => {
            setOpened(true);
            onClaimed();
          }}
        />
      )}
    </li>
  );
}
