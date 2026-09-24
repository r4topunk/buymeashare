# README visuals

TL;DR: every image in `docs/images/` is rendered from an HTML/SVG source in `src/` with headless Chrome at 2x.

```fish
cd docs/visuals && pnpm install && cd ../..   # playwright + sharp, local to this folder
node docs/visuals/capture.mjs                   # optional: fresh app screenshots -> docs/images/screens/ (needs `cd app && PORT=3001 pnpm dev`)
node docs/visuals/render.mjs                    # all src/*.html -> docs/images/<name>.png
node docs/visuals/render.mjs hero,verified      # only some
```

| File | What |
|---|---|
| `src/<name>.html` | One self-contained source per image (inline CSS/JS/SVG). Fonts load from `app/assets/og/*.ttf`. Each draws a single `#frame` (its own dark rounded card), so the PNG has transparent corners and works on GitHub light and dark |
| `render.mjs` | Screenshots `#frame` at device scale 2, recompresses losslessly (palette quantisation only above ~750 KB) |
| `capture.mjs` | Raw screenshots from the running app (`BASE`, default `http://localhost:3001`) used by `src/screenshots.html` |

Notes:

- Canvases are 800 CSS px wide, the width GitHub shows them at, so type sizes in the source are the sizes readers see.
- Uses the system Google Chrome (`PW_CHANNEL=chromium` to use Playwright's bundled browser after `pnpm exec playwright install chromium`).
- Numbers come from `spike/README.md` (RESULTS table) and the first mainnet tip tx; copy rule: T-Tokens are never called shares, equity or stock.
- The coin, metal and jar drawing is a copy of `app/lib/fx/metals.ts`, `app/components/jar/vessel-geometry.ts` and `app/app/api/og/art.tsx`, kept inline so each source stands alone.
