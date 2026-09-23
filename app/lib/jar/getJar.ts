import { PublicKey, type ConfirmedSignatureInfo, type Connection } from "@solana/web3.js";
import { z } from "zod";
import { ttlCache } from "@/lib/cache";
import { serverConnection } from "@/lib/solana/connection";
import { parseTipMemo } from "@/lib/tip/memo";
import { TOKEN_2022_PROGRAM, T_TOKENS, tokenByMint, type TTokenId } from "@/lib/tokens";
import type { Jar, JarHolding, JarTip } from "./types";

const SIGNATURES_PER_ACCOUNT = 100;
const MAX_TIPS_PARSED = 25;
const TX_CONCURRENCY = 4;

// jsonParsed Token-2022 account (only fields we use).
const parsedTokenAccountSchema = z.object({
  parsed: z.object({
    info: z.object({
      mint: z.string(),
      owner: z.string(),
      tokenAmount: z.object({ amount: z.string().regex(/^\d+$/), decimals: z.number().int() }),
    }),
  }),
});

const tokenBalanceSchema = z.object({
  accountIndex: z.number(),
  mint: z.string(),
  owner: z.string().optional(),
  uiTokenAmount: z.object({ amount: z.string().regex(/^\d+$/), decimals: z.number().int() }),
});

function toUi(raw: bigint, decimals: number): number {
  return Number(raw) / 10 ** decimals;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { status: "fulfilled", value: await fn(items[i]) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function readHoldings(connection: Connection, owner: PublicKey): Promise<JarHolding[]> {
  const res = await connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM });
  const byToken = new Map<TTokenId, JarHolding>();
  for (const { pubkey, account } of res.value) {
    const parsed = parsedTokenAccountSchema.safeParse(account.data);
    if (!parsed.success) continue;
    const { mint, tokenAmount } = parsed.data.parsed.info;
    const token = tokenByMint(mint);
    if (!token) continue;
    const prev = byToken.get(token.id);
    const raw = BigInt(prev?.raw ?? "0") + BigInt(tokenAmount.amount);
    byToken.set(token.id, {
      token: token.id,
      accounts: [...(prev?.accounts ?? []), pubkey.toBase58()],
      raw: raw.toString(),
      amount: toUi(raw, token.decimals),
    });
  }
  // Stable order: the configured token order.
  return T_TOKENS.flatMap((t) => byToken.get(t.id) ?? []);
}

export async function parseTip(
  connection: Connection,
  creator: string,
  sig: ConfirmedSignatureInfo,
  memoTags: Record<string, string>,
): Promise<JarTip | null> {
  const tx = await connection.getParsedTransaction(sig.signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
  if (!tx?.meta || tx.meta.err) return null;
  const pre = z.array(tokenBalanceSchema).parse(tx.meta.preTokenBalances ?? []);
  const post = z.array(tokenBalanceSchema).parse(tx.meta.postTokenBalances ?? []);
  for (const p of post) {
    const token = tokenByMint(p.mint);
    if (!token || p.owner !== creator) continue;
    const before = pre.find((b) => b.accountIndex === p.accountIndex);
    const delta = BigInt(p.uiTokenAmount.amount) - BigInt(before?.uiTokenAmount.amount ?? "0");
    if (delta <= BigInt(0)) continue;
    return {
      signature: sig.signature,
      blockTime: sig.blockTime ?? tx.blockTime ?? null,
      token: token.id,
      amount: toUi(delta, token.decimals),
      from: tx.transaction.message.accountKeys[0]?.pubkey.toBase58() ?? "unknown",
      memoTags,
    };
  }
  return null;
}

async function readJar(wallet: string): Promise<Jar> {
  const connection = serverConnection();
  const owner = new PublicKey(wallet);
  const errors: string[] = [];

  const holdings = await readHoldings(connection, owner).catch((e: unknown) => {
    errors.push(`holdings: ${String(e)}`);
    return [] as JarHolding[];
  });

  // Tagged tips: scan signatures of every T-Token account the creator owns. RPC exposes the memo text directly,
  // so only tagged transactions are fetched in full.
  const accounts = holdings.flatMap((h) => h.accounts);
  const sigLists = await mapLimit(accounts, TX_CONCURRENCY, (a) =>
    connection.getSignaturesForAddress(new PublicKey(a), { limit: SIGNATURES_PER_ACCOUNT }),
  );
  const tagged = new Map<string, { sig: ConfirmedSignatureInfo; tags: Record<string, string> }>();
  sigLists.forEach((r, i) => {
    if (r.status === "rejected") {
      errors.push(`signatures(${accounts[i]}): ${String(r.reason)}`);
      return;
    }
    for (const sig of r.value) {
      const memo = parseTipMemo(sig.memo);
      if (memo && !sig.err) tagged.set(sig.signature, { sig, tags: memo.tags });
    }
  });

  const sorted = [...tagged.values()].sort((a, b) => (b.sig.blockTime ?? 0) - (a.sig.blockTime ?? 0));
  const toParse = sorted.slice(0, MAX_TIPS_PARSED);
  const parsed = await mapLimit(toParse, TX_CONCURRENCY, ({ sig, tags }) => parseTip(connection, wallet, sig, tags));
  const tips: JarTip[] = [];
  parsed.forEach((r, i) => {
    if (r.status === "fulfilled") {
      if (r.value) tips.push(r.value);
    } else errors.push(`tx(${toParse[i].sig.signature}): ${String(r.reason)}`);
  });

  const received: Jar["received"] = {};
  for (const t of tips) received[t.token] = (received[t.token] ?? 0) + t.amount;

  return {
    wallet,
    holdings,
    tips,
    received,
    truncated: sorted.length > MAX_TIPS_PARSED,
    fetchedAt: Date.now(),
    errors,
  };
}

const cached = ttlCache<Jar>(30_000);

/** Reads a creator's jar from mainnet. Cached ~30s per server instance. `wallet` must already be validated. */
export function getJar(wallet: string): Promise<Jar> {
  return cached(wallet, () => readJar(wallet));
}
