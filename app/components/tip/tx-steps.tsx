"use client";

import { CheckIcon } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

const STEPS = [
  { kind: "building", label: "Prepare" },
  { kind: "signing", label: "Approve" },
  { kind: "confirming", label: "Confirm" },
] as const;

export type TxStepKind = (typeof STEPS)[number]["kind"];

/** Pending state between click and on-chain confirmation: prepare (quote + build) -> approve (wallet) -> confirm. */
export function TxSteps({ current }: { current: TxStepKind }) {
  const at = STEPS.findIndex((s) => s.kind === current);
  return (
    <ol className="flex items-center justify-center gap-2 text-xs" aria-label="Transaction progress">
      {STEPS.map((s, i) => {
        const done = i < at;
        const active = i === at;
        return (
          <li key={s.kind} className="flex items-center gap-2" aria-current={active ? "step" : undefined}>
            {i > 0 ? <span aria-hidden className={cn("h-px w-6 transition-colors duration-500", done || active ? "bg-brand/70" : "bg-border")} /> : null}
            <span className={cn("flex items-center gap-1.5 transition-colors", active ? "text-foreground" : done ? "text-muted-foreground" : "text-muted-foreground/60")}>
              <span className="relative grid size-4 place-items-center">
                {done ? (
                  <CheckIcon className="size-3.5 text-brand" strokeWidth={3} />
                ) : (
                  <>
                    {active ? (
                      <motion.span
                        aria-hidden
                        className="absolute inset-0 rounded-full bg-brand/40"
                        animate={{ scale: [1, 1.9], opacity: [0.7, 0] }}
                        transition={{ duration: 1.1, repeat: Infinity, ease: "easeOut" }}
                      />
                    ) : null}
                    <span className={cn("size-2 rounded-full", active ? "bg-brand" : "bg-white/20")} />
                  </>
                )}
              </span>
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
