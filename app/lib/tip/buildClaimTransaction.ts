import "@/lib/solana/buffer";
import type { Connection, PublicKey } from "@solana/web3.js";
import { formatCountdown } from "@/lib/lock";
import { defaultConnection } from "@/lib/solana/client";
import { LOCKER_PROGRAM_ID, claimV2Ix, claimableAmount, decodeEscrow, type EscrowState } from "@/lib/solana/lock";
import { ata, createAtaIdempotentIx, loadMint } from "@/lib/solana/token";
import { chainNow, compileV0, computeBudgetIxs, memoIx } from "@/lib/solana/tx";
import { tokenByMint, type TTokenId } from "@/lib/tokens";
import { TipError } from "./errors";
import { CLAIM_MEMO } from "./memo";
import type { BuildClaimParams, BuiltTransaction, TxDeps } from "./types";

const U64_MAX = (BigInt(1) << BigInt(64)) - BigInt(1);

export async function readEscrow(conn: Connection, escrow: PublicKey): Promise<{ state: EscrowState; lamports: number }> {
  const info = await conn.getAccountInfo(escrow, "confirmed");
  if (!info || !info.owner.equals(LOCKER_PROGRAM_ID)) {
    throw new TipError("ESCROW_NOT_FOUND", `Escrow ${escrow.toBase58()} not found (already closed?)`);
  }
  return { state: decodeEscrow(info.data), lamports: info.lamports };
}

/**
 * Creator claims an unlocked escrow (ported from ../spike/claim.ts):
 * [compute budget, create creator T-Token ATA (idempotent, creator pays), claimV2(max), memo CLAIM_MEMO].
 *
 * Throws TipError CLIFF_NOT_REACHED before the cliff (by the CHAIN clock): the program would accept the claim
 * but move 0 tokens, so we never build it. Also throws NOT_RECIPIENT / NOTHING_TO_CLAIM.
 */
export async function buildClaimTransaction(
  params: BuildClaimParams,
  deps: TxDeps = {},
): Promise<BuiltTransaction & { claimableRaw: bigint; token: TTokenId | null }> {
  const conn = deps.connection ?? defaultConnection();
  const [{ state: e }, now, latest] = await Promise.all([
    readEscrow(conn, params.escrow),
    chainNow(conn),
    conn.getLatestBlockhash("confirmed"),
  ]);
  if (!e.recipient.equals(params.recipient)) {
    throw new TipError("NOT_RECIPIENT", "Only the creator wallet this tip was locked for can claim it");
  }
  if (now < e.cliffTime) {
    throw new TipError("CLIFF_NOT_REACHED", `Still locked: unlocks ${formatCountdown(Number(e.cliffTime), Number(now))}`);
  }
  const claimable = claimableAmount(e, now);
  if (claimable === BigInt(0)) throw new TipError("NOTHING_TO_CLAIM", "Nothing left to claim in this escrow");

  const mint = await loadMint(conn, e.tokenMint);
  const ixs = [
    ...computeBudgetIxs(150_000),
    createAtaIdempotentIx(params.recipient, mint, params.recipient),
    claimV2Ix({
      escrow: params.escrow,
      mint: mint.mint,
      recipient: params.recipient,
      recipientToken: ata(mint, params.recipient),
      tokenProgram: mint.programId,
      maxAmount: U64_MAX,
    }),
    memoIx(CLAIM_MEMO),
  ];
  const compiled = compileV0(params.recipient, ixs, [], latest.blockhash);
  if (!compiled.transaction) throw new TipError("TX_TOO_LARGE", `Claim tx is ${compiled.bytes} B`);
  return {
    transaction: compiled.transaction,
    blockhash: latest.blockhash,
    lastValidBlockHeight: latest.lastValidBlockHeight,
    bytes: compiled.bytes,
    claimableRaw: claimable,
    token: tokenByMint(e.tokenMint.toBase58())?.id ?? null,
  };
}
