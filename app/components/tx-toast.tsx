"use client";

import { toast } from "sonner";
import { explorerTx } from "@/lib/format";

/** Success toast with a Solscan link for a confirmed transaction. */
export function toastTx(message: string, signature: string) {
  toast.success(message, {
    description: (
      <a href={explorerTx(signature)} target="_blank" rel="noreferrer" className="underline underline-offset-2">
        View on Solscan
      </a>
    ),
  });
}
