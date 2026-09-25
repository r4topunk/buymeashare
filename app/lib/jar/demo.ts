import { DEMO_FLAGS } from "@/lib/demo";
import type { Jar } from "./types";

/**
 * Dev-only `/jar/<wallet>?demoJar=1`: a jar holding one $3 T-OpenAI tip from the test fan wallet, so the creator view
 * can be recorded right after a simulated tip (`?demoSuccess`) without a real transaction. Always null in production builds.
 */
export function demoJar(wallet: string, flag: string | string[] | undefined): Jar | null {
  if (!DEMO_FLAGS || flag === undefined) return null;
  const amount = 0.002877;
  return {
    wallet,
    holdings: [{ token: "openai", accounts: ["demo"], raw: String(Math.round(amount * 1e9)), amount }],
    tips: [
      {
        signature: "demo-tip",
        blockTime: Math.floor(Date.now() / 1000) - 90,
        token: "openai",
        amount,
        from: "H4KB32QYTbgHWQathSgSwatGoxHCeeTo7V87X5JiYB9Q",
        memoTags: {},
      },
    ],
    received: { openai: amount },
    truncated: false,
    fetchedAt: Date.now(),
    errors: [],
  };
}
