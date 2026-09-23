"use client";

import { useCallback, useEffect, useState } from "react";
import { lockListErrorSchema, lockListSchema } from "@/lib/tip/schemas";
import type { LockList } from "@/lib/tip/types";

export type LockListState =
  | { kind: "loading" }
  | { kind: "ready"; list: LockList; /** chain clock - local clock, seconds */ skew: number }
  | { kind: "error"; message: string; unsupported: boolean };

/** Reads escrows for a wallet from the server (keyed RPC_URL): as creator (recipient) or as fan (sender). */
export function useLockList(wallet: string, role: "recipient" | "sender") {
  const [state, setState] = useState<LockListState>({ kind: "loading" });
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await fetch(`/api/locks/${wallet}?role=${role}`, { cache: "no-store" });
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const err = lockListErrorSchema.safeParse(body);
        return { kind: "error", message: err.success ? err.data.error : `HTTP ${res.status}`, unsupported: err.success && err.data.code === "RPC_UNSUPPORTED" } as const;
      }
      const list = lockListSchema.parse(body);
      return { kind: "ready", list, skew: list.chainTime - Date.now() / 1000 } as const;
    })()
      .catch((e: unknown) => ({ kind: "error", message: e instanceof Error ? e.message : String(e), unsupported: false }) as const)
      .then((next) => {
        if (alive) setState(next);
      });
    return () => {
      alive = false;
    };
  }, [wallet, role, reload]);

  const refresh = useCallback(() => setReload((n) => n + 1), []);
  return { state, refresh };
}

/** Local clock ticking every second, shifted onto the chain clock. Claim gating uses this, not Date.now(). */
export function useChainClock(skew: number | null): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now() / 1000);
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  return skew == null || now == null ? null : now + skew;
}
