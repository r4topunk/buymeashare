import { LockIcon } from "lucide-react";
import { METALS, coinCss } from "@/lib/fx/metals";
import type { TTokenId } from "@/lib/tokens";
import { cn } from "@/lib/utils";

/** DOM coin with the same metal as the jar's canvas coins. Decorative. */
export function Coin({ token, size = 32, locked, dim, className }: { token: TTokenId; size?: number; locked?: boolean; dim?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("relative inline-grid shrink-0 place-items-center rounded-full font-bold transition-[filter] duration-300", dim && "saturate-[0.55] brightness-[0.8]", className)}
      style={{ width: size, height: size, fontSize: size * 0.46, ...coinCss(token) }}
    >
      <span className="absolute inset-[13%] rounded-full shadow-[inset_1px_1px_1px_rgba(0,0,0,0.25),inset_-1px_-1px_1px_rgba(255,255,255,0.45)]" />
      {locked ? (
        <>
          <span className="absolute inset-[3%] rounded-full border-[max(2px,0.08em)] border-[#ffaa3c]" />
          <LockIcon className="relative" style={{ width: size * 0.42, height: size * 0.42 }} strokeWidth={2.75} />
        </>
      ) : (
        <span className="relative leading-none [text-shadow:0.5px_1px_0_rgba(255,255,255,0.5)]">{METALS[token].glyph}</span>
      )}
    </span>
  );
}
