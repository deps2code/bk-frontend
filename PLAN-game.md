# Plan: Bomenkomen as a free-roam browser game

Status: milestones 1–2 done (2026-10-25); map-app code and dependencies already removed. Replaces the MapLibre/deck.gl
map app. The tree data pipeline and `public/data/*` are reused.

## What we are building

A free-roam, top-down walking game in the browser. You walk through the real
city of Groningen and every one of the 124,990 municipal trees stands at its
real location. No goals, timers or scores: walk around, look at trees, tap
one to read about it.

The visual reference is the two screenshots from 2026-10-25 (`~/Pictures/Screenshots/Screenshot From 2026-10-25 16-58-*.png`):

- **Camera**: top-down **oblique / 3⁄4 view**. The ground is drawn straight
  from above. Buildings are fake-3D: the roof is the footprint shifted up the
  screen by its height, and the south-facing walls show as facades with
  windows. The camera follows the player and does not rotate.
- **Style**: flat cartoon. Clean fills, thin outlines, soft drop shadows, a
  round-crown tree sprite with a visible trunk, big translucent area names on
  the ground ("NOORDERPLANTSOEN"), dashed centre lines on roads.
- **UI**: small dark rounded HUD panels, a minimap in the bottom-right, the
  player's name over the character, and a virtual joystick on touch devices.

The look is borrowed, but the palette is Groningen's own: green parks, blue
*diepen* and canals, grey-brick streets, red-brown roofs, and sand only for
bare ground. HUD text is Dutch, like the current app.

## Key decisions

| Decision | Choice | Why |
|---|---|---|
| Renderer | **Canvas 2D**, no engine | The screenshot style is 2D. With chunk culling only a few hundred objects are on screen, so Canvas 2D is fast enough on phones and adds no dependency. If profiling says otherwise, the fallback is PixiJS v8 with the same data. |
| World units | **meters in RD New (EPSG:28992)** | The tree dataset already has `X_COORDINAAT`/`Y_COORDINAAT` in RD, Groningen is flat, and 1 unit = 1 m keeps collision and speeds simple. Origin is the Grote Markt. |
| Map data | **OpenStreetMap** (Geofabrik `groningen-latest.osm.pbf`, at build time — Overpass was too overloaded) | Gives roads, water, parks, landuse, rail and names. Dutch OSM building footprints come from the BAG import (`ref:bag`), so they are accurate. |
| Building heights | **3D BAG** joined on BAG id, with an OSM `building:levels` × 3 m fallback and a 9 m default | Real heights give the city its real skyline (Martinitoren, Gasunie, Forum). The screen offset uses a compressed factor so tall buildings don't cover the street. |
| Streaming | **250 m chunks**, loaded within about 2 chunks of the player | The whole municipality is about 20 × 22 km and too big to load at once. The first chunks are small, so the player can start walking within seconds. |
| UI framework | Keep **React for the HUD only**. The game loop is plain TypeScript in `src/game/` | React already exists in the project. The HUD reads a small store, and the 60 fps loop never touches React. |
| Removed | MapLibre, deck.gl, luma, the sidebar filters, the 3D meshes and LOD | None of them fit a 2D game camera. |
| Kept | `build-data.mjs` (extended), `archetypes.ts` (colors), `details.ts` (popup data, search), `trees.bin` concept | The tree data work is already done and correct. |

## Architecture

```
scripts/
  build-data.mjs      (existing) trees -> adds RD x/y, sorted by chunk + chunk index
  extract-osm.mjs     NEW  Geofabrik .osm.pbf -> raw/osm-<region>.json (gitignored)
  fetch-3dbag.mjs     NEW  3D BAG heights -> raw/3dbag-heights.json (gitignored)
  build-world.mjs     NEW  raw/* -> public/world/{index.json, c_<cx>_<cy>.bin, minimap.png}
src/
  main.tsx, App.tsx   shell: <canvas> + <Hud/>
  game/
    loop.ts           requestAnimationFrame, fixed-step update, render
    camera.ts         follows the player; world<->screen; zoom (pinch/wheel, clamped)
    world.ts          chunk index, streaming loader, LRU unload
    render/
      ground.ts       roads/water/parks/landuse -> per-chunk cached offscreen bitmap
      buildings.ts    oblique extrusion: shadow, south facades + windows, roof
      trees.ts        sprite atlas per shape x archetype color x size bucket
      sprites.ts      player (4-dir walk cycle), shadows
      labels.ts       area names painted on the ground
    player.ts         movement, speed, facing, walk animation
    input.ts          keyboard (arrows/WASD, Shift = faster) + joystick vector
    collision.ts      circle vs building polygons, water, tree trunks (per-chunk grid)
    store.ts          tiny pub/sub for the HUD (location, selected tree, fps)
  hud/
    Joystick.tsx      touch only; floating origin where the thumb lands
    TreeCard.tsx      tap a tree (or press E near one) -> species, height, age, monumental
    LocationTag.tsx   "Oosterstraat · Binnenstad" (nearest street name)
    Minimap.tsx       pre-baked city image + player dot + heading
    Search.tsx        reuses search.json -> teleport
  lib/                archetypes.ts, details.ts (kept), loadTrees.ts (adapted)
```

### Chunk format (`c_<cx>_<cy>.bin`)

Coordinates are Int16 decimeters relative to the chunk's south-west corner
(range 0–2500, so there is no precision loss). The chunk has these sections:

- **ground polygons**: kind (water, park/grass, sand, pavement, rail) + rings
- **roads**: OSM highway class (sets width and colour), polyline, `name` id, bridge flag
- **buildings**: outline ring, height in meters, a colour seed, BAG id (optional)
- **labels**: name id, position, size (parks, squares, neighbourhoods)
- **trees**: start index and count into the chunk-sorted `trees.bin`

Shared string tables (street and area names) go in `index.json`. The
pipeline prints a stats report, like `build-data` does: chunk count, total
buildings, % of heights from 3D BAG / levels / default, and total size.
Target: under 15 MB for the whole municipality and under 1 MB before first play.

### Rendering order per frame

1. Blit the cached ground bitmaps of the visible chunks. A chunk's bitmap is
   re-rendered only when the zoom bucket changes.
2. Draw all ground shadows (buildings and tree crowns) in one pass.
3. **Y-sort** the visible buildings, trees and the player by their south-most
   ground y, then draw them back to front. This matches what the screenshot does.
4. Labels and the name tag above the player.
5. When the player is hidden behind a facade, draw that building at about 40%
   alpha (a standard top-down trick), so the player is never lost.

### Trees

- Every tree is a sprite drawn from data: crown shape from its archetype
  (round, oval, weeping, conifer), crown colour from `ARCHETYPES`, and crown
  size and trunk height scaled by `height`. The existing deterministic
  `jitter(i)` varies size, tint and offset.
- **Monumental trees** get a gold crown rim and a soft glow, and show as gold
  dots on the minimap.
- The sprites are pre-rendered into an atlas at load time: 4 shapes × 14
  colours × about 4 size buckets × monumental yes/no. No image assets are needed.
- Interaction: tap or click a crown, or walk next to a tree and press `E`, to
  open the TreeCard. It uses the existing `details.json`, which is lazy-loaded.
- Collision: a trunk is a circle of about 0.4 m that blocks the player. The
  crown does not block.

### Movement and controls

- **Desktop**: arrows or WASD, with diagonals normalised; Shift walks faster.
  The mouse wheel zooms within a clamp.
- **Mobile**: a floating joystick in the bottom-left that is analog (speed
  scales with how far you push it), a tap opens a tree, and two-finger pinch
  zooms. Also: `touch-action: none`, no page scroll or bounce,
  `viewport-fit=cover`, safe-area insets, and a landscape and portrait layout.
- Collision is a circle against building polygons and water. Roads and bridges
  are walkable over water, so the *diepen* are crossed at the real bridges.
  The player slides along walls instead of stopping dead.
- The spawn point is the Grote Markt. The position is kept in the URL hash
  (`#p=<x>/<y>`), so you can share where you are standing.

## Milestones

Each milestone ends with a playable build that has been checked headless
(Playwright plus SwiftShader, as in CLAUDE.md, with a mobile-emulation pass
at 390×844 with touch).

1. **Branch + skeleton**: create a `game` branch. Fullscreen canvas, game
   loop, camera, keyboard player on an empty grid, with an fps counter.
2. **World pipeline (city centre first)**: write `fetch-osm`, `build-world`,
   and RD coordinates plus chunk sorting in `build-data`. Bbox: inside the
   Diepenring plus one ring of chunks. Check visually that the Diepenring,
   the Grote Markt and the Noorderplantsoen are recognisable.
3. **Ground + buildings renderer**: chunk bitmap cache, oblique buildings
   with facades and windows, y-sort, the transparency trick.
4. **Trees**: sprite atlas, per-chunk trees, monumental styling, tap to
   open the TreeCard.
5. **Collision + joystick + mobile pass**: walls, water and bridges, trunks,
   joystick, pinch, safe areas. Profile on a real phone.
6. **HUD**: location tag, minimap (pipeline-baked), search/teleport, short
   controls hint on first visit.
7. **Whole municipality + 3D BAG heights**: expand the bbox to all of
   Groningen, Haren and Ten Boer, add `fetch-3dbag` and the height join,
   streaming and LRU tuning.
8. **Cleanup**: remove the map dependencies and dead code (`MapView`,
   `Sidebar`, `layers`, `meshes`, `lod`, `filters`, `urlState`). Rewrite
   CLAUDE.md, README.md and DESIGN.md, and add the ODbL + CC BY attribution
   line.

## Performance budget

- 60 fps on a mid-range phone (Pixel 6a / iPhone 12 class); devicePixelRatio
  capped at 2.
- A typical frame draws at most about 9 cached ground bitmaps, at most about
  150 buildings and at most about 600 tree sprites.
- First play under 3 s on 4G. Load in this order: the starting chunks and
  their trees, then the neighbours, then `details.json` and the minimap.
- Memory: ground-bitmap LRU capped at about 24 chunks.

## Risks / open items

- **Big or concave buildings** (Martini Plaza, campus blocks) can y-sort
  wrongly against the player. The transparency trick hides most cases. If
  needed, split the footprint into convex parts in the pipeline.
- **The 3D BAG access method** (WFS vs. tile downloads) needs to be verified
  in milestone 7. Until then the levels/default heights work.
- ~~Overpass limits~~: resolved — OSM comes from the Geofabrik extract.
- **Tree positions vs. OSM geometry**: a few trees will stand on roads or
  inside buildings. Leave them as they are (it is real data) but skip
  collision for trunks inside building polygons.
- **Style tuning**: the cartoon palette and window patterns need a few
  rounds of screenshot iteration. Budget time for it in milestones 3–4.

## Not in scope

Multiplayer, missions, scores, NPCs, cars, day/night, sound. All of these
can be added later on top of the same world data.
