"use client";

import { LockIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useChainClock, useLockList } from "@/hooks/use-lock-list";
import { formatDateTime, formatTokenAmount, shortAddress } from "@/lib/format";
import { tokenById } from "@/lib/tokens";
import { ClaimButton } from "./claim-button";

export function LocksPanel({ creator }: { creator: string }) {
  const { state, refresh } = useLockList(creator, "recipient");
  const chainNow = useChainClock(state.kind === "ready" ? state.skew : null);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        <LockIcon className="size-4" /> Locked tips
      </h2>
      <p className="-mt-1 text-sm text-muted-foreground">Fans can lock a tip for up to 5 years. Claim it here once it unlocks.</p>
      {state.kind === "loading" ? <div className="h-16 animate-pulse rounded-xl bg-muted" /> : null}
      {state.kind === "error" ? (
        <Alert variant={state.unsupported ? "default" : "destructive"}>
          <AlertTitle>{state.unsupported ? "Locked tips can't be read on this RPC" : "Could not load locked tips"}</AlertTitle>
          <AlertDescription className="break-words">{state.message}</AlertDescription>
        </Alert>
      ) : null}
      {state.kind === "ready" && state.list.locks.length === 0 ? (
        <div className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">No locked tips.</div>
      ) : null}
      {state.kind === "ready" && state.list.locks.length > 0 ? (
        <ul className="divide-y divide-border rounded-xl border bg-card">
          {state.list.locks.map((l) => (
            <li key={l.escrow} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div className="min-w-0">
                <div>
                  <span className="font-medium tabular-nums">{formatTokenAmount(l.amount)}</span> {tokenById(l.token).symbol}
                </div>
                <div className="text-xs text-muted-foreground">
                  from <span className="font-mono">{shortAddress(l.from)}</span> ·{" "}
                  {chainNow != null && chainNow >= l.unlockAt ? "Unlocked" : `Unlocks ${formatDateTime(l.unlockAt)}`}
                </div>
              </div>
              <ClaimButton lock={l} creator={creator} chainNow={chainNow} onClaimed={refresh} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
