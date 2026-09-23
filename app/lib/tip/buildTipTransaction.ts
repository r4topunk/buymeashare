import "@/lib/solana/buffer";
import { Keypair, PublicKey, type AddressLookupTableAccount, type Connection, type TransactionInstruction } from "@solana/web3.js";
import { MAX_LOCK_SECONDS } from "@/lib/lock";
import { defaultConnection } from "@/lib/solana/client";
import { SHRINK_LADDER, getQuote, getSwapInstructions, routeLabel, usdToInputAmount, type Quote } from "@/lib/solana/jupiter";
import { CANCEL_MODE_NONE, UPDATE_RECIPIENT_MODE_NONE, createVestingEscrowV2Ix } from "@/lib/solana/lock";
import { ata, createAtaIdempotentIx, loadMint, transferFee } from "@/lib/solana/token";
import { chainNow, compileV0, computeBudgetIxs, fetchLookupTables, memoIx, MAX_TX_BYTES } from "@/lib/solana/tx";
import { minTipUsd, tokenById } from "@/lib/tokens";
import { TipError } from "./errors";
import { TIP_MEMO } from "./memo";
import type { BuildTipParams, BuiltTip, TxDeps } from "./types";

const SLIPPAGE_BPS = 50;
const CU_UNLOCKED = 300_000;
const CU_LOCKED = 400_000;

export function validateTipParams(p: Pick<BuildTipParams, "usdAmount" | "lockSeconds">): void {
  const locked = p.lockSeconds != null;
  if (!Number.isFinite(p.usdAmount) || p.usdAmount < minTipUsd(locked)) {
    throw new TipError("INVALID_PARAMS", `Minimum ${locked ? "locked " : ""}tip is $${minTipUsd(locked)}`);
  }
  if (locked && (!Number.isInteger(p.lockSeconds) || p.lockSeconds! < 1 || p.lockSeconds! > MAX_LOCK_SECONDS)) {
    throw new TipError("INVALID_PARAMS", "Lock duration must be between 1 second and 5 years");
  }
}

/**
 * Builds the fan's tip as ONE v0 transaction (ported from ../spike/swap-to-other.ts and ../spike/swap-and-lock.ts).
 *
 *  - Unlocked: [compute budget, create creator T-Token ATA (idempotent, fan pays), Jupiter setup, Jupiter swap
 *    ExactIn with destinationTokenAccount = creator ATA, Jupiter cleanup, memo TIP_MEMO].
 *  - Locked:   [compute budget, Jupiter setup, swap into the FAN's ATA, cleanup, create escrow ATA (idempotent),
 *    createVestingEscrowV2 (recipient = creator, cliff = CHAIN now + lockSeconds, cancel NONE,
 *    cliffUnlockAmount = minOut - fee(minOut)), memo TIP_MEMO]. Signers: fan + an ephemeral escrow base keypair,
 *    generated here and applied as a partial signature before returning (it never leaves this process).
 *
 * Quotes walk SHRINK_LADDER until the tx fits 1232 bytes. Isomorphic: browser (wallet connection) and server (Blink).
 */
export async function buildTipTransaction(params: BuildTipParams, deps: TxDeps = {}): Promise<BuiltTip> {
  validateTipParams(params);
  const conn = deps.connection ?? defaultConnection();
  const token = tokenById(params.token);
  const lockSeconds = params.lockSeconds;
  const locked = lockSeconds != null;

  const [mint, input, latest, now] = await Promise.all([
    loadMint(conn, new PublicKey(token.mint)),
    usdToInputAmount(params.payWith, params.usdAmount),
    conn.getLatestBlockhash("confirmed"),
    locked ? chainNow(conn) : Promise.resolve(null),
  ]);

  const base = locked ? Keypair.generate() : null; // escrow seed signer, in memory only
  const altCache = new Map<string, AddressLookupTableAccount>();
  const errors: string[] = [];
  let smallest = Number.POSITIVE_INFINITY;

  for (const step of SHRINK_LADDER) {
    let quote: Quote;
    try {
      quote = await getQuote(input.mint, mint.mint, input.amount, { ...step.opts, slippageBps: SLIPPAGE_BPS });
    } catch (e) {
      errors.push(`${step.label}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    const minOut = BigInt(quote.otherAmountThreshold);

    let ixs: TransactionInstruction[];
    let lock: BuiltTip["lock"] = null;
    let swap: Awaited<ReturnType<typeof getSwapInstructions>>;
    try {
      if (!locked) {
        const creatorAta = ata(mint, params.creator);
        swap = await getSwapInstructions({ quote, user: params.payer, destinationTokenAccount: creatorAta });
        ixs = [
          ...computeBudgetIxs(CU_UNLOCKED),
          createAtaIdempotentIx(params.payer, mint, params.creator),
          ...swapIxs(swap),
          memoIx(TIP_MEMO),
        ];
      } else {
        swap = await getSwapInstructions({ quote, user: params.payer });
        // Net mode (spike): createVestingEscrowV2 pulls a fee-inclusive gross from the sender, so locking
        // minOut - fee(minOut) makes the sender pay at most minOut: it can never fail on funds, and the
        // escrow ends up holding exactly cliffUnlockAmount.
        const amountRaw = minOut - transferFee(mint, minOut);
        const cliffTime = now! + BigInt(lockSeconds);
        const { ix, escrow } = createVestingEscrowV2Ix({
          base: base!.publicKey,
          mint: mint.mint,
          sender: params.payer,
          senderToken: ata(mint, params.payer),
          recipient: params.creator,
          tokenProgram: mint.programId,
          params: {
            vestingStartTime: now!,
            cliffTime,
            frequency: BigInt(1), // must be non-zero; irrelevant with numberOfPeriod = 0
            cliffUnlockAmount: amountRaw, // everything unlocks at the cliff
            amountPerPeriod: BigInt(0),
            numberOfPeriod: BigInt(0),
            updateRecipientMode: UPDATE_RECIPIENT_MODE_NONE,
            cancelMode: CANCEL_MODE_NONE,
          },
        });
        ixs = [
          ...computeBudgetIxs(CU_LOCKED),
          ...swapIxs(swap),
          createAtaIdempotentIx(params.payer, mint, escrow, true),
          ix,
          memoIx(TIP_MEMO),
        ];
        lock = { escrow: escrow.toBase58(), cliffTime: Number(cliffTime), lockSeconds, amountRaw };
      }
    } catch (e) {
      errors.push(`${step.label}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }

    const alts = await lookupTables(conn, swap.addressLookupTableAddresses, altCache);
    const compiled = compileV0(params.payer, ixs, alts, latest.blockhash);
    smallest = Math.min(smallest, compiled.bytes);
    if (!compiled.transaction) {
      errors.push(`${step.label}: ${compiled.bytes} B > ${MAX_TX_BYTES} B`);
      continue;
    }
    if (base) compiled.transaction.sign([base]);
    return {
      transaction: compiled.transaction,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
      bytes: compiled.bytes,
      ephemeralSigners: base ? [base] : [],
      attempt: step.label,
      route: routeLabel(quote),
      inputAmount: input.amount,
      expectedOut: BigInt(quote.outAmount),
      minOut,
      lock,
    };
  }

  if (Number.isFinite(smallest)) {
    throw new TipError("TX_TOO_LARGE", `No Jupiter route fits in one transaction (smallest ${smallest} B). Try USDC or another token.`);
  }
  throw new Error(`Could not get a Jupiter route: ${errors.join(" | ")}`);
}

function swapIxs(swap: Awaited<ReturnType<typeof getSwapInstructions>>): TransactionInstruction[] {
  return [
    ...swap.setupInstructions,
    swap.swapInstruction,
    ...(swap.cleanupInstruction ? [swap.cleanupInstruction] : []),
    ...swap.otherInstructions,
  ];
}

async function lookupTables(conn: Connection, keys: PublicKey[], cache: Map<string, AddressLookupTableAccount>) {
  const missing = keys.filter((k) => !cache.has(k.toBase58()));
  for (const t of await fetchLookupTables(conn, missing)) cache.set(t.key.toBase58(), t);
  return keys.map((k) => cache.get(k.toBase58())!);
}
