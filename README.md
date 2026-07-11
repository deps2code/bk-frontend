# Bomenkomen 🌳

Interactive 3D web map of all **124,990 municipal trees** in the gemeente
Groningen. Stylized low-poly trees — colored by species, scaled by height, with
the city's 14,896 *monumentale bomen* highlighted in gold — on a muted 3D
basemap with extruded buildings.

Built with **Vite + React + TypeScript**, **MapLibre GL JS** (basemap, camera,
`fill-extrusion` buildings) and **deck.gl** as an interleaved `MapboxOverlay`
(instanced tree rendering, GPU-side filtering). Fully static — no backend.
See [DESIGN.md](DESIGN.md) for the full design rationale.

## Quickstart

```bash
npm install
npm run build-data   # requires the raw dataset, see below
npm run dev          # http://localhost:5173
```

The raw dataset `Bomen gemeente Groningen.json` (68 MB GeoJSON from the
municipal open-data portal) lives in the project root and is gitignored. It is
only needed for `build-data`; the generated artifacts in `public/data/` are
what the app actually loads.

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | typecheck (`tsc -b`) + production build to `dist/` |
| `npm run preview` | serve the production build |
| `npm run build-data` | raw GeoJSON → `public/data/{trees.bin, details.json, search.json}` |

## Features

- **Two render modes by zoom**: colored dots below zoom ~14 (whole-city species
  map), instanced low-poly 3D trees above, with a cross-fade. Per-tree
  deterministic rotation/scale jitter avoids the copy-paste-forest look.
- **Near-camera detail (LOD)**: above zoom ~15.3 the ≤12k trees nearest the
  camera get richer meshes — multi-lobed shaded crowns, tapered trunks with
  branch stubs — while the rest keep the cheap ~30-triangle mesh.
- **Click a tree** → popup with species (Dutch + Latin), height (marked
  *geschat* when estimated), kiemjaar + age, street/buurt/stadsdeel, owner and
  a *Monumentale boom* badge.
- **GPU filters** (instant, no re-upload): species archetypes, height range,
  kiemjaar range, monumental-only — plus a live visible-tree count.
- **Search** streets and buurten with fly-to.
- **Shareable URLs**: camera and filters are encoded in the hash, e.g.
  `#m=6.55830/53.22620/17.4/62/-25&mon=1`.

## Data pipeline

`scripts/build-data.mjs` cleans and compacts the raw 68 MB GeoJSON into:

- **`trees.bin`** (~1.6 MB) — binary columnar, little endian: `Uint32 N`, then
  parallel arrays `Int32 lon×1e7`, `Int32 lat×1e7`, `Uint16 kiemjaar`
  (0 = unknown, clamped to [1750, current year]), `Uint8 height` (m, resolved,
  clamped to [3, 40]), `Uint8 archetype`, `Uint8 flags` (bit 0 monumental,
  bit 1 height estimated). Loaded in one fetch, feeds deck.gl accessors with
  zero per-object parsing.
- **`details.json`** (~3.3 MB) — string-table-encoded popup details, fetched
  lazily after first paint.
- **`search.json`** — street/buurt centroids + tree counts for the search box.

Cleaning rules: height classes map to their midpoint ("12 tot 15 m." → 13.5);
missing heights (53% of trees!) are estimated from kiemjaar, else default 8 m;
kiemjaar outliers (the data contains 190 and 2098) are treated as unknown; the
528 raw species are bucketed by genus into 14 visual archetypes (Eik, Es,
Linde, … Conifeer, Sierboom, Overig), each with a fixed crown color and one of
four crown shapes (round, oval, weeping, conifer).

## Source layout

```
scripts/build-data.mjs   data pipeline (run at build time, not in the browser)
src/main.tsx             entry
src/App.tsx              state: tree data, filters, visible count, fly-to
src/MapView.tsx          MapLibre init, deck.gl overlay, 3D buildings, popup, clicks
src/Sidebar.tsx          filters UI, search box, dual-range slider
src/lib/loadTrees.ts     trees.bin decoder + per-shape index tables
src/lib/layers.ts        deck.gl layer factory (dots + instanced mesh layers, base + detail)
src/lib/meshes.ts        procedural tree meshes, base + detailed LOD (no GLTF assets)
src/lib/lod.ts           near-camera selection for the detailed meshes
src/lib/archetypes.ts    archetype table: names, colors, shapes (order = build-data.mjs)
src/lib/filters.ts       filter model + GPU filter encoding + CPU count
src/lib/details.ts       lazy details/search loaders, search matching
src/lib/popup.ts         popup HTML
src/lib/urlState.ts      camera + filters ⇄ URL hash
```

## Deployment

`npm run build`, then host `dist/` on any static host (GitHub Pages, Netlify,
…). The basemap uses [OpenFreeMap](https://openfreemap.org) (no API key). Set
Vite's `base` if deploying under a subpath.

## Data source

Tree data: open data of the gemeente Groningen. Basemap: © OpenStreetMap
contributors via OpenFreeMap/OpenMapTiles.
