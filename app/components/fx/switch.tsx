"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";

/** Toggle switch (role="switch") with a springy knob. */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-8 w-[3.25rem] shrink-0 items-center rounded-full border p-0.5 outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-brand/70 disabled:opacity-50",
        checked ? "justify-end border-brand/60 bg-brand/85" : "justify-start border-border bg-black/30",
      )}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 700, damping: 34 }}
        className="block size-[1.625rem] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.45),inset_0_-1px_1px_rgba(0,0,0,0.12)]"
      />
    </button>
  );
}
