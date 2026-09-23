// Spike 2: fan tip -> Jupiter swap into the fan's T-Token ATA -> Jupiter Lock escrow
// (recipient = creator, cliff = now + lock-seconds, cancel mode NONE) + memo.
//
// Single-tx layout: [compute budget, Jupiter setup, Jupiter swap, Jupiter cleanup,
//   create escrow ATA (idempotent), createVestingEscrowV2, memo]   signers: fan + escrow base
// Fallback (--mode two, or auto when single does not fit): tx1 = swap + memo, tx2 = lock + memo.
//
// Lock amount: the swap output is only known at build time as quote.otherAmountThreshold (min out,
// which Jupiter reports NET of the 20 bps Token-2022 fee). Measured on a mainnet fork (Surfpool):
// createVestingEscrowV2 pulls a FEE-INCLUSIVE gross from the sender, so the escrow ATA ends up holding
// exactly cliffUnlockAmount (always fully backed). --lock-amount-mode picks cliffUnlockAmount:
//   net   (default): minOut - fee(minOut) -> sender pays <= minOut; can never fail on funds.
//   gross          : minOut               -> sender pays minOut + fee; fails if actual out < that.
// Two-tx mode locks the ACTUAL received amount (net of fee), leaving no slippage dust with the fan.
//
// pnpm tsx swap-and-lock.ts --in USDC --token openai --usd 1 --lock-seconds 120            (simulate)
// pnpm tsx swap-and-lock.ts --in USDC --token openai --usd 1 --lock-seconds 120 --as auto  (simulate e2e)
// pnpm tsx swap-and-lock.ts --in USDC --token openai --usd 1 --lock-seconds 120 --send     (local surfnet; add --mainnet for REAL)
import { Keypair, PublicKey, type TransactionInstruction } from "@solana/web3.js";
import { CREATOR_KEYPAIR_PATH, banner, connection, loadKeypair, parseCli, tokenMint } from "./lib/config.js";
import { SHRINK_LADDER, getQuote, getSwapInstructions, routeLabel, usdToInputAmount, type Quote } from "./lib/jupiter.js";
import {
  CANCEL_MODE_NONE, UPDATE_RECIPIENT_MODE_NONE, createVestingEscrowV2Ix, decodeEscrow, deriveEscrow,
} from "./lib/lock.js";
import {
  ata, createAtaIdempotentIx, feeBps, fmt, loadMint, snapshot, snapshotFromInfo, transferFee, type MintInfo,
} from "./lib/token.js";
import {
  STRUCTURAL, buildTx, computeBudgetIxs, describeSize, fetchLookupTables, memoIx, printSim, signAndSend, simulate,
  type BuiltTx, type SimReport,
} from "./lib/tx.js";
import { fanActor, printSolBalance } from "./lib/wallets.js";

const { mode, values } = parseCli({
  in: { type: "string", default: "USDC" },
  token: { type: "string", default: "openai" },
  usd: { type: "string", default: "1" },
  "lock-seconds": { type: "string", default: "120" },
  "lock-amount-mode": { type: "string", default: "net" }, // net | gross
  mode: { type: "string", default: "auto" }, // auto | single | two
  "slippage-bps": { type: "string", default: "50" },
  cu: { type: "string", default: "400000" },
  "cu-price": { type: "string", default: "20000" },
  as: { type: "string" },
  creator: { type: "string" },
  logs: { type: "boolean", default: false },
});

type LockPlan = { base: Keypair; escrow: PublicKey; escrowToken: PublicKey; amount: bigint; cliffTime: bigint; ixs: TransactionInstruction[] };

function lockAmountFor(mint: MintInfo, available: bigint): bigint {
  return values["lock-amount-mode"] === "gross" ? available : available - transferFee(mint, available);
}

// Chain clock (Clock sysvar seconds), not the local wall clock: they diverge on a time-travelled
// surfnet and can drift on mainnet too.
let chainNow = 0n;
async function refreshChainNow(conn: ReturnType<typeof connection>) {
  const t = await conn.getBlockTime(await conn.getSlot("confirmed"));
  chainNow = BigInt(t ?? Math.floor(Date.now() / 1000));
}

function planLock(mint: MintInfo, fan: PublicKey, creator: PublicKey, amount: bigint): LockPlan {
  const base = Keypair.generate(); // escrow seed signer, kept in memory only
  const now = chainNow;
  const cliffTime = now + BigInt(Number(values["lock-seconds"]));
  const escrow = deriveEscrow(base.publicKey);
  const { ix, escrowToken } = createVestingEscrowV2Ix({
    base: base.publicKey,
    mint: mint.mint,
    sender: fan,
    senderToken: ata(mint, fan),
    recipient: creator,
    tokenProgram: mint.programId,
    params: {
      vestingStartTime: now,
      cliffTime,
      frequency: 1n, // must be non-zero; irrelevant with numberOfPeriod = 0
      cliffUnlockAmount: amount, // everything unlocks at the cliff
      amountPerPeriod: 0n,
      numberOfPeriod: 0n,
      updateRecipientMode: UPDATE_RECIPIENT_MODE_NONE,
      cancelMode: CANCEL_MODE_NONE,
    },
  });
  return { base, escrow, escrowToken, amount, cliffTime, ixs: [createAtaIdempotentIx(fan, mint, escrow, true), ix] };
}

async function main() {
  const input = String(values.in).toUpperCase();
  if (input !== "SOL" && input !== "USDC") throw new Error("--in must be SOL or USDC");
  const txMode = String(values.mode);
  if (!["auto", "single", "two"].includes(txMode)) throw new Error("--mode must be auto|single|two");
  const conn = connection();
  banner("swap-and-lock: tip -> T-Token -> Jupiter Lock escrow for creator", mode);

  const fan = await fanActor(conn, mode, values.as as string | undefined);
  const creator = values.creator ? new PublicKey(values.creator as string) : loadKeypair(CREATOR_KEYPAIR_PATH).publicKey;
  const mint = await loadMint(conn, tokenMint(String(values.token)));
  const fanAta = ata(mint, fan.pubkey);

  console.log("\n[accounts]");
  await printSolBalance(conn, `fan${fan.impersonated ? " (IMPERSONATED, simulation only)" : ""}`, fan.pubkey);
  console.log(`  creator (escrow recipient): ${creator.toBase58()}`);
  console.log(`  T-Token mint: ${mint.mint.toBase58()} (${values.token}, fee ${feeBps(mint)} bps)`);
  console.log(`  fan Token-2022 ATA: ${fanAta.toBase58()}`);

  const usd = Number(values.usd);
  const { mint: inMint, amount } = await usdToInputAmount(input, usd);
  console.log(`\n[input] $${usd} in ${input} = ${amount} base units; lock ${values["lock-seconds"]}s; lock-amount-mode=${values["lock-amount-mode"]}`);

  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  await refreshChainNow(conn);
  const cb = () => computeBudgetIxs(Number(values.cu), Number(values["cu-price"]));
  const slippageBps = Number(values["slippage-bps"]);

  // ---- single-transaction attempts along the shrink ladder
  let single: { built: BuiltTx; quote: Quote; lock: LockPlan; label: string } | null = null;
  let lastQuote: Quote | null = null;
  let lastSwap: Awaited<ReturnType<typeof getSwapInstructions>> | null = null;
  if (txMode !== "two") {
    console.log("\n[single-tx size attempts] (limit 1232 B)");
    for (const step of SHRINK_LADDER) {
      try {
        const quote = await getQuote(inMint, mint.mint, amount, { ...step.opts, slippageBps });
        const swap = await getSwapInstructions({ quote, user: fan.pubkey });
        lastQuote ??= quote;
        lastSwap ??= swap;
        const lock = planLock(mint, fan.pubkey, creator, lockAmountFor(mint, BigInt(quote.otherAmountThreshold)));
        const ixs = [
          ...cb(),
          ...swap.setupInstructions,
          swap.swapInstruction,
          ...(swap.cleanupInstruction ? [swap.cleanupInstruction] : []),
          ...swap.otherInstructions,
          ...lock.ixs,
          memoIx(),
        ];
        const alts = await fetchLookupTables(conn, swap.addressLookupTableAddresses);
        const built = buildTx(fan.pubkey, ixs, alts, blockhash);
        console.log(`  ${step.label.padEnd(18)} route=[${routeLabel(quote)}] min=${quote.otherAmountThreshold} | ${describeSize(built)}`);
        if (built.fitsV0) {
          single = { built, quote, lock, label: step.label };
          break;
        }
      } catch (e) {
        console.log(`  ${step.label.padEnd(18)} ERROR: ${(e as Error).message}`);
      }
    }
  }

  if (single) {
    const { built, quote, lock } = single;
    console.log(`\n[chosen single tx] ${single.label}: ${built.v0Bytes} B v0 (legacy would be ${built.legacyBytes} B: ${built.fitsLegacy ? "fits" : "does not fit"})`);
    printLockPlan(lock, quote);
    if (mode === "simulate") {
      const sim = await simulate(conn, built, [fanAta, lock.escrowToken, lock.escrow]);
      console.log("\n[simulate single tx] sigVerify:false, replaceRecentBlockhash:true");
      printSim(sim, Boolean(values.logs));
      if (sim.cls === "OK") reportEscrow(sim, lock, quote, await snapshot(conn, fanAta, mint.programId), mint);
      finish(sim.cls, `single tx ${built.v0Bytes} B v0`);
      return;
    }
    if (!fan.signer) throw new Error("No fan signer available");
    console.log("\n[send single tx]");
    await signAndSend(conn, built, [fan.signer, lock.base]);
    await reportEscrowOnChain(conn, lock, mint);
    console.log(`\nclaim after cliff: pnpm tsx claim.ts --escrow ${lock.escrow.toBase58()}`);
    finish("OK", `SENT single tx ${built.v0Bytes} B v0`);
    return;
  }

  if (txMode === "single") {
    finish("TX_TOO_LARGE", "no single-tx variant fits in 1232 B (use --mode two)");
    return;
  }

  // ---- two-transaction fallback
  console.log("\n[fallback: two transactions]");
  const quote = lastQuote ?? (await getQuote(inMint, mint.mint, amount, { slippageBps }));
  const swap = lastSwap ?? (await getSwapInstructions({ quote, user: fan.pubkey }));
  const alts = await fetchLookupTables(conn, swap.addressLookupTableAddresses);
  const tx1 = buildTx(
    fan.pubkey,
    [...cb(), ...swap.setupInstructions, swap.swapInstruction, ...(swap.cleanupInstruction ? [swap.cleanupInstruction] : []), ...swap.otherInstructions, memoIx()],
    alts,
    blockhash,
  );
  console.log(`  tx1 (swap -> fan ATA): ${describeSize(tx1)}`);
  const preFan = await snapshot(conn, fanAta, mint.programId);

  if (mode === "simulate") {
    const lock = planLock(mint, fan.pubkey, creator, lockAmountFor(mint, BigInt(quote.otherAmountThreshold)));
    const tx2 = buildTx(fan.pubkey, [...cb(), ...lock.ixs, memoIx()], [], blockhash);
    console.log(`  tx2 (lock):            ${describeSize(tx2)}`);
    printLockPlan(lock, quote);
    console.log("\n[simulate tx1]");
    const s1 = await simulate(conn, tx1, [fanAta]);
    printSim(s1, Boolean(values.logs));
    console.log("\n[simulate tx2] NOTE: runs against current state, i.e. WITHOUT tx1's output; it only proves structure if the fan already holds the T-Token");
    const s2 = await simulate(conn, tx2, [fanAta, lock.escrowToken, lock.escrow]);
    printSim(s2, Boolean(values.logs));
    if (s2.cls === "OK") reportEscrow(s2, lock, quote, preFan, mint);
    const worst = STRUCTURAL.includes(s1.cls) ? s1.cls : STRUCTURAL.includes(s2.cls) ? s2.cls : s1.cls !== "OK" ? s1.cls : s2.cls;
    finish(worst, `two txs: ${tx1.v0Bytes} B + ${tx2.v0Bytes} B`);
    return;
  }

  if (!fan.signer) throw new Error("No fan signer available");
  console.log("\n[send tx1]");
  await signAndSend(conn, tx1, [fan.signer]);
  const postFan = await snapshot(conn, fanAta, mint.programId);
  const received = postFan.amount - preFan.amount;
  console.log(`  fan received: ${fmt(received, mint.decimals)}`);
  await refreshChainNow(conn);
  const lock = planLock(mint, fan.pubkey, creator, lockAmountFor(mint, received));
  const { blockhash: bh2 } = await conn.getLatestBlockhash("confirmed");
  const tx2 = buildTx(fan.pubkey, [...cb(), ...lock.ixs, memoIx()], [], bh2);
  console.log(`  tx2 (lock): ${describeSize(tx2)}`);
  printLockPlan(lock, quote);
  console.log("\n[send tx2]");
  await signAndSend(conn, tx2, [fan.signer, lock.base]);
  await reportEscrowOnChain(conn, lock, mint);
  console.log(`\nclaim after cliff: pnpm tsx claim.ts --escrow ${lock.escrow.toBase58()}`);
  finish("OK", `SENT two txs: ${tx1.v0Bytes} B + ${tx2.v0Bytes} B`);

  // ---- reporting helpers
  function printLockPlan(lock: LockPlan, q: Quote) {
    console.log(`  escrow: ${lock.escrow.toBase58()}  escrow ATA: ${lock.escrowToken.toBase58()}  base: ${lock.base.publicKey.toBase58()}`);
    console.log(`  cliffTime: ${lock.cliffTime} (${new Date(Number(lock.cliffTime) * 1000).toISOString()})`);
    console.log(`  min out (otherAmountThreshold): ${fmt(BigInt(q.otherAmountThreshold), mint.decimals)}; cliffUnlockAmount: ${fmt(lock.amount, mint.decimals)}`);
  }
}

function reportEscrow(sim: SimReport, lock: LockPlan, quote: Quote, preFan: { amount: bigint }, mint: MintInfo) {
  // postAccounts order matches the watch list passed to simulate(): [fanAta, escrowToken, escrow]
  const fanPost = snapshotFromInfo(PublicKey.default, sim.postAccounts[0], mint.programId);
  const esc = snapshotFromInfo(lock.escrowToken, sim.postAccounts[1], mint.programId);
  const escrowState = sim.postAccounts[2] ? decodeEscrow(sim.postAccounts[2].data) : null;
  const owed = escrowState?.cliffUnlockAmount ?? lock.amount;
  console.log("\n[escrow accounting (simulated post-state)]");
  console.log(`  fan T-Token delta (swap in - deposit out): ${fmt(fanPost.amount - preFan.amount, mint.decimals)}  (quote out ${quote.outAmount}, min ${quote.otherAmountThreshold})`);
  console.log(`  escrow ATA balance:        ${fmt(esc.amount, mint.decimals)}`);
  console.log(`  escrow ATA withheld fee:   ${fmt(esc.withheld, mint.decimals)}`);
  console.log(`  escrow cliffUnlockAmount:  ${fmt(owed, mint.decimals)}`);
  if (escrowState) {
    console.log(`  escrow state: recipient=${escrowState.recipient.toBase58()} cancelMode=${escrowState.cancelMode} tokenProgramFlag=${escrowState.tokenProgramFlag} cliff=${escrowState.cliffTime}`);
  }
  const gap = esc.amount - owed;
  console.log(
    gap >= 0n
      ? `  => escrow is FULLY BACKED (balance - owed = ${gap}). Program ${esc.amount === owed ? "pulled a fee-inclusive gross from the sender" : "holds a surplus"}.`
      : `  => escrow is UNDER-BACKED by ${-gap} raw: a full claim of cliffUnlockAmount would fail. Use --lock-amount-mode net.`,
  );
  console.log(`  creator will receive on claim ~= ${fmt(owed - transferFee(mint, owed), mint.decimals)} (claim transfer pays the 20 bps fee again)`);
}

async function reportEscrowOnChain(conn: ReturnType<typeof connection>, lock: LockPlan, mint: MintInfo) {
  const esc = await snapshot(conn, lock.escrowToken, mint.programId);
  const info = await conn.getAccountInfo(lock.escrow, "confirmed");
  const state = info ? decodeEscrow(info.data) : null;
  console.log("\n[escrow on-chain]");
  console.log(`  escrow: ${lock.escrow.toBase58()}`);
  console.log(`  escrow ATA balance: ${fmt(esc.amount, mint.decimals)} (withheld ${esc.withheld})`);
  if (state) console.log(`  cliffUnlockAmount: ${fmt(state.cliffUnlockAmount, mint.decimals)}; backed: ${esc.amount >= state.cliffUnlockAmount}`);
}

function finish(cls: string, summary: string) {
  const structural = (STRUCTURAL as string[]).includes(cls);
  console.log(`\nVERDICT: ${cls}${structural ? " (STRUCTURAL)" : ""} | ${summary}`);
  if (structural) process.exitCode = 2;
}

main().catch((e) => {
  console.error(`\nFATAL: ${(e as Error).message}`);
  process.exitCode = 1;
});
