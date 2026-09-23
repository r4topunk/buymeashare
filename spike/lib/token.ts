// Token-2022 helpers: transfer-fee math, account decoding (incl. withheld fees), ATA creation.
import {
  TOKEN_2022_PROGRAM_ID,
  calculateEpochFee,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  getMint,
  getTransferFeeAmount,
  getTransferFeeConfig,
  unpackAccount,
  type TransferFeeConfig,
} from "@solana/spl-token";
import { Connection, PublicKey, SystemProgram, type AccountInfo } from "@solana/web3.js";
import { USDC_MINT } from "./config.js";

export type MintInfo = {
  mint: PublicKey;
  programId: PublicKey;
  decimals: number;
  feeConfig: TransferFeeConfig | null;
  epoch: bigint;
};

export async function loadMint(conn: Connection, mint: PublicKey): Promise<MintInfo> {
  const info = await conn.getAccountInfo(mint);
  if (!info) throw new Error(`Mint ${mint.toBase58()} not found`);
  const programId = info.owner;
  const m = await getMint(conn, mint, "confirmed", programId);
  const epoch = BigInt((await conn.getEpochInfo()).epoch);
  return { mint, programId, decimals: m.decimals, feeConfig: getTransferFeeConfig(m), epoch };
}

/** Fee withheld when `gross` is transferred (Token-2022 rounds the fee up). */
export function transferFee(m: MintInfo, gross: bigint): bigint {
  return m.feeConfig ? calculateEpochFee(m.feeConfig, m.epoch, gross) : 0n;
}

export function feeBps(m: MintInfo): number {
  if (!m.feeConfig) return 0;
  const f = m.epoch >= m.feeConfig.newerTransferFee.epoch ? m.feeConfig.newerTransferFee : m.feeConfig.olderTransferFee;
  return f.transferFeeBasisPoints;
}

export function ata(mint: MintInfo, owner: PublicKey, offCurve = false): PublicKey {
  return getAssociatedTokenAddressSync(mint.mint, owner, offCurve, mint.programId);
}

export function createAtaIdempotentIx(payer: PublicKey, mint: MintInfo, owner: PublicKey, offCurve = false) {
  return createAssociatedTokenAccountIdempotentInstruction(payer, ata(mint, owner, offCurve), owner, mint.mint, mint.programId);
}

export type TokenSnapshot = { exists: boolean; amount: bigint; withheld: bigint };

export function snapshotFromInfo(address: PublicKey, info: AccountInfo<Buffer> | null, programId: PublicKey): TokenSnapshot {
  if (!info || info.data.length === 0) return { exists: false, amount: 0n, withheld: 0n };
  const acc = unpackAccount(address, info, programId);
  return { exists: true, amount: acc.amount, withheld: getTransferFeeAmount(acc)?.withheldAmount ?? 0n };
}

export async function snapshot(conn: Connection, address: PublicKey, programId: PublicKey): Promise<TokenSnapshot> {
  return snapshotFromInfo(address, await conn.getAccountInfo(address, "processed"), programId);
}

export function fmt(amount: bigint, decimals: number): string {
  const neg = amount < 0n;
  const a = neg ? -amount : amount;
  const s = a.toString().padStart(decimals + 1, "0");
  const out = `${s.slice(0, s.length - decimals)}.${s.slice(s.length - decimals)}`;
  return `${neg ? "-" : ""}${out} (${amount} raw)`;
}

/**
 * Picks a funded, on-curve, system-owned wallet (a large USDC holder) so that a
 * --simulate run can execute end-to-end with sigVerify:false. Simulation only:
 * nothing is ever signed or sent for this address.
 */
export async function findSimulationWallet(
  conn: Connection,
  minLamports = 100_000_000n,
  minUsdc = 10_000_000n,
): Promise<PublicKey> {
  // Public mainnet RPC rate-limits getTokenLargestAccounts(USDC), so we sample fee payers of
  // recent USDC transactions and keep the first one holding enough SOL + USDC.
  const sigs = await conn.getSignaturesForAddress(USDC_MINT, { limit: 25 });
  const seen = new Set<string>();
  for (const s of sigs) {
    if (s.err) continue;
    // Skip transactions this client cannot decode (e.g. newer tx versions).
    const tx = await conn
      .getTransaction(s.signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" })
      .catch(() => null);
    const payer = tx?.transaction.message.staticAccountKeys[0];
    if (!payer || seen.has(payer.toBase58())) continue;
    seen.add(payer.toBase58());
    const usdcAta = getAssociatedTokenAddressSync(USDC_MINT, payer, false);
    const [sys, usdc] = await conn.getMultipleAccountsInfo([payer, usdcAta]);
    if (!sys || !sys.owner.equals(SystemProgram.programId) || sys.data.length !== 0) continue;
    if (BigInt(sys.lamports) < minLamports || !usdc) continue;
    if (unpackAccount(usdcAta, usdc, usdc.owner).amount < minUsdc) continue;
    console.log(`  [--as auto] simulation wallet: ${payer.toBase58()} (${(sys.lamports / 1e9).toFixed(3)} SOL, has >= ${minUsdc / 1_000_000n} USDC)`);
    return payer;
  }
  throw new Error("No suitable simulation wallet found in recent USDC transactions; pass --as <pubkey>");
}

export { TOKEN_2022_PROGRAM_ID };
