// Spike 3: the creator (escrow recipient) claims an unlocked Jupiter Lock escrow.
// Tx: [compute budget, create recipient ATA (idempotent, payer = recipient), claimV2(max), memo].
//
// pnpm tsx claim.ts --escrow <pubkey>                      (simulate as the creator keypair)
// pnpm tsx claim.ts --escrow <pubkey> --as recipient       (simulate as escrow.recipient, any escrow)
// pnpm tsx claim.ts --escrow <pubkey> --send               (local surfnet; add --mainnet for REAL; creator keypair signs)
import { PublicKey } from "@solana/web3.js";
import { CREATOR_KEYPAIR_PATH, banner, connection, loadKeypair, parseCli } from "./lib/config.js";
import { claimV2Ix, decodeEscrow, escrowTokenAccount, LOCKER_PROGRAM_ID, unlockedAmount } from "./lib/lock.js";
import { ata, createAtaIdempotentIx, fmt, loadMint, snapshot, snapshotFromInfo, transferFee } from "./lib/token.js";
import { STRUCTURAL, buildTx, computeBudgetIxs, describeSize, memoIx, printSim, signAndSend, simulate } from "./lib/tx.js";
import { printSolBalance } from "./lib/wallets.js";

const U64_MAX = (1n << 64n) - 1n;

const { mode, values } = parseCli({
  escrow: { type: "string" },
  as: { type: "string" }, // "recipient" or a pubkey (simulation only)
  cu: { type: "string", default: "150000" },
  "cu-price": { type: "string", default: "20000" },
  logs: { type: "boolean", default: false },
});

async function main() {
  if (!values.escrow) throw new Error("--escrow <pubkey> is required");
  const conn = connection();
  banner("claim: creator claims Jupiter Lock escrow", mode);

  const escrowPk = new PublicKey(values.escrow as string);
  const info = await conn.getAccountInfo(escrowPk, "confirmed");
  if (!info) throw new Error(`Escrow ${escrowPk.toBase58()} not found`);
  if (!info.owner.equals(LOCKER_PROGRAM_ID)) throw new Error(`Account is owned by ${info.owner.toBase58()}, not Jupiter Lock`);
  const e = decodeEscrow(info.data);
  const mint = await loadMint(conn, e.tokenMint);

  // Resolve who claims.
  let recipient: PublicKey;
  let signer = null as ReturnType<typeof loadKeypair> | null;
  if (values.as) {
    if (mode === "send") throw new Error("--as is simulation-only; refusing to combine it with --send");
    recipient = values.as === "recipient" ? e.recipient : new PublicKey(values.as as string);
  } else {
    signer = loadKeypair(CREATOR_KEYPAIR_PATH);
    recipient = signer.publicKey;
  }
  if (!recipient.equals(e.recipient)) {
    console.log(`  WARNING: claimer ${recipient.toBase58()} != escrow.recipient ${e.recipient.toBase58()} (claim will fail)`);
  }

  const slot = await conn.getSlot("confirmed");
  const now = BigInt((await conn.getBlockTime(slot)) ?? Math.floor(Date.now() / 1000));
  const unlocked = unlockedAmount(e, now);
  const claimable = unlocked > e.totalClaimedAmount ? unlocked - e.totalClaimedAmount : 0n;
  const escrowToken = escrowTokenAccount(escrowPk, mint.mint, mint.programId);
  const recipientAta = ata(mint, recipient);

  console.log("\n[escrow]");
  console.log(`  escrow: ${escrowPk.toBase58()} mint: ${mint.mint.toBase58()} tokenProgramFlag=${e.tokenProgramFlag}`);
  console.log(`  recipient: ${e.recipient.toBase58()} creator: ${e.creator.toBase58()} cancelMode=${e.cancelMode}`);
  console.log(`  cliffTime: ${e.cliffTime} (${new Date(Number(e.cliffTime) * 1000).toISOString()}); chain time ${now}; ${now >= e.cliffTime ? "cliff REACHED" : `cliff in ${e.cliffTime - now}s`}`);
  console.log(`  cliffUnlockAmount: ${fmt(e.cliffUnlockAmount, mint.decimals)}; totalClaimed: ${fmt(e.totalClaimedAmount, mint.decimals)}; claimable now: ${fmt(claimable, mint.decimals)}`);
  const escBal = await snapshot(conn, escrowToken, mint.programId);
  console.log(`  escrow ATA ${escrowToken.toBase58()} balance: ${fmt(escBal.amount, mint.decimals)}`);
  await printSolBalance(conn, "claimer", recipient);

  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  const ixs = [
    ...computeBudgetIxs(Number(values.cu), Number(values["cu-price"])),
    createAtaIdempotentIx(recipient, mint, recipient),
    claimV2Ix({ escrow: escrowPk, mint: mint.mint, recipient, recipientToken: recipientAta, tokenProgram: mint.programId, maxAmount: U64_MAX }),
    memoIx(),
  ];
  const built = buildTx(recipient, ixs, [], blockhash);
  console.log(`\n[tx] ${describeSize(built)}`);
  const pre = await snapshot(conn, recipientAta, mint.programId);

  const report = (postAmt: bigint, postW: bigint) => {
    const received = postAmt - pre.amount;
    console.log("\n[claim result]");
    console.log(`  creator received: ${fmt(received, mint.decimals)}`);
    console.log(`  fee withheld on claim transfer: ${fmt(postW - pre.withheld, mint.decimals)} (expected on ${claimable}: ${transferFee(mint, claimable)})`);
  };

  if (mode === "simulate") {
    console.log("\n[simulate] sigVerify:false, replaceRecentBlockhash:true");
    const sim = await simulate(conn, built, [recipientAta]);
    printSim(sim, Boolean(values.logs));
    if (sim.cls === "OK") {
      const post = snapshotFromInfo(recipientAta, sim.postAccounts[0], mint.programId);
      report(post.amount, post.withheld);
    }
    const note = now < e.cliffTime ? " (cliff not reached yet: nothing claimable)" : "";
    console.log(`\nVERDICT: ${sim.cls}${STRUCTURAL.includes(sim.cls) ? " (STRUCTURAL)" : ""}${note} | tx ${built.v0Bytes} B`);
    return;
  }

  if (!signer) throw new Error("No creator signer available");
  if (!signer.publicKey.equals(e.recipient)) throw new Error("Creator keypair is not the escrow recipient; refusing to send");
  if (claimable === 0n) throw new Error("Nothing claimable yet; refusing to send");
  console.log("\n[send]");
  await signAndSend(conn, built, [signer]);
  const post = await snapshot(conn, recipientAta, mint.programId);
  report(post.amount, post.withheld);
  console.log(`\nVERDICT: SENT | tx ${built.v0Bytes} B`);
}

main().catch((e) => {
  console.error(`\nFATAL: ${(e as Error).message}`);
  process.exitCode = 1;
});
