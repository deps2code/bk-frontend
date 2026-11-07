# CLAUDE.md

Free-roam top-down browser game: walk through Groningen past all 124,990
municipal trees at their real positions. Canvas 2D, React only for the HUD,
static hosting, no backend. Roadmap and design in PLAN-game.md (README.md and
DESIGN.md still describe the retired map app until milestone 8). UI text is Dutch.

## Commands

- `npm run dev` — dev server on :5173
- `npm run build` — `tsc -b` typecheck + Vite build (run this to typecheck)
- `npm run build-data` — trees: `Bomen gemeente Groningen.json` (68 MB,
  gitignored) → `public/data/{trees.bin, details.json, search.json}`.
  Sanity-check the report: 125k trees, ~53% estimated heights.
- `node scripts/extract-osm.mjs [region]` — `raw/geofabrik/groningen-latest.osm.pbf`
  → `raw/osm-<region>.json` (download URL in the script header; `raw/` is gitignored)
- `node scripts/build-world.mjs [region]` — `raw/osm-<region>.json` →
  `public/world/{index.json, c_<cx>_<cy>.bin}`. Regions live in
  `scripts/lib/regions.mjs` (currently `centrum`).

Generated `public/data/*` and `public/world/*` are committed; rerun the
scripts only when inputs or the pipeline change.

## Architecture invariants

- **World units are RD New meters** (EPSG:28992, x east, y north). Trees use
  the dataset's own `X/Y_COORDINAAT`; OSM is projected with
  `scripts/lib/rd.mjs` (≈0.3 m constant offset vs the tree data, measured).
- **`CHUNK_SIZE` (250 m) is defined three times**: `src/game/world.ts`,
  `scripts/lib/regions.mjs`, `scripts/build-data.mjs`. Change all + rebuild.
- **Binary formats are cross-file contracts** — keep encoder and decoder in
  lockstep: `trees.bin` (`scripts/build-data.mjs` ↔ `src/lib/loadTrees.ts`),
  chunk files (`scripts/build-world.mjs` ↔ `src/game/worldFormat.ts`, incl.
  the kind enums, whose order is also the draw order).
- **Archetype order**: the 14-entry `ARCHETYPES` in `src/lib/archetypes.ts`
  must match `scripts/build-data.mjs`.
- `trees.bin` is chunk-sorted and `details.json` uses the same order — never
  reorder one without the other.
- Game loop (`src/game/loop.ts`) is fixed-step 60 Hz update + interpolated
  render; the HUD reads `src/game/store.ts`, throttled to ~4 Hz. Never drive
  per-frame state through React.
- `kiemjaar === 0` means unknown; heights are pre-resolved and flagged
  (`flags` bit 1 = estimated).

## Gotchas

- Public Overpass servers were persistently overloaded (502/504); that's why
  OSM comes from the Geofabrik extract instead.
- `npm install`/`uninstall` prunes the `--no-save` playwright-core; reinstall
  it before headless checks.
- SwiftShader fps is meaningless at large viewports — judge perf on real
  hardware or at phone-size viewports.

## Verifying changes (headless)

No test suite; drive the real app:

```bash
npm run dev &
npm i --no-save playwright-core   # keep package.json clean
```

Launch `~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome` with
`--no-sandbox`. Wait for `.hud-status` (loading banner) to disappear before
screenshots. Position via hash `#p=<x>/<y>/<px-per-m>`; a `hashchange`
teleports, so no reload is needed. Useful spots: `#p=233880/581960/9`
(Grote Markt, spawn), `#p=233050/582520/4` (Noorderplantsoen),
`#p=233900/582000/2` (whole Diepenring; use a big viewport). Press G for the
chunk grid. Check: map renders, trees align with streets, no console errors.
