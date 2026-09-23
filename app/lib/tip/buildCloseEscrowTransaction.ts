import "@/lib/solana/buffer";
import { defaultConnection } from "@/lib/solana/client";
import { closeVestingEscrowIx, escrowTokenAccount, escrowTotal } from "@/lib/solana/lock";
import { ata, createAtaIdempotentIx, loadMint } from "@/lib/solana/token";
import { compileV0, computeBudgetIxs, memoIx } from "@/lib/solana/tx";
import { readEscrow } from "./buildClaimTransaction";
import { TipError } from "./errors";
import { CLOSE_MEMO } from "./memo";
import type { BuildCloseParams, BuiltTransaction, TxDeps } from "./types";

/**
 * Fan reclaims the escrow deposit (rent) after the creator claimed everything (ported from ../spike/close-escrow.ts):
 * [compute budget, fan T-Token ATA (idempotent), closeVestingEscrow, memo CLOSE_MEMO]. Only the escrow creator can sign it.
 * Throws NOT_ESCROW_CREATOR / NOT_FULLY_CLAIMED instead of building a tx that would fail.
 */
export async function buildCloseEscrowTransaction(
  params: BuildCloseParams,
  deps: TxDeps = {},
): Promise<BuiltTransaction & { refundLamports: number }> {
  const conn = deps.connection ?? defaultConnection();
  const [{ state: e, lamports }, latest] = await Promise.all([readEscrow(conn, params.escrow), conn.getLatestBlockhash("confirmed")]);
  if (!e.creator.equals(params.sender)) {
    throw new TipError("NOT_ESCROW_CREATOR", "Only the wallet that sent this locked tip can reclaim its deposit");
  }
  if (e.totalClaimedAmount < escrowTotal(e)) {
    throw new TipError("NOT_FULLY_CLAIMED", "The creator has not claimed this tip yet; the deposit is returned after the claim");
  }
  const mint = await loadMint(conn, e.tokenMint);
  const escrowAta = escrowTokenAccount(params.escrow, mint.mint, mint.programId);
  const ataInfo = await conn.getAccountInfo(escrowAta, "confirmed");
  const ixs = [
    ...computeBudgetIxs(100_000),
    createAtaIdempotentIx(params.sender, mint, params.sender),
    closeVestingEscrowIx({
      escrow: params.escrow,
      mint: mint.mint,
      creator: params.sender,
      creatorToken: ata(mint, params.sender),
      tokenProgram: mint.programId,
    }),
    memoIx(CLOSE_MEMO),
  ];
  const compiled = compileV0(params.sender, ixs, [], latest.blockhash);
  if (!compiled.transaction) throw new TipError("TX_TOO_LARGE", `Close tx is ${compiled.bytes} B`);
  return {
    transaction: compiled.transaction,
    blockhash: latest.blockhash,
    lastValidBlockHeight: latest.lastValidBlockHeight,
    bytes: compiled.bytes,
    refundLamports: lamports + (ataInfo?.lamports ?? 0),
  };
}
