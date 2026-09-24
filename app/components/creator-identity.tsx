import { Badge } from "@/components/ui/badge";
import { explorerAccount, shortAddress } from "@/lib/format";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

/** Name and handle come from the link and are UNVERIFIED: the wallet is always shown next to them. */
export function CreatorIdentity({
  wallet,
  name,
  x,
  eyebrow,
  align = "start",
}: {
  wallet: string;
  name?: string;
  x?: string;
  eyebrow?: string;
  align?: "start" | "center";
}) {
  const title = name ?? shortAddress(wallet, 6);
  const initial = (name ?? wallet).trim().charAt(0).toUpperCase();
  return (
    <div className={cn("flex items-center gap-3.5", align === "center" && "justify-center text-center lg:justify-start lg:text-left")}>
      <span
        aria-hidden
        className="grid size-12 shrink-0 place-items-center rounded-full bg-[radial-gradient(circle_at_30%_25%,oklch(0.5_0.05_60),oklch(0.28_0.02_60))] font-display text-2xl text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_0_0_1px_rgba(255,255,255,0.08),0_8px_20px_-8px_rgba(0,0,0,0.8)]"
      >
        {initial}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        {eyebrow ? <p className="text-[11px] font-medium tracking-[0.14em] text-brand uppercase">{eyebrow}</p> : null}
        <h1 className="truncate font-display text-[32px] leading-[1.05] tracking-[-0.01em]">{title}</h1>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          {x ? <span>@{x}</span> : null}
          <a href={explorerAccount(wallet)} target="_blank" rel="noreferrer" className="font-mono text-xs hover:text-foreground" title={wallet}>
            {shortAddress(wallet, 4)}
          </a>
          <CopyButton value={wallet} label="Copy wallet" />
          {name || x ? (
            <Badge variant="outline" className="text-muted-foreground" title="Name and handle come from the link. Only the wallet is real.">
              unverified
            </Badge>
          ) : null}
        </div>
      </div>
    </div>
  );
}
