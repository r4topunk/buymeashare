"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CopyButton({ value, label = "Copy", showLabel = false }: { value: string; label?: string; showLabel?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant={showLabel ? "outline" : "ghost"}
      size={showLabel ? "default" : "icon-xs"}
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard blocked: nothing to do */
        }
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      {showLabel ? (copied ? "Copied" : label) : null}
    </Button>
  );
}
