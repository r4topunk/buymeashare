import { PublicKey } from "@solana/web3.js";
import { z } from "zod";
import {
  ACTIONS_CORS_HEADERS,
  type ActionError,
  type ActionGetResponse,
  type ActionParameter,
  type ActionPostResponse,
} from "@/lib/actions/spec";
import { PRODUCT_NAME, TESSERA_LOCK_WARNING, TESSERA_LOCK_WARNING_FULL, TESSERA_NOTICE } from "@/lib/brand";
import { siteUrl } from "@/lib/env";
import { formatUsd, shortAddress } from "@/lib/format";
import { DEMO_LOCK_SECONDS, ESCROW_DEPOSIT_SOL, LOCK_UNITS, formatLockDuration, lockSecondsFor } from "@/lib/lock";
import { tipQuerySchema, walletSchema } from "@/lib/schemas";
import { Buffer } from "@/lib/solana/buffer";
import { serverConnection } from "@/lib/solana/connection";
import { buildTipTransaction, errorMessage, isTipError } from "@/lib/tip";
import { DEFAULT_TIP_USD, MIN_LOCKED_TIP_USD, MIN_TIP_USD, PAY_ASSET_IDS, T_TOKENS, T_TOKEN_IDS, tokenById } from "@/lib/tokens";

export const dynamic = "force-dynamic";

function error(message: string, status: number) {
  return Response.json({ message } satisfies ActionError, { status, headers: ACTIONS_CORS_HEADERS });
}

const LOCK_UNIT_OPTIONS = [
  { label: "No lock", value: "none" },
  { label: "Days", value: "days" },
  { label: "Months", value: "months" },
  { label: "Years", value: "years" },
  ...(DEMO_LOCK_SECONDS != null ? [{ label: `Demo (${formatLockDuration(DEMO_LOCK_SECONDS)})`, value: "demo" }] : []),
];

/** Blink metadata for /tip/<wallet>: one "Tip" action with token, amount, pay-with and an optional lock. */
export async function GET(req: Request, ctx: RouteContext<"/api/actions/tip/[wallet]">) {
  const parsed = walletSchema.safeParse((await ctx.params).wallet);
  if (!parsed.success) return error("Invalid creator wallet", 400);
  const wallet = parsed.data;
  const url = new URL(req.url);
  const q = tipQuerySchema.parse(Object.fromEntries(url.searchParams));
  const who = q.name ?? shortAddress(wallet);
  const nameQs = q.name ? `&name=${encodeURIComponent(q.name)}` : "";

  const parameters: ActionParameter[] = [
    {
      type: "select",
      name: "token",
      label: "Token",
      required: true,
      options: T_TOKENS.map((t) => ({ label: t.symbol, value: t.id, selected: t.id === (q.token ?? T_TOKENS[0].id) })),
    },
    {
      type: "number",
      name: "amount",
      label: `Amount in USD (default ${DEFAULT_TIP_USD}; min ${MIN_TIP_USD}, locked min ${MIN_LOCKED_TIP_USD})`,
      required: true,
      min: MIN_TIP_USD,
      patternDescription: `At least $${MIN_TIP_USD} ($${MIN_LOCKED_TIP_USD} when locked)`,
    },
    {
      type: "select",
      name: "payWith",
      label: "Pay with",
      required: true,
      options: PAY_ASSET_IDS.map((id, i) => ({ label: id, value: id, selected: i === 0 })),
    },
    {
      type: "number",
      name: "lockAmount",
      label: "Lock for (optional, whole number, max 5 years)",
      required: false,
      min: 1,
    },
    {
      type: "select",
      name: "lockUnit",
      label: "Lock unit",
      required: false,
      options: LOCK_UNIT_OPTIONS.map((o, i) => ({ ...o, selected: i === 0 })),
    },
  ];
  const href = `/api/actions/tip/${wallet}?token={token}&amount={amount}&payWith={payWith}&lockAmount={lockAmount}&lockUnit={lockUnit}${nameQs}`;

  const body: ActionGetResponse = {
    type: "action",
    icon: `${url.origin}/api/og?wallet=${wallet}&size=square${nameQs}`,
    title: `Tip ${who}${q.name ? " (unverified name)" : ""} · ${PRODUCT_NAME}`,
    description:
      `Pay with SOL or USDC; ${who} receives a Tessera pre-IPO T-Token. Includes 0.2% token transfer fee. Creator wallet: ${wallet}. ` +
      `Optional lock (up to 5 years): min $${MIN_LOCKED_TIP_USD} + ~${ESCROW_DEPOSIT_SOL.toFixed(4)} SOL refundable deposit. ` +
      `If you lock: ${TESSERA_LOCK_WARNING} ${TESSERA_NOTICE}`,
    label: "Tip",
    links: { actions: [{ type: "transaction", label: "Tip", href, parameters }] },
  };
  return Response.json(body, { headers: ACTIONS_CORS_HEADERS });
}

const emptyToUndefined = (v: unknown) => (v === "" || v === null ? undefined : v);
const postQuerySchema = z.object({
  token: z.enum(T_TOKEN_IDS),
  amount: z.coerce.number().positive(),
  payWith: z.preprocess(emptyToUndefined, z.enum(PAY_ASSET_IDS).default("USDC")),
  lockUnit: z.preprocess(emptyToUndefined, z.enum(["none", ...LOCK_UNITS, "demo"]).default("none")),
  lockAmount: z.preprocess(emptyToUndefined, z.coerce.number().default(0)),
  name: z.string().optional(),
});
const postBodySchema = z.object({ account: walletSchema });

/** Builds the tip tx for the Blink wallet (`account` = fee payer). Locked tips come back partially signed by the escrow base key. */
export async function POST(req: Request, ctx: RouteContext<"/api/actions/tip/[wallet]">) {
  const creator = walletSchema.safeParse((await ctx.params).wallet);
  if (!creator.success) return error("Invalid creator wallet", 400);
  const q = postQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!q.success) return error(`Invalid parameters: ${q.error.issues.map((i) => i.path.join(".") || i.message).join(", ")}`, 400);
  const body = postBodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return error("Body must be { account: <wallet address> }", 400);

  let lockSeconds: number | null;
  try {
    lockSeconds = lockSecondsFor({ unit: q.data.lockUnit, amount: q.data.lockAmount });
  } catch (e) {
    return error(errorMessage(e), 400);
  }

  const who = tipQuerySchema.parse({ name: q.data.name }).name ?? shortAddress(creator.data);
  const token = tokenById(q.data.token);
  try {
    const built = await buildTipTransaction(
      {
        payer: new PublicKey(body.data.account),
        creator: new PublicKey(creator.data),
        token: q.data.token,
        payWith: q.data.payWith,
        usdAmount: q.data.amount,
        lockSeconds,
      },
      { connection: serverConnection() },
    );
    let message = `Tip of ${formatUsd(q.data.amount)} in ${token.symbol} to ${who}, paid in ${q.data.payWith}. Includes 0.2% token transfer fee.`;
    if (built.lock) {
      message +=
        ` Locked for ${formatLockDuration(built.lock.lockSeconds)}. + ~${ESCROW_DEPOSIT_SOL.toFixed(4)} SOL refundable deposit (escrow rent), ` +
        `returned to you after the creator claims: ${siteUrl()}/deposits/${body.data.account}. ${TESSERA_LOCK_WARNING_FULL}`;
    }
    const res: ActionPostResponse = {
      type: "transaction",
      transaction: Buffer.from(built.transaction.serialize()).toString("base64"),
      message,
    };
    return Response.json(res, { headers: ACTIONS_CORS_HEADERS });
  } catch (e) {
    return error(errorMessage(e), isTipError(e) ? 400 : 502);
  }
}

export async function OPTIONS() {
  return new Response(null, { headers: ACTIONS_CORS_HEADERS });
}
