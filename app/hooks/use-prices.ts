"use client";

import { useEffect, useState } from "react";
import { priceSnapshotSchema, type PriceSnapshot } from "@/lib/prices/types";

const REFRESH_MS = 30_000;

/** Polls /api/prices (server-cached ~30s). `initial` lets server components hand over a snapshot. */
export function usePrices(initial: PriceSnapshot | null = null) {
  const [prices, setPrices] = useState<PriceSnapshot | null>(initial);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch("/api/prices", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = priceSnapshotSchema.parse(await res.json());
        if (alive) {
          setPrices(data);
          setError(null);
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      }
    }
    if (!initial) void load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [initial]);

  return { prices, error };
}
