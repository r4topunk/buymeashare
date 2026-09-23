import { Badge } from "@/components/ui/badge";
import { explorerAccount, shortAddress } from "@/lib/format";
import { CopyButton } from "@/components/copy-button";

/** Name and handle come from the link and are UNVERIFIED: the wallet is always shown next to them. */
export function CreatorIdentity({ wallet, name, x }: { wallet: string; name?: string; x?: string }) {
  const title = name ?? shortAddress(wallet, 6);
  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
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
  );
}
