#!/usr/bin/env python3
"""
Word timings for karaoke captions, from the real voice-over.

  python3 capture/karaoke.py tts/full-aoede.mp3 > out/captions.json

Each narration block (capture/narration.json) starts where out/timecodes.json says, rounded the way the TTS take was
laid out. Words get their spelling from the script. Timing: fine silence detection gives the exact speech runs; whisper
(per block, so no long silence can throw it off) decides which run each word belongs to; inside a run, words share the
time in proportion to their length.
"""
import difflib, json, os, re, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL = os.path.expanduser("~/.cache/whisper-cpp/ggml-large-v3-turbo.bin")
audio = sys.argv[1]
narr = json.load(open(os.path.join(HERE, "narration.json")))
tc = {s["id"]: s["voiceStartsAt"] for s in json.load(open(os.path.join(HERE, "../out/timecodes.json")))["scenes"]}
tmp = tempfile.mkdtemp()
wav = os.path.join(tmp, "a.wav")
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", audio, "-ar", "16000", "-ac", "1", wav], check=True)
dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", wav], capture_output=True, text=True).stdout)

# speech runs = complement of silences
log = subprocess.run(["ffmpeg", "-i", wav, "-af", "silencedetect=noise=-38dB:d=0.12", "-f", "null", "-"], capture_output=True, text=True).stderr
sil = [(float(a), float(b)) for a, b in re.findall(r"silence_start: ([\d.]+)[\s\S]*?silence_end: ([\d.]+)", log)]
runs, t = [], 0.0
for a, b in sil:
    if a - t > 0.05: runs.append([t, a])
    t = b
if dur - t > 0.05: runs.append([t, dur])

norm = lambda w: re.sub(r"[^a-z0-9]", "", w.lower().replace("three", "3").replace("dollars", "").replace("24th", "24"))
starts = [tc[n["id"]] - 0.6 for n in narr]  # window opens a bit early: a take may place blocks on the whole second
out = []
for i, n in enumerate(narr):
    b0, b1 = starts[i], (starts[i + 1] if i + 1 < len(narr) else dur)
    clip = os.path.join(tmp, f"{n['id']}.wav")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(max(0, b0)), "-to", str(b1), "-i", wav, clip], check=True)
    subprocess.run(["whisper-cli", "-m", MODEL, "-f", clip, "-l", "en", "-np", "-ml", "1", "-sow", "-oj", "-of", clip[:-4]], capture_output=True, check=True)
    ww = [(s["text"].strip(), max(0, b0) + (s["offsets"]["from"] + s["offsets"]["to"]) / 2000) for s in json.load(open(clip[:-4] + ".json"))["transcription"] if s["text"].strip()]
    words = n["text"].split()
    # whisper time for each script word (matched by normalised text, gaps interpolated)
    sm = difflib.SequenceMatcher(a=[norm(w) for w in words], b=[norm(w) for w, _ in ww], autojunk=False)
    mid = [None] * len(words)
    for a, b, size in sm.get_matching_blocks():
        for k in range(size): mid[a + k] = ww[b + k][1]
    known = [(k, m) for k, m in enumerate(mid) if m is not None] or [(0, b0 + 0.3)]
    for k in range(len(words)):
        if mid[k] is None:
            prev = max([p for p in known if p[0] < k], default=None, key=lambda p: p[0])
            nxt = min([p for p in known if p[0] > k], default=None, key=lambda p: p[0])
            mid[k] = prev[1] if nxt is None else nxt[1] if prev is None else prev[1] + (nxt[1] - prev[1]) * (k - prev[0]) / (nxt[0] - prev[0])
    brun = [r for r in runs if r[1] > b0 and r[0] < b1]
    # Split the words into contiguous groups, one per speech run (a run may stay empty if it is a breath):
    # dynamic programming over (word, run), cost = speaking-rate mismatch + pause-not-at-punctuation + whisper distance.
    N, M = len(words), len(brun)
    wt = [len(norm(w)) + 2 for w in words]
    total = sum(r[1] - r[0] for r in brun)
    rate = total / sum(wt)
    INF = float("inf")
    def cost(i, j, r):
        a, b = brun[r]
        if i == j: return 0.4 if b - a < 0.25 else 6.0
        exp = sum(wt[i:j]) * rate
        c = 3.0 * (__import__("math").log((b - a) / exp)) ** 2
        c += sum(0 if a <= mid[k] <= b else min(abs(mid[k] - a), abs(mid[k] - b)) for k in range(i, j)) * 0.8
        if j < N: c += -0.6 if re.search(r"[.,:;?!]$", words[j - 1]) else 0.5
        return c
    best = [[INF] * (N + 1) for _ in range(M + 1)]
    back = [[0] * (N + 1) for _ in range(M + 1)]
    best[0][0] = 0
    for r in range(M):
        for j in range(N + 1):
            for i in range(j + 1):
                if best[r][i] == INF: continue
                v = best[r][i] + cost(i, j, r)
                if v < best[r + 1][j]: best[r + 1][j], back[r + 1][j] = v, i
    groups, j = [], N
    for r in range(M, 0, -1):
        i = back[r][j]; groups.append((r - 1, i, j)); j = i
    groups.reverse()
    timed = []
    for r, i, j in groups:
        if i == j: continue
        a, b = brun[r]
        t, tot = a, sum(wt[i:j])
        for k in range(i, j):
            d = (b - a) * wt[k] / tot
            timed.append({"w": words[k], "t0": round(t, 3), "t1": round(t + d, 3)})
            t += d
    # lines: break after sentence ends, long gaps, or ~38 characters
    line, lines = [], []
    for k, w in enumerate(timed):
        if line and (len(" ".join(x["w"] for x in line + [w])) > 38 or w["t0"] - line[-1]["t1"] > 0.7):
            lines.append(line); line = []
        line.append(w)
        if re.search(r"[.?!:]$", w["w"]): lines.append(line); line = []
    if line: lines.append(line)
    for l in lines: out.append({"id": n["id"], "t0": l[0]["t0"], "t1": l[-1]["t1"], "words": l})
json.dump(out, sys.stdout, indent=1)
