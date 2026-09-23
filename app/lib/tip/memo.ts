/** Every tip transaction carries an SPL Memo with this tag. The jar is rebuilt from on-chain data by looking for it. */
export const TIP_MEMO = "buymeashare:v0";
export const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

/** Tags appended to TIP_MEMO for the non-tip txs of the lock flow (`buymeashare:v0 kind=claim`). */
export const CLAIM_MEMO = `${TIP_MEMO} kind=claim`;
export const CLOSE_MEMO = `${TIP_MEMO} kind=close`;

export type ParsedTipMemo = {
  version: "v0";
  /** Optional `key=value` tags after the prefix, e.g. "buymeashare:v0 kind=claim". */
  tags: Record<string, string>;
};

/**
 * Parses the `memo` field returned by getSignaturesForAddress. RPC formats it as
 * "[<len>] <text>" and joins multiple memos with "; ".
 */
export function parseTipMemo(rpcMemo: string | null | undefined): ParsedTipMemo | null {
  if (!rpcMemo) return null;
  for (const part of rpcMemo.split("; ")) {
    const text = part.replace(/^\[\d+\]\s*/, "").trim();
    if (text !== TIP_MEMO && !text.startsWith(`${TIP_MEMO} `)) continue;
    const tags: Record<string, string> = {};
    for (const kv of text.slice(TIP_MEMO.length).trim().split(/\s+/).filter(Boolean)) {
      const [k, ...rest] = kv.split("=");
      if (k) tags[k] = rest.join("=");
    }
    return { version: "v0", tags };
  }
  return null;
}
