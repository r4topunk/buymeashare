// Spike 5 (rent recovery): after the creator claimed everything, the escrow's creator (the FAN,
// who paid the rent) closes the escrow + escrow ATA and gets the rent back.
//
// pnpm tsx close-escrow.ts --escrow <pubkey>          (simulate, default)
// pnpm tsx close-escrow.ts --escrow <pubkey> --send   (local surfnet; add --mainnet for real)
import { PublicKey } from "@solana/web3.js";
import { banner, connection, parseCli } from "./lib/config.js";
import { LOCKER_PROGRAM_ID, closeVestingEscrowIx, decodeEscrow, escrowTokenAccount } from "./lib/lock.js";
import { ata, createAtaIdempotentIx, loadMint } from "./lib/token.js";
import { STRUCTURAL, buildTx, computeBudgetIxs, describeSize, memoIx, printSim, signAndSend, simulate } from "./lib/tx.js";
import { fanActor } from "./lib/wallets.js";

const { mode, values } = parseCli({
  escrow: { type: "string" },
  as: { type: "string" },
  "cu-price": { type: "string", default: "20000" },
  logs: { type: "boolean", default: false },
});

async function main() {
  if (!values.escrow) throw new Error("--escrow <pubkey> is required");
  const conn = connection();
  banner("close-escrow: fan recovers escrow rent", mode);
  const escrowPk = new PublicKey(values.escrow as string);
  const info = await conn.getAccountInfo(escrowPk, "confirmed");
  if (!info || !info.owner.equals(LOCKER_PROGRAM_ID)) throw new Error("Not a Jupiter Lock escrow (or already closed)");
  const e = decodeEscrow(info.data);
  const mint = await loadMint(conn, e.tokenMint);
  const fan = await fanActor(conn, mode, (values.as as string | undefined) ?? (mode === "simulate" ? e.creator.toBase58() : undefined));
  if (!fan.pubkey.equals(e.creator)) throw new Error(`Signer ${fan.pubkey.toBase58()} is not the escrow creator ${e.creator.toBase58()}`);

  const escrowToken = escrowTokenAccount(escrowPk, mint.mint, mint.programId);
  const [escInfo, escTokInfo] = await conn.getMultipleAccountsInfo([escrowPk, escrowToken]);
  const rent = (escInfo?.lamports ?? 0) + (escTokInfo?.lamports ?? 0);
  console.log(`  escrow ${escrowPk.toBase58()} totalClaimed=${e.totalClaimedAmount} / ${e.cliffUnlockAmount}`);
  console.log(`  rent locked: escrow ${escInfo?.lamports ?? 0} + escrow ATA ${escTokInfo?.lamports ?? 0} = ${rent} lamports (${rent / 1e9} SOL)`);

  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  const built = buildTx(
    fan.pubkey,
    [
      ...computeBudgetIxs(100_000, Number(values["cu-price"])),
      createAtaIdempotentIx(fan.pubkey, mint, fan.pubkey),
      closeVestingEscrowIx({ escrow: escrowPk, mint: mint.mint, creator: fan.pubkey, creatorToken: ata(mint, fan.pubkey), tokenProgram: mint.programId }),
      memoIx(),
    ],
    [],
    blockhash,
  );
  console.log(`  tx: ${describeSize(built)}`);
  const pre = await conn.getBalance(fan.pubkey, "processed");

  if (mode === "simulate") {
    const sim = await simulate(conn, built, [fan.pubkey]);
    printSim(sim, Boolean(values.logs));
    if (sim.cls === "OK" && sim.postAccounts[0]) console.log(`  fan lamports delta (rent back - fee): ${sim.postAccounts[0].lamports - pre}`);
    console.log(`\nVERDICT: ${sim.cls}${STRUCTURAL.includes(sim.cls) ? " (STRUCTURAL)" : ""}`);
    return;
  }
  if (!fan.signer) throw new Error("No fan signer available");
  await signAndSend(conn, built, [fan.signer]);
  const post = await conn.getBalance(fan.pubkey, "processed");
  const gone = (await conn.getAccountInfo(escrowPk, "processed")) === null;
  console.log(`  fan lamports delta (rent back - fee): ${post - pre}; escrow closed: ${gone}`);
  console.log("\nVERDICT: SENT");
}

main().catch((err) => {
  console.error(`\nFATAL: ${(err as Error).message}`);
  process.exitCode = 1;
});
