// Token-2022 helpers: mint + transfer-fee math, ATA creation. Ported from ../spike/lib/token.ts.
import "./buffer";
import {
  calculateEpochFee,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  getMint,
  getTransferFeeConfig,
  type TransferFeeConfig,
} from "@solana/spl-token";
import type { Connection, PublicKey } from "@solana/web3.js";

export type MintInfo = {
  mint: PublicKey;
  programId: PublicKey;
  decimals: number;
  feeConfig: TransferFeeConfig | null;
  epoch: bigint;
};

export async function loadMint(conn: Connection, mint: PublicKey): Promise<MintInfo> {
  const [info, epochInfo] = await Promise.all([conn.getAccountInfo(mint), conn.getEpochInfo()]);
  if (!info) throw new Error(`Mint ${mint.toBase58()} not found`);
  const programId = info.owner;
  const m = await getMint(conn, mint, "confirmed", programId);
  return { mint, programId, decimals: m.decimals, feeConfig: getTransferFeeConfig(m), epoch: BigInt(epochInfo.epoch) };
}

/** Fee withheld when `gross` is transferred (Token-2022 rounds the fee up). */
export function transferFee(m: MintInfo, gross: bigint): bigint {
  return m.feeConfig ? calculateEpochFee(m.feeConfig, m.epoch, gross) : BigInt(0);
}

export function ata(mint: MintInfo, owner: PublicKey, offCurve = false): PublicKey {
  return getAssociatedTokenAddressSync(mint.mint, owner, offCurve, mint.programId);
}

export function createAtaIdempotentIx(payer: PublicKey, mint: MintInfo, owner: PublicKey, offCurve = false) {
  return createAssociatedTokenAccountIdempotentInstruction(payer, ata(mint, owner, offCurve), owner, mint.mint, mint.programId);
}
