#!/usr/bin/env node
/**
 * Lays the real TTS narration over the demo video: one clip per scene, each placed at its scene's voice start.
 *
 *   node mux-voice.mjs --clips ../tts [--video ../out/buymeashare-demo.mp4] [--out ../out/buymeashare-demo-final.mp4]
 *
 * --clips holds one file per scene named after its id (intro.mp3, creator-link.mp3, ... any ffmpeg-readable format).
 * Times come from out/timecodes.json (written by compose.mjs). A clip longer than its scene is reported, not cut.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const CLIPS = path.resolve(arg("--clips", path.join(HERE, "../tts")));
const VIDEO = path.resolve(arg("--video", path.join(HERE, "../out/buymeashare-demo.mp4")));
const OUT = path.resolve(arg("--out", path.join(HERE, "../out/buymeashare-demo-final.mp4")));
const { scenes } = JSON.parse(fs.readFileSync(path.join(HERE, "../out/timecodes.json"), "utf8"));

const files = fs.readdirSync(CLIPS);
const clips = scenes.map((s) => {
  const f = files.find((x) => path.parse(x).name === s.id);
  if (!f) throw new Error(`missing clip for scene "${s.id}" in ${CLIPS}`);
  const file = path.join(CLIPS, f);
  const dur = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString());
  const over = dur - s.maxVoiceSeconds;
  console.log(`${s.id.padEnd(14)} ${dur.toFixed(1)}s / max ${s.maxVoiceSeconds}s at ${s.voiceStartsAt}s${over > 0 ? `  <-- ${over.toFixed(1)}s too long` : ""}`);
  return { ...s, file };
});

const inputs = clips.flatMap((c) => ["-i", c.file]);
const af = clips.map((c, i) => `[${i + 1}:a]aresample=48000,adelay=${Math.round(c.voiceStartsAt * 1000)}:all=1[a${i}]`).join(";") +
  `;${clips.map((_, i) => `[a${i}]`).join("")}amix=inputs=${clips.length}:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,apad[a]`;
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", VIDEO, ...inputs, "-filter_complex", af, "-map", "0:v", "-map", "[a]",
  "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", OUT], { stdio: "inherit" });
// The mixed voice track on its own, for karaoke.py (word timings for the burned-in captions).
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", OUT, "-vn", "-c:a", "pcm_s16le", path.join(path.dirname(OUT), "voice-track.wav")], { stdio: "inherit" });
console.log(`\n${OUT}`);
