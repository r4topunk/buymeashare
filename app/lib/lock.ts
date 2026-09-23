import { z } from "zod";
import { publicEnv } from "@/lib/env";

/**
 * Tip lock duration: free choice of an integer + unit, or no lock (default). Single source of truth for
 * units, limits, labels and the escrow deposit. Never hardcode a lock duration or its label elsewhere.
 */

const DAY = 24 * 60 * 60;
/** Calendar-free units: a month is 30 days, a year 365 days. */
export const LOCK_UNIT_SECONDS = { days: DAY, months: 30 * DAY, years: 365 * DAY } as const;
export type LockUnit = keyof typeof LOCK_UNIT_SECONDS;
export const LOCK_UNITS = Object.keys(LOCK_UNIT_SECONDS) as [LockUnit, ...LockUnit[]];

/** Longest allowed lock: 5 years (5 x 365 days). */
export const MAX_LOCK_SECONDS = 5 * LOCK_UNIT_SECONDS.years;

/** Demo override (NEXT_PUBLIC_DEMO_LOCK_SECONDS): adds a "demo" unit that locks for exactly this many seconds. */
export const DEMO_LOCK_SECONDS: number | null = publicEnv.NEXT_PUBLIC_DEMO_LOCK_SECONDS ?? null;

/** What the UI / Blink offers: "none" (default), a real unit, or "demo" when the env override is set. */
export type LockChoiceUnit = "none" | LockUnit | "demo";

export type LockChoice = { unit: LockChoiceUnit; amount: number };
export const NO_LOCK: LockChoice = { unit: "none", amount: 0 };

export const lockChoiceSchema = z
  .object({
    unit: z.enum(["none", ...LOCK_UNITS, "demo"]),
    amount: z.coerce.number().int().nonnegative().default(0),
  })
  .superRefine((c, ctx) => {
    if (c.unit === "demo" && DEMO_LOCK_SECONDS == null) {
      ctx.addIssue({ code: "custom", message: "Demo lock is disabled" });
    }
  });

/**
 * Lock duration in seconds for a choice, or null for "no lock". Throws on invalid input
 * (non-integer, < 1, or longer than 5 years).
 */
export function lockSecondsFor(choice: LockChoice): number | null {
  if (choice.unit === "none") return null;
  if (choice.unit === "demo") {
    if (DEMO_LOCK_SECONDS == null) throw new Error("Demo lock is disabled (NEXT_PUBLIC_DEMO_LOCK_SECONDS is not set)");
    return DEMO_LOCK_SECONDS;
  }
  if (!Number.isInteger(choice.amount) || choice.amount < 1) throw new Error("Lock duration must be a whole number of at least 1");
  const seconds = choice.amount * LOCK_UNIT_SECONDS[choice.unit];
  if (seconds > MAX_LOCK_SECONDS) throw new Error("Lock duration can be at most 5 years");
  return seconds;
}

/** Non-throwing validation message for a choice, or null when valid. */
export function lockChoiceError(choice: LockChoice): string | null {
  try {
    lockSecondsFor(choice);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** Largest integer amount allowed for a unit (5 years). */
export function maxLockAmount(unit: LockUnit): number {
  return Math.floor(MAX_LOCK_SECONDS / LOCK_UNIT_SECONDS[unit]);
}

const LABEL_UNITS: Array<[seconds: number, singular: string]> = [
  [365 * DAY, "year"],
  [30 * DAY, "month"],
  [7 * DAY, "week"],
  [DAY, "day"],
  [60 * 60, "hour"],
  [60, "minute"],
  [1, "second"],
];

/** Human label for a duration: 15552000 -> "6 months", 120 -> "2 minutes". Uses the largest unit that divides evenly. */
export function formatLockDuration(seconds: number): string {
  for (const [unit, name] of LABEL_UNITS) {
    if (seconds >= unit && seconds % unit === 0) {
      const n = seconds / unit;
      return `${n} ${name}${n === 1 ? "" : "s"}`;
    }
  }
  return `${seconds} seconds`;
}

/** "in 3 days" / "in 2 minutes" style countdown for an unlock time (both in unix seconds). */
export function formatCountdown(targetSec: number, nowSec: number): string {
  const left = Math.max(0, Math.round(targetSec - nowSec));
  if (left === 0) return "now";
  const [unit, name] = LABEL_UNITS.find(([u]) => left >= u) ?? [1, "second"];
  const n = Math.floor(left / unit);
  return `in ${n} ${name}${n === 1 ? "" : "s"}`;
}

/**
 * Rent the fan pays per locked tip, measured on a mainnet fork: escrow account (296 B) 2,951,040 +
 * escrow Token-2022 ATA 2,157,600 lamports. Returned to the fan by closeVestingEscrow after the creator claims.
 */
export const ESCROW_DEPOSIT_LAMPORTS = 2_951_040 + 2_157_600;
export const ESCROW_DEPOSIT_SOL = ESCROW_DEPOSIT_LAMPORTS / 1e9;
