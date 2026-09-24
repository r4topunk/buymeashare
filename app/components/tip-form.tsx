"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import { AlertCircleIcon, ArrowUpRightIcon, CheckIcon, LockIcon, RotateCcwIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Coin } from "@/components/fx/coin";
import { Switch } from "@/components/fx/switch";
import { useVessel } from "@/components/jar/vessel-context";
import { LockWarning } from "@/components/lock-warning";
import { Segmented } from "@/components/segmented";
import { AmountDial } from "@/components/tip/amount-dial";
import { TipButton } from "@/components/tip/tip-button";
import { TokenPicker } from "@/components/tip/token-picker";
import { TxSteps } from "@/components/tip/tx-steps";
import { toastTx } from "@/components/tx-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { prefersReducedMotion } from "@/hooks/use-fx";
import { usePrices } from "@/hooks/use-prices";
import { useSendTransaction } from "@/hooks/use-send-transaction";
import * as sfx from "@/lib/fx/audio";
import { HAPTIC, haptic } from "@/lib/fx/haptics";
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
import {
  DEFAULT_TIP_USD,
  MIN_LOCKED_TIP_USD,
  T_TOKENS,
  TRANSFER_FEE_FRACTION,
  minTipUsd,
  tokenById,
  type PayAssetId,
  type TTokenId,
} from "@/lib/tokens";
import { cn } from "@/lib/utils";

type Status =
  | { kind: "idle" }
  | { kind: "building" | "signing" | "confirming" }
  | { kind: "done"; signature: string; lock: { cliffTime: number; seconds: number } | null }
  | { kind: "error"; message: string };

const DEFAULT_LOCK_AMOUNT: Record<LockUnit, string> = { days: "30", months: "6", years: "1" };
const UNIT_LABEL: Record<LockUnit, string> = { days: "Days", months: "Months", years: "Years" };
/** Single-tx locked tips leave the 0.5% slippage buffer with the fan and pay the 0.2% fee on deposit and claim. */
const LOCKED_EXTRA_COST = (1 - TRANSFER_FEE_FRACTION) ** 2 * (1 - 0.005);
const PRESETS = [1, 3, 5, 10, 25];
const LOCKED_PRESETS = [5, 10, 25, 50, 100];

/**
 * Dev-only simulation of the tip flow for screenshots and the demo video: `?demoSuccess=1` (click Tip),
 * `?demoSuccess=auto` (runs on load), `?demoSuccess=error`, plus `&demoLock=1` to start with a lock.
 * `process.env.NODE_ENV` is inlined at build time, so this is dead code in production builds. No transaction is sent.
 */
const DEMO_ENABLED = process.env.NODE_ENV === "development";
function demoParam(name: string): string | null {
  if (!DEMO_ENABLED || typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const nowMs = () => Date.now();

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
  const vessel = useVessel();
  const buttonRef = useRef<HTMLButtonElement>(null);
  /** What was submitted (the form is frozen while busy, but keep the exact values for the celebration). */
  const submitted = useRef<{ token: TTokenId; usd: number }>({ token: initialToken, usd: DEFAULT_TIP_USD });

  const [tokenId, setTokenId] = useState<TTokenId>(initialToken);
  const [pay, setPay] = useState<PayAssetId>("USDC");
  const [amountText, setAmountText] = useState(String(DEFAULT_TIP_USD));
  const [lockUnit, setLockUnit] = useState<LockChoiceUnit>("none");
  const [lockAmountText, setLockAmountText] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  /** The coin has landed in the jar: reveal the receipt. */
  const [landed, setLanded] = useState(false);

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

  /** Fires only after the transaction is confirmed on-chain (or in the dev simulation). */
  async function celebrate(signature: string, isLocked: boolean) {
    const s = submitted.current;
    setLanded(false);
    if (vessel) await vessel.deliver({ id: `tip-${signature}`, token: s.token, locked: isLocked, from: buttonRef.current });
    if (isLocked) sfx.clunk();
    sfx.chime();
    haptic(isLocked ? HAPTIC.lock : HAPTIC.success);
    vessel?.confetti(s.token);
    window.dispatchEvent(new CustomEvent("bmas:tip-landed", { detail: { usd: s.usd } }));
    setLanded(true);
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
      void celebrate(signature, built.lock != null);
    } catch (e) {
      setStatus({ kind: "error", message: errorMessage(e) });
      sfx.error();
      haptic(HAPTIC.error);
    }
  }

  /** Dev simulation: same UI states and timing shape as a real tip, nothing is built or sent. */
  async function demoTip(kind: string) {
    if (!canSubmit) return;
    setStatus({ kind: "building" });
    await sleep(700);
    setStatus({ kind: "signing" });
    await sleep(1300);
    setStatus({ kind: "confirming" });
    await sleep(1400);
    if (kind === "error") {
      setStatus({ kind: "error", message: "Demo: simulated failure. No transaction was sent." });
      sfx.error();
      haptic(HAPTIC.error);
      return;
    }
    const signature = `demo${nowMs()}`;
    setStatus({ kind: "done", signature, lock: lockSeconds != null ? { cliffTime: Math.floor(nowMs() / 1000) + lockSeconds, seconds: lockSeconds } : null });
    void celebrate(signature, lockSeconds != null);
  }

  useEffect(() => {
    if (!DEMO_ENABLED) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (demoParam("demoLock")) timers.push(setTimeout(() => chooseUnit(DEMO_LOCK_SECONDS != null ? "demo" : "months"), 0));
    if (demoParam("demoLock")) timers.push(setTimeout(() => setAmountText(String(MIN_LOCKED_TIP_USD)), 0));
    if (demoParam("demoSuccess") === "auto") timers.push(setTimeout(() => buttonRef.current?.click(), 1600));
    return () => timers.forEach(clearTimeout);
  }, []);

  function setLock(on: boolean) {
    if (on) {
      chooseUnit("months");
      if (!(Number(amountText) >= MIN_LOCKED_TIP_USD)) setAmountText(String(MIN_LOCKED_TIP_USD));
      sfx.clunk();
      haptic(HAPTIC.lock);
    } else {
      chooseUnit("none");
      sfx.tick(0.2);
      haptic(HAPTIC.tick);
    }
  }

  function again() {
    setStatus({ kind: "idle" });
    setLanded(false);
  }

  const lockLabel = lockSeconds != null ? formatLockDuration(lockSeconds) : null;
  const unitOptions = [
    ...LOCK_UNITS.map((u) => ({ value: u as LockChoiceUnit, label: UNIT_LABEL[u] })),
    ...(DEMO_LOCK_SECONDS != null ? [{ value: "demo" as const, label: "Demo", hint: formatLockDuration(DEMO_LOCK_SECONDS) }] : []),
  ];
  const hints = Object.fromEntries(T_TOKENS.map((t) => [t.id, prices?.tokens[t.id]?.usd != null ? formatUsd(prices.tokens[t.id].usd) : "…"])) as Record<TTokenId, string>;
  const done = status.kind === "done";
  const showReceipt = done && (landed || !vessel);
  const receiptRef = useRef<HTMLDivElement>(null);
  // On phones the jar scrolled into view for the drop; after the confetti, bring the receipt back.
  useEffect(() => {
    if (!showReceipt) return;
    const t = setTimeout(() => {
      const el = receiptRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.top > window.innerHeight || r.bottom < 0) el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
    }, 1500);
    return () => clearTimeout(t);
  }, [showReceipt]);

  const buttonLabel =
    status.kind === "building"
      ? { key: "b", node: <>Preparing your tip</> }
      : status.kind === "signing"
        ? { key: "s", node: <>Approve in your wallet</> }
        : status.kind === "confirming"
          ? { key: "c", node: <>Confirming on Solana</> }
          : done
            ? { key: "d", node: <><CheckIcon className="size-5" strokeWidth={3} /> In the jar</> }
            : {
                key: `i${locked ? "l" : ""}`,
                node: (
                  <>
                    {locked ? <LockIcon className="size-[18px]" strokeWidth={2.5} /> : null}
                    {`Tip ${amountValid ? formatUsd(usd) : ""}${lockLabel ? ` · locked ${lockLabel}` : ""}`}
                  </>
                ),
              };

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (done) return;
        submitted.current = { token: tokenId, usd };
        const demo = demoParam("demoSuccess");
        void (demo ? demoTip(demo) : tip());
      }}
    >
      <fieldset disabled={busy || done} className="flex flex-col gap-6 disabled:opacity-100">
        <div className="flex flex-col gap-3">
          <SectionLabel>Tip in</SectionLabel>
          <TokenPicker value={tokenId} onChange={setTokenId} hints={hints} disabled={busy || done} />
          <p className="text-center text-xs text-muted-foreground">
            {token.company} pre-IPO exposure (Tessera T-Token)
            {quote.markPrice != null ? ` · Tessera mark: ${formatUsd(quote.markPrice)}` : ""}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <AmountDial
            value={amountText}
            onChange={setAmountText}
            minUsd={minUsd}
            presets={locked ? LOCKED_PRESETS : PRESETS}
            invalid={!amountValid}
            disabled={busy || done}
          />
          {!amountValid ? (
            <p className="text-center text-xs text-destructive" role="status">
              Minimum {locked ? "locked " : ""}tip is {formatUsd(minUsd)}.
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-4">
          <SectionLabel>Pay with</SectionLabel>
          <Segmented
            name="Pay with"
            value={pay}
            onChange={setPay}
            size="sm"
            className="w-44"
            disabled={busy || done}
            options={[
              { value: "USDC", label: "USDC" },
              { value: "SOL", label: "SOL" },
            ]}
          />
        </div>

        <div className={cn("flex flex-col rounded-2xl border transition-colors duration-300", locked ? "border-brand/35 bg-brand/[0.06]" : "border-border bg-white/[0.02]")}>
          <div className="flex items-center gap-3 p-3.5">
            <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl border transition-colors", locked ? "border-brand/40 bg-brand/15 text-brand" : "border-border bg-white/[0.04] text-muted-foreground")}>
              <LockIcon className="size-4" />
            </span>
            <label htmlFor="lock-switch" className="min-w-0 flex-1 cursor-pointer">
              <span className="block text-sm font-medium">Lock it (optional)</span>
              <span className="block text-xs text-muted-foreground text-pretty">
                {locked
                  ? `The tip goes into a Jupiter Lock escrow. ${creatorLabel} can claim it${lockLabel ? ` after ${lockLabel}` : " once it unlocks"}.`
                  : `Delivered straight to ${creatorLabel}'s wallet.`}
              </span>
            </label>
            <Switch id="lock-switch" checked={locked} onChange={setLock} label="Lock the tip" disabled={busy || done} />
          </div>
          <AnimatePresence initial={false}>
            {locked ? (
              <motion.div
                key="lock-controls"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ type: "spring", stiffness: 380, damping: 36 }}
                className="overflow-hidden"
              >
                <div className="flex flex-col gap-3 px-3.5 pb-3.5">
                  <Segmented name="Lock" value={lockUnit} onChange={chooseUnit} options={unitOptions} disabled={busy || done} />
                  {lockUnit !== "demo" ? (
                    <div className="flex items-center gap-2.5">
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
                        className="h-11 w-24 rounded-xl bg-black/25 text-center text-lg tabular-nums"
                      />
                      <span className="text-sm text-muted-foreground">{lockUnit} (max 5 years)</span>
                    </div>
                  ) : null}
                  {lockError ? <p className="text-xs text-destructive">{lockError}.</p> : null}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </fieldset>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 border-y border-dashed border-border py-3.5 text-sm">
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
        <dd className="flex items-center justify-end gap-1.5 text-right tabular-nums">
          <Coin token={tokenId} size={16} locked={locked} />
          <span>
            {quote.tokensOut == null ? "…" : `≈ ${formatTokenAmount(quote.tokensOut)} ${token.symbol}`}
            {lockLabel ? <span className="text-muted-foreground"> after {lockLabel}</span> : null}
          </span>
        </dd>
        <dd className="col-span-2 text-right text-xs text-muted-foreground">
          Estimate at market price {formatUsd(quote.swapPrice)}
          {quote.markPrice != null ? ` · Tessera mark: ${formatUsd(quote.markPrice)}` : ""}. Includes 0.2% token transfer fee
          {locked ? " (paid on deposit and again on claim)" : ""}.
        </dd>
      </dl>

      {locked ? <LockWarning /> : null}

      <div className="flex flex-col gap-3">
        <TipButton ref={buttonRef} disabled={!canSubmit && !busy} busy={busy} locked={locked} labelKey={buttonLabel.key}>
          {buttonLabel.node}
        </TipButton>
        {busy ? (
          <TxSteps current={status.kind as "building" | "signing" | "confirming"} />
        ) : !publicKey && !done ? (
          <p className="text-center text-xs text-muted-foreground">You&apos;ll be asked to connect a wallet.</p>
        ) : null}
      </div>

      {status.kind === "error" ? (
        <Alert variant="destructive" className="rounded-xl">
          <AlertCircleIcon />
          <AlertTitle>Tip failed</AlertTitle>
          <AlertDescription className="break-words">{status.message}</AlertDescription>
        </Alert>
      ) : null}

      <AnimatePresence>
        {status.kind === "done" && showReceipt ? (
          <motion.div
            key="receipt"
            ref={receiptRef}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            className="flex flex-col gap-3 rounded-2xl border border-brand/30 bg-brand/[0.07] p-4"
            role="status"
          >
            <div className="flex items-center gap-3">
              <Coin token={tokenId} size={36} locked={status.lock != null} />
              <div className="min-w-0">
                <div className="font-semibold">{status.lock ? "Locked tip sent" : "Tip sent"}</div>
                <div className="text-sm text-muted-foreground">
                  {formatUsd(usd)} in {token.symbol} is in {creatorLabel}&apos;s jar.
                </div>
              </div>
            </div>
            {status.lock ? (
              <p className="text-sm text-muted-foreground text-pretty">
                Unlocks {formatDateTime(status.lock.cliffTime)} ({formatLockDuration(status.lock.seconds)}).
                {publicKey ? (
                  <>
                    {" "}
                    Your ~{ESCROW_DEPOSIT_SOL.toFixed(4)} SOL deposit comes back after {creatorLabel} claims:{" "}
                    <Link href={`/deposits/${publicKey.toBase58()}`} className="text-foreground underline underline-offset-2">
                      manage your deposits
                    </Link>
                    .
                  </>
                ) : null}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={explorerTx(status.signature)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-white/[0.04] px-3.5 text-sm font-medium hover:bg-white/[0.08]"
              >
                View transaction <ArrowUpRightIcon className="size-3.5" />
              </a>
              <button
                type="button"
                onClick={again}
                className="inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/70"
              >
                <RotateCcwIcon className="size-3.5" /> Tip again
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </form>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">{children}</span>;
}
