"use client";

import { Volume2Icon, VolumeXIcon } from "lucide-react";
import { useMuted } from "@/hooks/use-fx";
import * as sfx from "@/lib/fx/audio";

/** Sound on/off, one tap away in the header. Remembered per browser. */
export function SoundToggle() {
  const muted = useMuted();
  return (
    <button
      type="button"
      aria-pressed={!muted}
      aria-label={muted ? "Turn sound on" : "Turn sound off"}
      title={muted ? "Sound off" : "Sound on"}
      onClick={() => {
        sfx.setMuted(!muted);
        if (muted) {
          sfx.unlock();
          sfx.toggleOn();
        }
      }}
      className="grid size-9 place-items-center rounded-full border border-border bg-white/[0.03] text-muted-foreground outline-none transition-colors hover:bg-white/[0.07] hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/70 [&_svg]:size-4"
    >
      {muted ? <VolumeXIcon /> : <Volume2Icon />}
    </button>
  );
}
