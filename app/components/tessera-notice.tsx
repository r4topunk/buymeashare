import { TESSERA_NOTICE, TESSERA_TERMS_URL } from "@/lib/brand";
import { cn } from "@/lib/utils";

export function TesseraNotice({ className }: { className?: string }) {
  return (
    <p className={cn("text-xs leading-relaxed text-muted-foreground", className)}>
      {TESSERA_NOTICE}{" "}
      <a href={TESSERA_TERMS_URL} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">
        See Tessera terms.
      </a>
    </p>
  );
}
