// Resolves which wallets a script acts as. Keypairs are loaded in-process only.
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { CREATOR_KEYPAIR_PATH, FAN_KEYPAIR_PATH, loadKeypair, type Mode } from "./config.js";
import { findSimulationWallet } from "./token.js";

export type Actor = { pubkey: PublicKey; signer: Keypair | null; impersonated: boolean };

/**
 * --as <pubkey|auto> impersonates a funded wallet for SIMULATION ONLY (sigVerify:false),
 * so the whole instruction chain executes instead of stopping at "insufficient funds".
 */
export async function resolveActor(
  conn: Connection,
  mode: Mode,
  keypairPath: string,
  as: string | undefined,
): Promise<Actor> {
  if (as) {
    if (mode === "send") throw new Error("--as is simulation-only; refusing to combine it with --send");
    const pubkey = as === "auto" ? await findSimulationWallet(conn) : new PublicKey(as);
    return { pubkey, signer: null, impersonated: true };
  }
  const kp = loadKeypair(keypairPath);
  return { pubkey: kp.publicKey, signer: kp, impersonated: false };
}

export const fanActor = (conn: Connection, mode: Mode, as?: string) => resolveActor(conn, mode, FAN_KEYPAIR_PATH, as);
export const creatorActor = (conn: Connection, mode: Mode, as?: string) =>
  resolveActor(conn, mode, CREATOR_KEYPAIR_PATH, as);

export async function printSolBalance(conn: Connection, label: string, pk: PublicKey) {
  const lamports = await conn.getBalance(pk, "processed");
  console.log(`  ${label}: ${pk.toBase58()} (${(lamports / 1e9).toFixed(6)} SOL)`);
  return lamports;
}
