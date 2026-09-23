// Jupiter Lock (program "locker" v0.4.0) instruction builders, hand-encoded from the IDL.
//
// Source of truth: github.com/jup-ag/lock-sdk, src/locker/idl.ts
//   IDL.address = "LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn" (also declare_id! for mainnet in the
//   program source forks). Verified executable on mainnet (BPFLoaderUpgradeable) on 2026-09-23.
// We do not depend on the npm package: the repo's package.json publishes as
// "@dongnguyen91861/locker-sdk" (not "@jup-ag/..."), and its createVestingPlan helper creates
// ATAs with the legacy SPL Token program, which is wrong for Token-2022 mints.
import { ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { MEMO_PROGRAM_ID } from "./config.js";

export const LOCKER_PROGRAM_ID = new PublicKey("LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn");

const DISC_CREATE_VESTING_ESCROW_V2 = Buffer.from([181, 155, 104, 183, 182, 128, 35, 47]);
const DISC_CLAIM_V2 = Buffer.from([229, 87, 46, 162, 21, 157, 231, 114]);
const DISC_VESTING_ESCROW_ACCOUNT = Buffer.from([244, 119, 183, 4, 73, 116, 135, 195]);

export const CANCEL_MODE_NONE = 0;
export const UPDATE_RECIPIENT_MODE_NONE = 0;

export const LOCKER_ERRORS: Record<number, string> = {
  6000: "mathOverflow", 6001: "frequencyIsZero", 6002: "invalidEscrowTokenAddress",
  6003: "invalidUpdateRecipientMode", 6004: "invalidCancelMode", 6005: "notPermitToDoThisAction",
  6006: "invalidRecipientTokenAccount", 6007: "invalidCreatorTokenAccount", 6008: "invalidEscrowMetadata",
  6009: "invalidVestingStartTime", 6010: "alreadyCancelled", 6011: "cancelledAtIsZero",
  6012: "incorrectTokenProgramId", 6013: "transferFeeCalculationFailure", 6014: "unsupportedMint",
  6015: "invalidRemainingAccountSlice", 6016: "insufficientRemainingAccounts",
  6017: "duplicatedRemainingAccountTypes", 6018: "noTransferHookProgram", 6019: "claimingIsNotFinished",
  6020: "invalidMerkleProof", 6021: "escrowNotCancelled", 6022: "amountIsZero", 6023: "invalidParams",
};

export function deriveEscrow(base: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("escrow"), base.toBuffer()], LOCKER_PROGRAM_ID)[0];
}

export function deriveEventAuthority(): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("__event_authority")], LOCKER_PROGRAM_ID)[0];
}

export function escrowTokenAccount(escrow: PublicKey, mint: PublicKey, tokenProgram: PublicKey): PublicKey {
  // IDL: pda seeds [escrow, tokenProgram, tokenMint] under the ATA program == ATA(owner=escrow, off-curve).
  return getAssociatedTokenAddressSync(mint, escrow, true, tokenProgram, ASSOCIATED_TOKEN_PROGRAM_ID);
}

const u64 = (v: bigint) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(v);
  return b;
};

// Option<RemainingAccountsInfo> = Some({ slices: [] }), mirroring what lock-sdk sends.
const REMAINING_ACCOUNTS_SOME_EMPTY = Buffer.from([1, 0, 0, 0, 0]);

export type VestingParams = {
  vestingStartTime: bigint;
  cliffTime: bigint;
  frequency: bigint;
  cliffUnlockAmount: bigint;
  amountPerPeriod: bigint;
  numberOfPeriod: bigint;
  updateRecipientMode: number;
  cancelMode: number;
};

export function createVestingEscrowV2Ix(a: {
  base: PublicKey;
  mint: PublicKey;
  sender: PublicKey;
  senderToken: PublicKey;
  recipient: PublicKey;
  tokenProgram: PublicKey;
  params: VestingParams;
}): { ix: TransactionInstruction; escrow: PublicKey; escrowToken: PublicKey } {
  const escrow = deriveEscrow(a.base);
  const escrowToken = escrowTokenAccount(escrow, a.mint, a.tokenProgram);
  const p = a.params;
  const data = Buffer.concat([
    DISC_CREATE_VESTING_ESCROW_V2,
    u64(p.vestingStartTime), u64(p.cliffTime), u64(p.frequency), u64(p.cliffUnlockAmount),
    u64(p.amountPerPeriod), u64(p.numberOfPeriod),
    Buffer.from([p.updateRecipientMode, p.cancelMode]),
    REMAINING_ACCOUNTS_SOME_EMPTY,
  ]);
  // Account order and flags exactly as in IDL instruction "createVestingEscrowV2".
  const keys = [
    { pubkey: a.base, isSigner: true, isWritable: true },
    { pubkey: escrow, isSigner: false, isWritable: true },
    { pubkey: a.mint, isSigner: false, isWritable: false },
    { pubkey: escrowToken, isSigner: false, isWritable: true },
    { pubkey: a.sender, isSigner: true, isWritable: true },
    { pubkey: a.senderToken, isSigner: false, isWritable: true },
    { pubkey: a.recipient, isSigner: false, isWritable: false },
    { pubkey: a.tokenProgram, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: deriveEventAuthority(), isSigner: false, isWritable: false },
    { pubkey: LOCKER_PROGRAM_ID, isSigner: false, isWritable: false },
  ];
  return { ix: new TransactionInstruction({ programId: LOCKER_PROGRAM_ID, keys, data }), escrow, escrowToken };
}

export function claimV2Ix(a: {
  escrow: PublicKey;
  mint: PublicKey;
  recipient: PublicKey;
  recipientToken: PublicKey;
  tokenProgram: PublicKey;
  maxAmount: bigint;
}): TransactionInstruction {
  const data = Buffer.concat([DISC_CLAIM_V2, u64(a.maxAmount), REMAINING_ACCOUNTS_SOME_EMPTY]);
  // Account order and flags exactly as in IDL instruction "claimV2".
  const keys = [
    { pubkey: a.escrow, isSigner: false, isWritable: true },
    { pubkey: a.mint, isSigner: false, isWritable: false },
    { pubkey: escrowTokenAccount(a.escrow, a.mint, a.tokenProgram), isSigner: false, isWritable: true },
    { pubkey: a.recipient, isSigner: true, isWritable: true },
    { pubkey: a.recipientToken, isSigner: false, isWritable: true },
    { pubkey: MEMO_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: a.tokenProgram, isSigner: false, isWritable: false },
    { pubkey: deriveEventAuthority(), isSigner: false, isWritable: false },
    { pubkey: LOCKER_PROGRAM_ID, isSigner: false, isWritable: false },
  ];
  return new TransactionInstruction({ programId: LOCKER_PROGRAM_ID, keys, data });
}

export type EscrowState = {
  recipient: PublicKey;
  tokenMint: PublicKey;
  creator: PublicKey;
  base: PublicKey;
  cancelMode: number;
  tokenProgramFlag: number; // 0 = SPL Token, 1 = Token-2022
  cliffTime: bigint;
  frequency: bigint;
  cliffUnlockAmount: bigint;
  amountPerPeriod: bigint;
  numberOfPeriod: bigint;
  totalClaimedAmount: bigint;
  vestingStartTime: bigint;
  cancelledAt: bigint;
};

/** Decodes a VestingEscrow account (bytemuck/repr(C) layout from the IDL). */
export function decodeEscrow(data: Buffer): EscrowState {
  if (!data.subarray(0, 8).equals(DISC_VESTING_ESCROW_ACCOUNT)) throw new Error("Not a VestingEscrow account");
  const pk = (o: number) => new PublicKey(data.subarray(o, o + 32));
  const r = (o: number) => data.readBigUInt64LE(o);
  return {
    recipient: pk(8), tokenMint: pk(40), creator: pk(72), base: pk(104),
    cancelMode: data[138], tokenProgramFlag: data[139],
    cliffTime: r(144), frequency: r(152), cliffUnlockAmount: r(160), amountPerPeriod: r(168),
    numberOfPeriod: r(176), totalClaimedAmount: r(184), vestingStartTime: r(192), cancelledAt: r(200),
  };
}

/** Mirrors the program's unlocked-amount schedule: cliff unlock + linear periods after the cliff. */
export function unlockedAmount(e: EscrowState, nowSec: bigint): bigint {
  if (nowSec < e.cliffTime) return 0n;
  const periods = e.frequency === 0n ? 0n : (nowSec - e.cliffTime) / e.frequency;
  const n = periods < e.numberOfPeriod ? periods : e.numberOfPeriod;
  return e.cliffUnlockAmount + n * e.amountPerPeriod;
}

const DISC_CLOSE_VESTING_ESCROW = Buffer.from([221, 185, 95, 135, 136, 67, 252, 87]);

export function deriveEscrowMetadata(escrow: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("escrow_metadata"), escrow.toBuffer()], LOCKER_PROGRAM_ID)[0];
}

/**
 * closeVestingEscrow: after the recipient claimed everything, the escrow CREATOR (the fan/sender)
 * closes the escrow + escrow ATA (+ metadata if any) and receives the rent. Leftover tokens go to creatorToken.
 */
export function closeVestingEscrowIx(a: {
  escrow: PublicKey;
  mint: PublicKey;
  creator: PublicKey;
  creatorToken: PublicKey;
  tokenProgram: PublicKey;
}): TransactionInstruction {
  const data = Buffer.concat([DISC_CLOSE_VESTING_ESCROW, REMAINING_ACCOUNTS_SOME_EMPTY]);
  // Account order and flags exactly as in IDL instruction "closeVestingEscrow".
  const keys = [
    { pubkey: a.escrow, isSigner: false, isWritable: true },
    { pubkey: deriveEscrowMetadata(a.escrow), isSigner: false, isWritable: true },
    { pubkey: a.mint, isSigner: false, isWritable: true },
    { pubkey: escrowTokenAccount(a.escrow, a.mint, a.tokenProgram), isSigner: false, isWritable: true },
    { pubkey: a.creatorToken, isSigner: false, isWritable: true },
    { pubkey: a.creator, isSigner: true, isWritable: true },
    { pubkey: a.tokenProgram, isSigner: false, isWritable: false },
    { pubkey: MEMO_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: deriveEventAuthority(), isSigner: false, isWritable: false },
    { pubkey: LOCKER_PROGRAM_ID, isSigner: false, isWritable: false },
  ];
  return new TransactionInstruction({ programId: LOCKER_PROGRAM_ID, keys, data });
}
