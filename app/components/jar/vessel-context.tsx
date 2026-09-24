"use client";

import { LockIcon } from "lucide-react";
import { motion } from "motion/react";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { prefersReducedMotion } from "@/hooks/use-fx";
import * as sfx from "@/lib/fx/audio";
import { METALS, coinCss } from "@/lib/fx/metals";
import type { TTokenId } from "@/lib/tokens";
import { TIP_COIN_R } from "./coins";
import type { CoinSpec, VesselEngine } from "./vessel-engine";

export type VesselHandle = { el: HTMLElement; engine: VesselEngine };

type Flight = { id: string; token: TTokenId; locked: boolean; from: { x: number; y: number }; to: { x: number; y: number }; endScale: number; done: () => void };

type VesselCtx = {
  register: (h: VesselHandle | null) => void;
  /** Coins added in this session (confirmed tips, unsealed claims). Drawn on top of the page's own coins. */
  sessionCoins: CoinSpec[];
  /** Sealed coins for locked tips (jar page). */
  lockCoins: CoinSpec[];
  setLockCoins: (coins: CoinSpec[]) => void;
  /** Confirmed tip: fly a coin from `from` into the jar, drop it, resolve on landing. */
  deliver: (o: { id: string; token: TTokenId; locked: boolean; from?: HTMLElement | null }) => Promise<void>;
  /** A claimed locked coin: break the seal in place. */
  unseal: (id: string) => void;
  confetti: (token: TTokenId) => void;
};

const Ctx = createContext<VesselCtx | null>(null);

export function useVessel() {
  return useContext(Ctx);
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function VesselProvider({ children }: { children: React.ReactNode }) {
  const handle = useRef<VesselHandle | null>(null);
  const [sessionCoins, setSessionCoins] = useState<CoinSpec[]>([]);
  const [lockCoinsRaw, setLockCoinsRaw] = useState<CoinSpec[]>([]);
  const [flights, setFlights] = useState<Flight[]>([]);

  const register = useCallback((h: VesselHandle | null) => {
    handle.current = h;
  }, []);

  const addSession = useCallback((spec: CoinSpec) => {
    setSessionCoins((cs) => [...cs.filter((c) => c.id !== spec.id), spec]);
  }, []);

  const deliver = useCallback<VesselCtx["deliver"]>(
    async ({ id, token, locked, from }) => {
      const h = handle.current;
      if (!h) return;
      const spec: CoinSpec = { id, token, r: TIP_COIN_R, locked };
      const reduced = prefersReducedMotion();
      const r0 = h.el.getBoundingClientRect();
      if (r0.top < 64 || r0.bottom > window.innerHeight) {
        h.el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
        if (!reduced) await wait(560);
      }
      if (reduced) {
        void h.engine.drop(spec);
        addSession(spec);
        return;
      }
      const rect = h.el.getBoundingClientRect();
      const mouth = h.engine.mouthPoint();
      const to = { x: rect.left + mouth.x, y: rect.top + mouth.y - 6 };
      let fromPt = { x: window.innerWidth / 2, y: window.innerHeight + 40 };
      const fr = from?.getBoundingClientRect();
      if (fr && fr.bottom > 0 && fr.top < window.innerHeight) fromPt = { x: fr.left + fr.width / 2, y: fr.top + fr.height / 2 };
      const endScale = (TIP_COIN_R * 2 * (rect.width / 300)) / FLIGHT_SIZE;
      sfx.whoosh();
      await new Promise<void>((done) => setFlights((fs) => [...fs, { id, token, locked, from: fromPt, to, endScale, done }]));
      setFlights((fs) => fs.filter((f) => f.id !== id));
      const landed = h.engine.drop(spec, { vy: 460 });
      addSession(spec);
      await landed;
    },
    [addSession],
  );

  const unseal = useCallback(
    (id: string) => {
      const coin = lockCoinsRaw.find((c) => c.id === id);
      addSession({ ...(coin ?? { id, token: "openai", r: TIP_COIN_R }), locked: false });
      handle.current?.engine.shake(0.35);
    },
    [lockCoinsRaw, addSession],
  );

  const confetti = useCallback((token: TTokenId) => {
    const h = handle.current;
    if (!h || prefersReducedMotion()) return;
    const rect = h.el.getBoundingClientRect();
    const mouth = h.engine.mouthPoint();
    const origin = { x: (rect.left + mouth.x) / window.innerWidth, y: (rect.top + mouth.y + 10) / window.innerHeight };
    const colors = [...METALS[token].confetti, "#ffb35c", "#ffffff"];
    void import("canvas-confetti").then(({ default: fire }) => {
      const base = { origin, colors, disableForReducedMotion: true, zIndex: 60, ticks: 240, gravity: 1.05, scalar: 0.95 };
      fire({ ...base, particleCount: 70, spread: 62, startVelocity: 42, angle: 90 });
      setTimeout(() => fire({ ...base, particleCount: 40, spread: 110, startVelocity: 30, angle: 90, shapes: ["circle"] }), 140);
    });
  }, []);

  // A coin that has been unsealed this session lives in sessionCoins; never draw it twice.
  const lockCoins = useMemo(() => lockCoinsRaw.filter((c) => !sessionCoins.some((s) => s.id === c.id)), [lockCoinsRaw, sessionCoins]);

  const value = useMemo<VesselCtx>(
    () => ({ register, sessionCoins, lockCoins, setLockCoins: setLockCoinsRaw, deliver, unseal, confetti }),
    [register, sessionCoins, lockCoins, deliver, unseal, confetti],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-50">
        {flights.map((f) => (
          <FlyingCoin key={f.id} f={f} />
        ))}
      </div>
    </Ctx.Provider>
  );
}

const FLIGHT_SIZE = 52;

function FlyingCoin({ f }: { f: Flight }) {
  const peak = Math.min(f.from.y, f.to.y) - Math.max(90, Math.abs(f.from.y - f.to.y) * 0.25);
  const half = FLIGHT_SIZE / 2;
  const midX = f.from.x + (f.to.x - f.from.x) * 0.55;
  return (
    <motion.div
      className="absolute top-0 left-0 grid place-items-center rounded-full text-[22px] font-bold"
      style={{ width: FLIGHT_SIZE, height: FLIGHT_SIZE, ...coinCss(f.token) }}
      initial={{ x: f.from.x - half, y: f.from.y - half, scale: 0.6, rotate: 0 }}
      animate={{
        x: [f.from.x - half, midX - half, f.to.x - half],
        y: [f.from.y - half, peak - half, f.to.y - half],
        scale: [0.6, 1.15, f.endScale],
        rotate: [0, 200, 420],
      }}
      transition={{ duration: 0.8, times: [0, 0.5, 1], ease: ["easeOut", "easeIn"] }}
      onAnimationComplete={f.done}
    >
      {f.locked ? <LockIcon className="size-5" strokeWidth={2.75} /> : METALS[f.token].glyph}
    </motion.div>
  );
}
