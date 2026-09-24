import { ArrowDownIcon } from "lucide-react";
import { Coin } from "@/components/fx/coin";
import { LandingJar } from "@/components/landing-jar";
import { LinkBuilder } from "@/components/link-builder";
import { TesseraNotice } from "@/components/tessera-notice";
import { PRODUCT_NAME, PRODUCT_PITCH } from "@/lib/brand";

const STEPS = [
  { t: "Share your link", d: "It's just your wallet. No signup.", token: "openai" as const },
  { t: "Fans tip in SOL or USDC", d: "From $1. They pick T-OpenAI, T-Kalshi or T-SpaceX.", token: "kalshi" as const },
  { t: "You receive T-Tokens", d: `Swapped by Jupiter, sent straight to your wallet. The fan can lock it for up to 5 years.`, token: "spacex" as const },
];

export default function Home() {
  return (
    <div className="flex flex-col gap-16 sm:gap-20">
      <section className="grid grid-cols-[minmax(0,1fr)] items-center gap-10 pt-2 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-16 lg:pt-10">
        <div className="flex flex-col gap-5 text-center lg:text-left">
          <p className="text-[11px] font-medium tracking-[0.16em] text-brand uppercase">{PRODUCT_NAME}</p>
          <h1 className="font-display text-[44px] leading-[1.02] tracking-[-0.015em] text-balance sm:text-6xl lg:text-[72px]">
            Like a tip jar, but the tip is <em className="text-brand not-italic sm:italic">OpenAI pre-IPO exposure.</em>
          </h1>
          <p className="mx-auto max-w-md text-base text-muted-foreground text-pretty lg:mx-0 lg:text-lg">{PRODUCT_PITCH}</p>
          <div className="flex justify-center lg:justify-start">
            <a
              href="#create"
              className="inline-flex h-11 items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-5 text-sm font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] outline-none transition-colors hover:bg-white/[0.1] focus-visible:ring-2 focus-visible:ring-brand/70"
            >
              Create your link <ArrowDownIcon className="size-4" />
            </a>
          </div>
        </div>
        <LandingJar />
      </section>

      <ol className="grid gap-3 sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.t} className="surface flex gap-3 rounded-2xl p-4">
            <Coin token={s.token} size={30} className="mt-0.5" />
            <div className="min-w-0">
              <span className="font-mono text-[11px] text-muted-foreground">0{i + 1}</span>
              <div className="text-sm font-medium">{s.t}</div>
              <div className="mt-0.5 text-xs text-muted-foreground text-pretty">{s.d}</div>
            </div>
          </li>
        ))}
      </ol>

      <section id="create" className="mx-auto flex w-full max-w-2xl scroll-mt-24 flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-[36px] leading-none tracking-[-0.01em]">Create your link</h2>
          <p className="text-sm text-muted-foreground">Paste your wallet. That&apos;s the whole signup.</p>
        </div>
        <div className="surface rounded-[28px] p-4 sm:p-6">
          <LinkBuilder />
        </div>
        <TesseraNotice className="px-1" />
      </section>
    </div>
  );
}
