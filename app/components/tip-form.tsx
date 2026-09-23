"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import { AlertCircleIcon, LockIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { LockWarning } from "@/components/lock-warning";
import { Segmented } from "@/components/segmented";
import { toastTx } from "@/components/tx-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePrices } from "@/hooks/use-prices";
import { useSendTransaction } from "@/hooks/use-send-transaction";
import { explorerTx, formatDateTime, formatTokenAmount, formatUsd } from "@/lib/format";
import {
  DEMO_LOCK_SECONDS,
  ESCROW_DEPOSIT_SOL,
  LOCK_UNITS,
  formatLockDuration,
  lockChoiceError,
  lockSecondsFor,
  maxLockAmount,
  type LockChoiceUnit,
  type LockUnit,
} from "@/lib/lock";
import type { PriceSnapshot } from "@/lib/prices/types";
import { buildTipTransaction, errorMessage } from "@/lib/tip";
import { DEFAULT_TIP_USD, T_TOKENS, TRANSFER_FEE_FRACTION, minTipUsd, tokenById, type PayAssetId, type TTokenId } from "@/lib/tokens";

type Status =
  | { kind: "idle" }
  | { kind: "building" | "signing" | "confirming" }
  | { kind: "done"; signature: string; lock: { cliffTime: number; seconds: number } | null }
  | { kind: "error"; message: string };

const DEFAULT_LOCK_AMOUNT: Record<LockUnit, string> = { days: "30", months: "6", years: "1" };
const UNIT_LABEL: Record<LockUnit, string> = { days: "Days", months: "Months", years: "Years" };
/** Single-tx locked tips leave the 0.5% slippage buffer with the fan and pay the 0.2% fee on deposit and claim. */
const LOCKED_EXTRA_COST = (1 - TRANSFER_FEE_FRACTION) ** 2 * (1 - 0.005);

export function TipForm({
  creator,
  creatorLabel,
  initialToken,
  initialPrices,
}: {
  creator: string;
  creatorLabel: string;
  initialToken: TTokenId;
  initialPrices: PriceSnapshot | null;
}) {
  const router = useRouter();
  const { publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const sendTx = useSendTransaction();
  const { prices } = usePrices(initialPrices);

  const [tokenId, setTokenId] = useState<TTokenId>(initialToken);
  const [pay, setPay] = useState<PayAssetId>("USDC");
  const [amountText, setAmountText] = useState(String(DEFAULT_TIP_USD));
  const [lockUnit, setLockUnit] = useState<LockChoiceUnit>("none");
  const [lockAmountText, setLockAmountText] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const token = tokenById(tokenId);
  const locked = lockUnit !== "none";
  const minUsd = minTipUsd(locked);
  const usd = Number(amountText);
  const amountValid = amountText.trim() !== "" && Number.isFinite(usd) && usd >= minUsd;
  const lockChoice = { unit: lockUnit, amount: Number(lockAmountText) };
  const lockError = locked ? lockChoiceError(lockChoice) : null;
  const lockSeconds = locked && !lockError ? lockSecondsFor(lockChoice) : null;
  const busy = status.kind === "building" || status.kind === "signing" || status.kind === "confirming";
  const canSubmit = !busy && amountValid && !lockError;

  const quote = useMemo(() => {
    const p = prices?.tokens[tokenId];
    const solUsd = prices?.solUsd ?? null;
    const swapPrice = p?.dex ?? p?.usd ?? null;
    const direct = amountValid && swapPrice ? (usd / swapPrice) * (1 - TRANSFER_FEE_FRACTION) : null;
    return {
      payAmount: !amountValid ? null : pay === "USDC" ? usd : solUsd ? usd / solUsd : null,
      solUsd,
      // Estimate only: the real amount comes from the Jupiter quote at build time.
      tokensOut: direct == null ? null : locked ? direct * LOCKED_EXTRA_COST : direct,
      swapPrice,
      markPrice: p?.tesseraMark ?? null,
    };
  }, [prices, tokenId, pay, usd, amountValid, locked]);

  function chooseUnit(unit: LockChoiceUnit) {
    setLockUnit(unit);
    if (unit !== "none" && unit !== "demo") setLockAmountText(DEFAULT_LOCK_AMOUNT[unit]);
  }

  async function tip() {
    if (!publicKey) {
      setVisible(true);
      return;
    }
    if (!canSubmit) return;
    try {
      setStatus({ kind: "building" });
      const built = await buildTipTransaction({
        payer: publicKey,
        creator: new PublicKey(creator),
        token: tokenId,
        payWith: pay,
        usdAmount: usd,
        lockSeconds,
      });
      setStatus({ kind: "signing" });
      const signature = await sendTx(built, built.ephemeralSigners, () => setStatus({ kind: "confirming" }));
      setStatus({ kind: "done", signature, lock: built.lock ? { cliffTime: built.lock.cliffTime, seconds: built.lock.lockSeconds } : null });
      toastTx(built.lock ? `Locked tip sent to ${creatorLabel}` : `Tip sent to ${creatorLabel}`, signature);
      router.refresh();
    } catch (e) {
      setStatus({ kind: "error", message: errorMessage(e) });
    }
  }

  const lockLabel = lockSeconds != null ? formatLockDuration(lockSeconds) : null;
  const unitOptions = [
    { value: "none" as const, label: "No lock" },
    ...LOCK_UNITS.map((u) => ({ value: u, label: UNIT_LABEL[u] })),
    ...(DEMO_LOCK_SECONDS != null ? [{ value: "demo" as const, label: "Demo", hint: formatLockDuration(DEMO_LOCK_SECONDS) }] : []),
  ];

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        void tip();
      }}
    >
      <div className="flex flex-col gap-2">
        <Label>Token</Label>
        <Segmented
          name="Token"
          value={tokenId}
          onChange={setTokenId}
          options={T_TOKENS.map((t) => ({
            value: t.id,
            label: t.symbol,
            hint: prices?.tokens[t.id]?.usd != null ? formatUsd(prices.tokens[t.id].usd) : "…",
          }))}
        />
        <p className="text-xs text-muted-foreground">
          {token.company} pre-IPO exposure (Tessera T-Token)
          {quote.markPrice != null ? ` · Tessera mark: ${formatUsd(quote.markPrice)}` : ""}
        </p>
      </div>

      <div className="grid grid-cols-[1fr_auto] items-end gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="tip-amount">Amount (USD)</Label>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">$</span>
            <Input
              id="tip-amount"
              inputMode="decimal"
              type="number"
              min={minUsd}
              step="0.5"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              aria-invalid={!amountValid}
              className="h-11 pl-7 text-lg tabular-nums"
            />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label>Pay with</Label>
          <Segmented
            name="Pay with"
            value={pay}
            onChange={setPay}
            className="w-36"
            options={[
              { value: "USDC", label: "USDC" },
              { value: "SOL", label: "SOL" },
            ]}
          />
        </div>
      </div>
      {!amountValid ? (
        <p className="-mt-3 text-xs text-destructive">
          Minimum {locked ? "locked " : ""}tip is {formatUsd(minUsd)}.
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label>Lock (optional)</Label>
        <Segmented name="Lock" value={lockUnit} onChange={chooseUnit} options={unitOptions} />
        {lockUnit !== "none" && lockUnit !== "demo" ? (
          <div className="flex items-center gap-2">
            <Input
              aria-label={`Lock duration in ${lockUnit}`}
              inputMode="numeric"
              type="number"
              min={1}
              max={maxLockAmount(lockUnit)}
              step={1}
              value={lockAmountText}
              onChange={(e) => setLockAmountText(e.target.value)}
              aria-invalid={lockError != null}
              className="h-11 w-28 text-lg tabular-nums"
            />
            <span className="text-sm text-muted-foreground">{lockUnit} (max 5 years)</span>
          </div>
        ) : null}
        {lockError ? <p className="text-xs text-destructive">{lockError}.</p> : null}
        <p className="text-xs text-muted-foreground">
          {locked
            ? `The tip goes into a Jupiter Lock escrow. ${creatorLabel} can claim it${lockLabel ? ` after ${lockLabel}` : " once it unlocks"}.`
            : `Delivered straight to ${creatorLabel}'s wallet.`}
        </p>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-lg bg-muted/60 px-3 py-2.5 text-sm">
        <dt className="text-muted-foreground">You pay</dt>
        <dd className="text-right tabular-nums">
          {quote.payAmount == null
            ? "…"
            : pay === "USDC"
              ? `${formatTokenAmount(quote.payAmount)} USDC`
              : `≈ ${formatTokenAmount(quote.payAmount)} SOL`}
          {pay === "SOL" && quote.solUsd ? <span className="text-muted-foreground"> @ {formatUsd(quote.solUsd)}</span> : null}
        </dd>
        {locked ? (
          <dd className="col-span-2 text-right text-xs text-muted-foreground">
            + ~{ESCROW_DEPOSIT_SOL.toFixed(4)} SOL refundable deposit (escrow rent), returned to you after the creator claims
            {quote.solUsd ? ` · ≈ ${formatUsd(ESCROW_DEPOSIT_SOL * quote.solUsd)} at ${formatUsd(quote.solUsd)}/SOL` : ""}
          </dd>
        ) : null}
        <dt className="text-muted-foreground">{creatorLabel} gets</dt>
        <dd className="text-right tabular-nums">
          {quote.tokensOut == null ? "…" : `≈ ${formatTokenAmount(quote.tokensOut)} ${token.symbol}`}
          {lockLabel ? <span className="text-muted-foreground"> after {lockLabel}</span> : null}
        </dd>
        <dd className="col-span-2 text-right text-xs text-muted-foreground">
          Estimate at market price {formatUsd(quote.swapPrice)}
          {quote.markPrice != null ? ` · Tessera mark: ${formatUsd(quote.markPrice)}` : ""}. Includes 0.2% token transfer fee
          {locked ? " (paid on deposit and again on claim)" : ""}.
        </dd>
      </dl>

      {locked ? <LockWarning /> : null}

      <Button type="submit" className="h-12 bg-brand text-base text-brand-foreground hover:bg-brand/90" disabled={!canSubmit}>
        {locked ? <LockIcon /> : null}
        {busyLabel(status) ?? `Tip ${amountValid ? formatUsd(usd) : ""}${lockLabel ? ` · locked ${lockLabel}` : ""}`}
      </Button>
      {!publicKey ? <p className="-mt-3 text-xs text-muted-foreground">You&apos;ll be asked to connect a wallet.</p> : null}

      {status.kind === "error" ? (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>Tip failed</AlertTitle>
          <AlertDescription className="break-words">{status.message}</AlertDescription>
        </Alert>
      ) : null}
      {status.kind === "done" ? (
        <Alert>
          <AlertTitle>{status.lock ? "Locked tip sent" : "Tip sent"}</AlertTitle>
          <AlertDescription>
            <a href={explorerTx(status.signature)} target="_blank" rel="noreferrer">
              View transaction
            </a>
            {status.lock && publicKey ? (
              <>
                . Unlocks {formatDateTime(status.lock.cliffTime)} ({formatLockDuration(status.lock.seconds)}). Your ~{ESCROW_DEPOSIT_SOL.toFixed(4)} SOL deposit
                comes back after {creatorLabel} claims: <Link href={`/deposits/${publicKey.toBase58()}`}>manage your deposits</Link>.
              </>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}

function busyLabel(status: Status): string | null {
  if (status.kind === "building") return "Preparing…";
  if (status.kind === "signing") return "Approve in wallet…";
  if (status.kind === "confirming") return "Confirming…";
  return null;
}
