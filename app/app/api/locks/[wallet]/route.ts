import { PublicKey } from "@solana/web3.js";
import { walletSchema } from "@/lib/schemas";
import { serverConnection } from "@/lib/solana/connection";
import { isTipError, listDeposits, listLocks } from "@/lib/tip";

export const dynamic = "force-dynamic";

/**
 * Jupiter Lock escrows for a wallet, read with the server-side RPC_URL (getProgramAccounts):
 *  - ?role=recipient (default): locked tips a creator can claim
 *  - ?role=sender: escrows a fan created (pending + reclaimable deposits)
 * 503 { code: "RPC_UNSUPPORTED" } when the RPC refuses getProgramAccounts.
 */
export async function GET(req: Request, ctx: RouteContext<"/api/locks/[wallet]">) {
  const parsed = walletSchema.safeParse((await ctx.params).wallet);
  if (!parsed.success) return Response.json({ error: "invalid wallet" }, { status: 400 });
  const wallet = new PublicKey(parsed.data);
  const role = new URL(req.url).searchParams.get("role") === "sender" ? "sender" : "recipient";
  try {
    const connection = serverConnection();
    const list = role === "sender" ? await listDeposits({ sender: wallet }, { connection }) : await listLocks({ creator: wallet }, { connection });
    return Response.json(list, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (isTipError(e, "RPC_UNSUPPORTED")) return Response.json({ error: e.message, code: e.code }, { status: 503 });
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
