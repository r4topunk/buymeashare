// Spike 4: transfer SOL from the fan wallet to the creator wallet (for claim fees + ATA rent).
//
// pnpm tsx fund-creator.ts --sol 0.01          (simulate, default)
// pnpm tsx fund-creator.ts --sol 0.01 --send   (local surfnet; add --mainnet for REAL)
import { SystemProgram } from "@solana/web3.js";
import { CREATOR_KEYPAIR_PATH, FAN_KEYPAIR_PATH, banner, connection, loadKeypair, parseCli } from "./lib/config.js";
import { STRUCTURAL, buildTx, describeSize, memoIx, printSim, signAndSend, simulate } from "./lib/tx.js";
import { printSolBalance } from "./lib/wallets.js";

const { mode, values } = parseCli({ sol: { type: "string", default: "0.01" } });

async function main() {
  const conn = connection();
  banner("fund-creator: fan -> creator SOL transfer", mode);
  const fan = loadKeypair(FAN_KEYPAIR_PATH);
  const creator = loadKeypair(CREATOR_KEYPAIR_PATH).publicKey;
  const lamports = Math.round(Number(values.sol) * 1e9);
  if (!(lamports > 0)) throw new Error("--sol must be > 0");

  await printSolBalance(conn, "fan", fan.publicKey);
  await printSolBalance(conn, "creator", creator);
  console.log(`  amount: ${lamports} lamports`);

  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  const built = buildTx(
    fan.publicKey,
    [SystemProgram.transfer({ fromPubkey: fan.publicKey, toPubkey: creator, lamports }), memoIx()],
    [],
    blockhash,
  );
  console.log(`  tx: ${describeSize(built)}`);

  if (mode === "simulate") {
    const sim = await simulate(conn, built);
    printSim(sim);
    console.log(`\nVERDICT: ${sim.cls}${STRUCTURAL.includes(sim.cls) ? " (STRUCTURAL)" : ""}`);
    return;
  }
  await signAndSend(conn, built, [fan]);
  await printSolBalance(conn, "creator (after)", creator);
  console.log("\nVERDICT: SENT");
}

main().catch((e) => {
  console.error(`\nFATAL: ${(e as Error).message}`);
  process.exitCode = 1;
});
