// Spike 1: fan pays SOL/USDC, Jupiter swaps into a T-Token delivered straight to the creator's
// Token-2022 ATA, in ONE transaction: [compute budget, create creator ATA (idempotent), Jupiter
// setup, Jupiter swap (destinationTokenAccount = creator ATA), Jupiter cleanup, memo].
//
// pnpm tsx swap-to-other.ts --in USDC --token openai --usd 1            (simulate, default)
// pnpm tsx swap-to-other.ts --in USDC --token openai --usd 1 --as auto  (simulate as a funded wallet)
// pnpm tsx swap-to-other.ts --in USDC --token openai --usd 1 --send     (local surfnet; add --mainnet for REAL)
import { PublicKey } from "@solana/web3.js";
import { CREATOR_KEYPAIR_PATH, banner, connection, loadKeypair, parseCli, tokenMint } from "./lib/config.js";
import { SHRINK_LADDER, getQuote, getSwapInstructions, routeLabel, usdToInputAmount } from "./lib/jupiter.js";
import { ata, createAtaIdempotentIx, feeBps, fmt, loadMint, snapshot, snapshotFromInfo, transferFee } from "./lib/token.js";
import {
  STRUCTURAL, buildTx, computeBudgetIxs, describeSize, fetchLookupTables, memoIx, printSim, signAndSend, simulate,
  type BuiltTx,
} from "./lib/tx.js";
import { fanActor, printSolBalance } from "./lib/wallets.js";

const { mode, values } = parseCli({
  in: { type: "string", default: "USDC" },
  token: { type: "string", default: "openai" },
  usd: { type: "string", default: "1" },
  "slippage-bps": { type: "string", default: "50" },
  cu: { type: "string", default: "300000" },
  "cu-price": { type: "string", default: "20000" }, // micro-lamports per CU
  as: { type: "string" },
  creator: { type: "string" },
  logs: { type: "boolean", default: false },
});

async function main() {
  const input = String(values.in).toUpperCase();
  if (input !== "SOL" && input !== "USDC") throw new Error("--in must be SOL or USDC");
  const conn = connection();
  banner("swap-to-other: tip -> T-Token delivered to creator", mode);

  const fan = await fanActor(conn, mode, values.as as string | undefined);
  const creator = values.creator ? new PublicKey(values.creator as string) : loadKeypair(CREATOR_KEYPAIR_PATH).publicKey;
  const mint = await loadMint(conn, tokenMint(String(values.token)));
  const creatorAta = ata(mint, creator);

  console.log("\n[accounts]");
  await printSolBalance(conn, `fan${fan.impersonated ? " (IMPERSONATED, simulation only)" : ""}`, fan.pubkey);
  await printSolBalance(conn, "creator", creator);
  console.log(`  T-Token mint: ${mint.mint.toBase58()} (${values.token}, program ${mint.programId.toBase58()}, ${mint.decimals} dec, fee ${feeBps(mint)} bps)`);
  console.log(`  creator Token-2022 ATA: ${creatorAta.toBase58()}`);

  const usd = Number(values.usd);
  const { mint: inMint, amount } = await usdToInputAmount(input, usd);
  console.log(`\n[input] $${usd} in ${input} = ${amount} base units`);

  // Build candidates along the shrink ladder until one fits in 1232 bytes.
  console.log("\n[tx size attempts]");
  let chosen: { built: BuiltTx; quote: Awaited<ReturnType<typeof getQuote>>; label: string } | null = null;
  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  for (const step of SHRINK_LADDER) {
    try {
      const quote = await getQuote(inMint, mint.mint, amount, { ...step.opts, slippageBps: Number(values["slippage-bps"]) });
      const swap = await getSwapInstructions({ quote, user: fan.pubkey, destinationTokenAccount: creatorAta });
      const ixs = [
        ...computeBudgetIxs(Number(values.cu), Number(values["cu-price"])),
        createAtaIdempotentIx(fan.pubkey, mint, creator),
        ...swap.setupInstructions,
        swap.swapInstruction,
        ...(swap.cleanupInstruction ? [swap.cleanupInstruction] : []),
        ...swap.otherInstructions,
        memoIx(),
      ];
      const alts = await fetchLookupTables(conn, swap.addressLookupTableAddresses);
      const built = buildTx(fan.pubkey, ixs, alts, blockhash);
      console.log(`  ${step.label.padEnd(18)} route=[${routeLabel(quote)}] out=${quote.outAmount} min=${quote.otherAmountThreshold} | ${describeSize(built)}`);
      if (built.fitsV0) {
        chosen = { built, quote, label: step.label };
        break;
      }
    } catch (e) {
      console.log(`  ${step.label.padEnd(18)} ERROR: ${(e as Error).message}`);
    }
  }
  if (!chosen) {
    console.log("\nVERDICT: TX_TOO_LARGE (STRUCTURAL) - no route variant fits in one transaction");
    process.exitCode = 2;
    return;
  }
  const { built, quote } = chosen;
  console.log(`\n[chosen] ${chosen.label}: ${built.v0Bytes} B v0 (fits one v0 tx: yes; fits one legacy tx: ${built.fitsLegacy ? "yes" : "no"} @ ${built.legacyBytes} B)`);
  console.log(`  quote outAmount: ${fmt(BigInt(quote.outAmount), mint.decimals)}  min (otherAmountThreshold): ${fmt(BigInt(quote.otherAmountThreshold), mint.decimals)}`);

  const pre = await snapshot(conn, creatorAta, mint.programId);

  if (mode === "simulate") {
    console.log("\n[simulate] sigVerify:false, replaceRecentBlockhash:true");
    const sim = await simulate(conn, built, [creatorAta]);
    printSim(sim, Boolean(values.logs));
    if (sim.cls === "OK") {
      const post = snapshotFromInfo(creatorAta, sim.postAccounts[0], mint.programId);
      report(pre.amount, post.amount, pre.withheld, post.withheld, BigInt(quote.outAmount));
    }
    console.log(`\nVERDICT: ${sim.cls}${STRUCTURAL.includes(sim.cls) ? " (STRUCTURAL)" : ""} | tx ${built.v0Bytes} B v0`);
    if (STRUCTURAL.includes(sim.cls)) process.exitCode = 2;
    return;
  }

  if (!fan.signer) throw new Error("No fan signer available");
  console.log("\n[send]");
  await signAndSend(conn, built, [fan.signer]);
  const post = await snapshot(conn, creatorAta, mint.programId);
  report(pre.amount, post.amount, pre.withheld, post.withheld, BigInt(quote.outAmount));
  console.log(`\nVERDICT: SENT | tx ${built.v0Bytes} B v0`);

  function report(preAmt: bigint, postAmt: bigint, preW: bigint, postW: bigint, quoted: bigint) {
    const received = postAmt - preAmt;
    const withheld = postW - preW;
    const gross = received + withheld;
    console.log("\n[creator result]");
    console.log(`  creator received (post - pre balance): ${fmt(received, mint.decimals)}`);
    console.log(`  transfer fee withheld in creator ATA:  ${fmt(withheld, mint.decimals)} (expected fee on gross ${gross}: ${transferFee(mint, gross)})`);
    console.log(`  quote.outAmount vs received: ${quoted} vs ${received} (diff ${received - quoted}); quote ${quoted === gross ? "is GROSS (pre-fee)" : quoted === received ? "is NET (post-fee)" : "matches neither exactly (price moved)"}`);
  }
}

main().catch((e) => {
  console.error(`\nFATAL: ${(e as Error).message}`);
  process.exitCode = 1;
});
