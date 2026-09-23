import { z } from "zod";
import { T_TOKEN_IDS } from "@/lib/tokens";
import type { LockList } from "./types";

/** Payload of GET /api/locks/[wallet]. Validated on the client. */
export const lockListSchema: z.ZodType<LockList> = z.object({
  locks: z.array(
    z.object({
      escrow: z.string(),
      token: z.enum(T_TOKEN_IDS),
      amount: z.number(),
      totalRaw: z.string(),
      claimedRaw: z.string(),
      unlockAt: z.number(),
      from: z.string(),
      recipient: z.string(),
      status: z.enum(["locked", "claimable", "claimed"]),
      claimable: z.boolean(),
      depositLamports: z.number(),
    }),
  ),
  chainTime: z.number(),
});

export const lockListErrorSchema = z.object({ error: z.string(), code: z.string().optional() });
