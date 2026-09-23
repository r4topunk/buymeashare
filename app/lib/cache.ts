/**
 * Tiny per-instance TTL cache with in-flight dedupe. Used for RPC reads, which are POSTs and
 * therefore not covered by Next's fetch cache. On Vercel each serverless instance has its own copy.
 */
type Entry<T> = { value?: T; expires: number; inflight?: Promise<T> };

export function ttlCache<T>(ttlMs: number, maxEntries = 500) {
  const store = new Map<string, Entry<T>>();
  return async function get(key: string, load: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const hit = store.get(key);
    if (hit?.value !== undefined && hit.expires > now) return hit.value;
    if (hit?.inflight) return hit.inflight;
    const inflight = load()
      .then((value) => {
        store.set(key, { value, expires: Date.now() + ttlMs });
        if (store.size > maxEntries) store.delete(store.keys().next().value as string);
        return value;
      })
      .catch((err) => {
        store.delete(key);
        throw err;
      });
    store.set(key, { ...hit, expires: hit?.expires ?? 0, inflight });
    return inflight;
  };
}
