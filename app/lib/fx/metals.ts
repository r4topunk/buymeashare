import type { CSSProperties } from "react";
import type { TTokenId } from "@/lib/tokens";

/**
 * Coin materials per T-Token (UI only). A metal per token so the jar reads at a glance:
 * T-OpenAI gold, T-Kalshi jade, T-SpaceX platinum. Monograms are plain letters (no third-party logos).
 */
export type Metal = { hi: string; mid: string; lo: string; edge: string; ink: string; glyph: string; confetti: string[] };

export const METALS: Record<TTokenId, Metal> = {
  openai: {
    hi: "#fff4c4",
    mid: "#e7b54c",
    lo: "#8d5d17",
    edge: "#5b3a0c",
    ink: "rgba(92,56,8,0.72)",
    glyph: "O",
    confetti: ["#ffe08a", "#f2b84b", "#fff4c4"],
  },
  kalshi: {
    hi: "#dcfff0",
    mid: "#4fc596",
    lo: "#176446",
    edge: "#0b3b29",
    ink: "rgba(8,58,38,0.72)",
    glyph: "K",
    confetti: ["#8ff0c5", "#4fc596", "#dcfff0"],
  },
  spacex: {
    hi: "#ffffff",
    mid: "#b8c2d0",
    lo: "#566172",
    edge: "#2c3440",
    ink: "rgba(28,36,48,0.72)",
    glyph: "S",
    confetti: ["#e8eef7", "#b8c2d0", "#ffffff"],
  },
};

/** CSS background for a DOM coin (token chips, coin flight, lists). Same palette as the canvas coins. */
export function coinCss(token: TTokenId): CSSProperties {
  const m = METALS[token];
  return {
    background: `radial-gradient(circle at 32% 28%, ${m.hi} 0%, ${m.mid} 42%, ${m.lo} 100%)`,
    boxShadow: `inset 0 0 0 1.5px ${m.lo}, inset 0 1.5px 0 2px rgba(255,255,255,0.35), inset 0 -2px 3px 1px rgba(0,0,0,0.25), 0 2px 5px -1px rgba(0,0,0,0.55)`,
    color: m.ink,
  };
}
