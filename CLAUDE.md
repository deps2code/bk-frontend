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
  `public/world/{index.json, c_<cx>_<cy>.bin, minimap.svg}`. Regions live in
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
- **Rendering layers** (`src/game/render/`): ground features + building
  shadows are rasterized into cached 512 px tiles per √2 zoom bucket
  (`groundCache.ts`); labels; then one y-sorted pass of buildings, trees and
  the player (`scene.ts`, sort key = south-most ground y). A tile painted while
  a needed chunk was still loading is marked incomplete and re-rendered.
- **Oblique buildings** (`buildings.ts`): "up the screen by h" is done as
  "north by h × HEIGHT_FACTOR" in chunk-local meters, so walls/roofs are plain
  Path2Ds drawn with the chunk transform. This relies on building rings being
  normalized at decode (outer CCW, holes CW): a wall is visible iff its edge
  runs eastward (dx > 0). Per-building Path2Ds are cached lazily on `b.gfx`.
- **Trees** (`trees.ts`): trunk per tree + crown image from a lazily built
  sprite atlas (shape × archetype × monumental × variant × √2 size bucket).
  Crown/shadow geometry is shared via `geometry.ts`; tree and building shadows
  are one multiply-blended path per chunk (`shadows.ts`), baked into ground
  tiles. The scene pass returns per-tree screen hit shapes; tap/click picks
  from those (front-most first), E picks the nearest tree within 12 m, and the
  `selection` store drives the TreeCard (strings from lazy `details.json`).
- **Collision** (`collision.ts`): per-chunk 0.5 m masks rasterized on a
  canvas — water blocked, then roads/paths/bridges/paved areas carved back out
  (canals are crossed at real bridges), then buildings (incl. neighbours'
  footprints) blocked; trunks are circles. Axis-separated sub-steps give wall
  sliding; a player already inside an obstacle moves freely until clear.
  G shows the masks in red.
- **Pointer input** (`game.ts`): tap = select tree, drag = floating joystick
  (writes `input.stick`, analog), two pointers = pinch zoom. Mouse drag also
  drives the joystick.
- **HUD** (`src/hud/`): React gets the `Game` handle (teleport, covers,
  minimap/map canvases); the game paints both map canvases itself from the
  rasterized `minimap.svg` (`src/game/minimap.ts`). Street/buurt tag comes
  from the nearest named road (`world.streetNear`) and the nearest tree's
  details (only once `details.json` has loaded — `peekDetails`). Keys: `/`
  search, M map, H help (first visit shows it once, localStorage), G debug.
  Game key handlers must ignore keys typed into inputs (`isTyping`).
- Teleports (search, map click, hash) set `settle`: once the chunk is loaded
  the player is moved to the nearest free spot (`collision.findFree`).
- Walk/bike mode lives in the `controls` store (`store.ts`, persisted to
  localStorage); F or the HUD toggle switches it.
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
chunk grid + collision masks, F to toggle the bike. Touch gestures: use a CDP
session (`Input.dispatchTouchEvent`); a `touchMove` > 10 px from the start is a
joystick drag. Click `.wl-btn-play` first to get past the
welcome screen. Check: map renders, trees align with streets, no console errors.
