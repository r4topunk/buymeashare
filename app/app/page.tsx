import { LinkBuilder } from "@/components/link-builder";
import { TesseraNotice } from "@/components/tessera-notice";
import { PRODUCT_NAME, PRODUCT_PITCH } from "@/lib/brand";

const STEPS = [
  { t: "Share your link", d: "It's just your wallet. No signup." },
  { t: "Fans tip in SOL or USDC", d: "From $1. They pick T-OpenAI, T-Kalshi or T-SpaceX." },
  { t: "You receive T-Tokens", d: `Swapped by Jupiter, sent straight to your wallet. The fan can lock it for up to 5 years.` },
];

export default function Home() {
  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-3 pt-4">
        <p className="text-sm font-medium text-brand">{PRODUCT_NAME}</p>
        <h1 className="text-4xl leading-[1.05] font-semibold tracking-[-0.03em] text-balance sm:text-5xl">
          Like a tip jar, but the tip is OpenAI pre-IPO exposure.
        </h1>
        <p className="max-w-prose text-base text-muted-foreground text-pretty">{PRODUCT_PITCH}</p>
      </section>

      <ol className="grid gap-3 sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.t} className="rounded-xl border bg-card p-3">
            <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
            <div className="mt-1 text-sm font-medium">{s.t}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{s.d}</div>
          </li>
        ))}
      </ol>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold tracking-tight">Create your link</h2>
        <LinkBuilder />
      </section>

      <TesseraNotice />
    </div>
  );
}
