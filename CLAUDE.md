# CLAUDE.md

3D map of Groningen's 124,990 municipal trees. MapLibre GL JS basemap +
deck.gl interleaved `MapboxOverlay` for the trees. Static app, no backend.
Design rationale in DESIGN.md, user docs in README.md. UI text is Dutch.

## Commands

- `npm run dev` — dev server on :5173
- `npm run build` — `tsc -b` typecheck + Vite build (run this to typecheck)
- `npm run build-data` — regenerate `public/data/*` from the gitignored
  `Bomen gemeente Groningen.json` (68 MB raw GeoJSON in the project root).
  The generated artifacts are committed, so this only needs to run when the
  raw dataset or the pipeline changes. It prints a stats report — sanity-check
  it (125k trees, ~53% estimated heights).

## Architecture invariants

- **Archetype order is a cross-file contract**: the 14-entry `ARCHETYPES`
  array in `src/lib/archetypes.ts` must match the order in
  `scripts/build-data.mjs` — `trees.bin` stores archetype as an index into it.
  Changing either side requires regenerating the data.
- **`trees.bin` layout** is documented at the top of `scripts/build-data.mjs`;
  the decoder is `src/lib/loadTrees.ts`. Keep them in lockstep.
- **Virtual data + stable identity**: deck.gl layers get `{length}` virtual
  data objects created once in `loadTrees()`; accessors read straight from the
  typed arrays. Never recreate these objects per render — deck would re-upload
  all 125k instances. Filter changes must go through `DataFilterExtension`
  uniforms only (see `filters.ts` / `layers.ts`).
- **Near-camera LOD is additive, not a swap**: `src/lib/lod.ts` picks ≤12k
  trees around the camera focus on `moveend` (zoom ≥ 15.3); those get a
  detailed mesh (`trees-hi-*` layers) drawn *on top of* their still-rendered
  base mesh — same color and opaque, so the base merging into the silhouette
  is invisible. The `trees-hi-*` layers are `pickable: false`; picking/hover
  stay on the base layers. Detail selection gets fresh data objects per
  recompute (small re-upload); never touch the base layers' identity for LOD.
- **`kiemjaar === 0` means unknown**. The year filter only excludes
  unknown-year trees when the user narrows the slider (`yearRangeActive`);
  keep that semantic when touching filters.
- Heights are pre-resolved in the pipeline (class midpoint → kiemjaar estimate
  → 8 m default) and flagged (`flags` bit 1) so the popup can say "geschat".

## Gotchas learned the hard way

- **deck.gl's own click path does not work here.** In interleaved
  `MapboxOverlay` mode, mjolnir's tap recognizer never fires, so per-layer
  `onClick` / deck-level `onClick` are dead. Clicks are routed via
  `map.on("click")` → `overlay.pickObject()` → `pickedGlobalIndex()`
  (`src/lib/layers.ts`). Don't "simplify" back to layer `onClick`.
  Hover picking (deck `onHover`, used for the cursor) does work.
- Mesh-layer picking indices are per-shape: `pickedGlobalIndex()` maps a
  `trees-<shape>` layer index through `data.shapeIndices[shape]` back to the
  global tree index. All per-tree arrays are indexed by that global index.
- A hash-only `page.goto()` doesn't move the camera (same-document
  navigation) — reload after setting the hash when testing.
- `pickObject()` reads the GPU picking buffer, so in tests it happily "finds"
  trees behind the DOM sidebar — clicking there hits the sidebar (and may
  toggle a filter). Scan for click targets at x ≳ 460 only.
- The tree layers pass `beforeId` (first symbol layer) so map labels draw on
  top; the 3D buildings layer is inserted at the same point in `MapView.tsx`.

## Verifying changes (headless)

No test suite; verify by driving the real app:

```bash
npm run dev &
npm i --no-save playwright-core   # keep package.json clean
```

Launch the cached Chromium (`~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome`)
with `--no-sandbox --use-angle=swiftshader` (WebGL2 via SwiftShader works,
including deck picking). In dev builds `window.__overlay` exposes the
`MapboxOverlay` — use `__overlay.pickObject({x, y, radius})` to find clickable
tree pixels instead of blind coordinate clicking. Useful camera hashes:
`#m=6.55830/53.22620/17.4/0/0` (dense park, 3D mode),
`#m=6.58000/53.21500/11.6/0/0` (whole city, dots mode).
Check: trees render in both modes, popup opens on click, filter changes update
the visible count, no console errors.
