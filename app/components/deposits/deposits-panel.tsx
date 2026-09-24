"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import { useState } from "react";
import { toast } from "sonner";
import { toastTx } from "@/components/tx-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useChainClock, useLockList } from "@/hooks/use-lock-list";
import { usePrices } from "@/hooks/use-prices";
import { useSendTransaction } from "@/hooks/use-send-transaction";
import { formatDateTime, formatSol, formatTokenAmount, formatUsd, shortAddress } from "@/lib/format";
import { buildCloseEscrowTransaction, errorMessage, type LockedTip } from "@/lib/tip";
import { tokenById } from "@/lib/tokens";
import * as sfx from "@/lib/fx/audio";

/** Fan view: escrows this wallet created. Fully claimed ones can be closed to get the rent deposit back. */
export function DepositsPanel({ sender }: { sender: string }) {
  const { state, refresh } = useLockList(sender, "sender");
  const chainNow = useChainClock(state.kind === "ready" ? state.skew : null);
  const { prices } = usePrices();
  const solUsd = prices?.solUsd ?? null;

  if (state.kind === "loading") return <div className="h-24 animate-pulse rounded-2xl bg-white/[0.04]" />;
  if (state.kind === "error") {
    return (
      <Alert variant={state.unsupported ? "default" : "destructive"}>
        <AlertTitle>{state.unsupported ? "Deposits can't be read on this RPC" : "Could not load deposits"}</AlertTitle>
        <AlertDescription className="break-words">{state.message}</AlertDescription>
      </Alert>
    );
  }
  const ready = state.list.locks.filter((l) => l.status === "claimed");
  const pending = state.list.locks.filter((l) => l.status !== "claimed");
  const total = ready.reduce((n, l) => n + l.depositLamports, 0) / 1e9;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Ready to reclaim</h2>
          {ready.length ? (
            <span className="text-sm tabular-nums text-muted-foreground">
              {formatSol(total)}
              {solUsd ? ` · ${formatUsd(total * solUsd)}` : ""}
            </span>
          ) : null}
        </div>
        {ready.length === 0 ? (
          <Empty>Nothing to reclaim yet. A deposit comes back once the creator claims the locked tip.</Empty>
        ) : (
          <ul className="surface divide-y divide-white/[0.06] rounded-2xl">
            {ready.map((l) => (
              <Row key={l.escrow} lock={l} solUsd={solUsd} subtitle={`claimed by ${shortAddress(l.recipient)}`}>
                <ReclaimButton lock={l} sender={sender} onDone={refresh} />
              </Row>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Pending</h2>
        {pending.length === 0 ? (
          <Empty>No locked tips waiting for a claim.</Empty>
        ) : (
          <ul className="surface divide-y divide-white/[0.06] rounded-2xl">
            {pending.map((l) => (
              <Row
                key={l.escrow}
                lock={l}
                solUsd={solUsd}
                subtitle={`to ${shortAddress(l.recipient)} · ${
                  chainNow != null && chainNow >= l.unlockAt ? "unlocked, waiting for the creator to claim" : `unlocks ${formatDateTime(l.unlockAt)}`
                }`}
              >
                <Button size="sm" variant="outline" disabled>
                  Waiting for claim
                </Button>
              </Row>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Row({ lock, solUsd, subtitle, children }: { lock: LockedTip; solUsd: number | null; subtitle: string; children: React.ReactNode }) {
  const token = tokenById(lock.token);
  const deposit = lock.depositLamports / 1e9;
  const tipAmount = Number(lock.totalRaw) / 10 ** token.decimals;
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
      <div className="min-w-0">
        <div>
          Deposit <span className="font-medium tabular-nums">{formatSol(deposit)}</span>
          {solUsd ? <span className="text-muted-foreground"> · {formatUsd(deposit * solUsd)}</span> : null}
        </div>
        <div className="text-xs text-muted-foreground">
          tip of {formatTokenAmount(tipAmount)} {token.symbol} {subtitle}
        </div>
      </div>
      {children}
    </li>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-white/10 px-4 py-7 text-center text-sm text-muted-foreground">{children}</div>;
}

function ReclaimButton({ lock, sender, onDone }: { lock: LockedTip; sender: string; onDone: () => void }) {
  const { publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const sendTx = useSendTransaction();
  const [busy, setBusy] = useState(false);
  const isSender = publicKey?.toBase58() === sender;

  async function reclaim() {
    if (!publicKey) return setVisible(true);
    if (!isSender) return toast.error("Connect the wallet that sent this tip to reclaim its deposit.");
    setBusy(true);
    try {
      const built = await buildCloseEscrowTransaction({ sender: publicKey, escrow: new PublicKey(lock.escrow) });
      const signature = await sendTx(built);
      toastTx(`Deposit reclaimed: ${formatSol(built.refundLamports / 1e9)}`, signature);
      sfx.chime();
      onDone();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="sm" disabled={busy || (publicKey != null && !isSender)} onClick={reclaim}>
      {busy ? "Reclaiming…" : "Reclaim deposit"}
    </Button>
  );
}
