# Bomenkomen — 3D tree map of Groningen

Interactive 3D web map of all ~125,000 municipal trees in the gemeente Groningen,
rendered as instanced low-poly trees on a muted 3D city basemap.

## The data (measured, not assumed)

Source: `Bomen gemeente Groningen.json` — GeoJSON FeatureCollection, 68 MB raw.

| Fact | Value | Design consequence |
|---|---|---|
| Trees | 124,990 | GPU instancing required; still small enough for one static file, no tiles/backend |
| Distinct species | 528 | Bucket by genus into ~10 visual archetypes |
| Top species | Zomereik 15k, Gewone es 11.5k, Hollandse linde 6k, Zwarte els 5.9k, Gewone esdoorn 5.7k, Ruwe berk 5.1k, ... | Top ~15 species cover the bulk; everything else → "generic" archetype |
| Height (`BOOMHOOGTE`) | 7 classes ("tot 6 m." … "24 m. en hoger"), **53% missing** | Use class midpoint; estimate missing from kiemjaar, else default 8 m |
| Planting year (`KIEMJAAR`) | present for 58k trees, range 190–2098 (dirty) | Clamp to [1750, 2026]; treat out-of-range as unknown |
| Monumental | 14,896 trees | First-class filter + visual highlight — the "wow" feature |
| Bbox | 6.466–6.762 E, 53.109–53.313 N | Whole municipality incl. Haren/Ten Boer; initial view on city center |
| Other fields | STRAAT, BUURT, STADSDEEL, WOONPLAATS, LATIJNSE_NAAM, EIGENAAR | Popup details + search/fly-to by street/buurt |

## Look & feel decision: stylized

Realistic rendering at 125k instances is neither feasible nor desirable. The design
is **stylized low-poly**: quiet gray-white extruded buildings, desaturated streets,
and trees as the only saturated color on the map. Think architecture-model diorama.
Monumental trees get a distinct treatment (e.g. warm gold-tinted crown or subtle
glow ring) so they read at a glance.

## Stack

- **Vite + React + TypeScript**
- **MapLibre GL JS** — basemap, camera, 3D buildings via `fill-extrusion`
- **deck.gl** via `MapboxOverlay` (interleaved mode) — tree rendering
- Basemap tiles: **OpenFreeMap** (free, no key, includes OSM buildings) with a
  custom muted style; fallback option: self-hosted Protomaps PMTiles extract of
  Groningen (~tens of MB) for zero external dependency.
- Hosting: static (GitHub Pages / Netlify). **No backend** — the `backend/` dir
  stays empty unless we later add nightly data refresh from the municipal API.

## Data pipeline (`scripts/build-data.mjs`, runs at build time)

Raw 68 MB GeoJSON → two static artifacts:

1. **`public/data/trees.bin`** — binary columnar, parallel typed arrays:
   - `lon`, `lat` : Float32 (or Int32 quantized to ~cm — bbox is small)
   - `heightM` : Uint8 (resolved height in meters, see below)
   - `archetype` : Uint8 (genus bucket index)
   - `year` : Uint16 (0 = unknown)
   - `flags` : Uint8 (bit 0 = monumental)
   - ≈ 125k × 14 bytes ≈ **1.8 MB** (~1 MB gzipped). Loads in one fetch,
     feeds deck.gl attributes directly with zero per-object JS parsing.
2. **`public/data/details.json`** — per-tree popup data (species NL + Latin,
   street, buurt, stadsdeel, owner), string-table encoded, indexed by the same
   array position. ~3–4 MB gzipped, fetched lazily after first paint.

Cleaning rules:
- `BOOMHOOGTE` → midpoint of class (e.g. "12 tot 15 m." → 13.5; "24 m. en hoger" → 26).
- Missing height → estimate from clamped kiemjaar (age curve capped at 18 m),
  else default 8 m. Record an "estimated" flag so the popup can say "geschat".
- `KIEMJAAR` outside [1750, 2026] → unknown.
- Species → archetype via genus keyword map:
  eik/Quercus, es/Fraxinus, linde/Tilia, els/Alnus, esdoorn/Acer, berk/Betula,
  wilg/Salix, populier/Populus, iep/Ulmus, beuk+haagbeuk/Fagus+Carpinus,
  plataan/Platanus, conifer (Pinus/Picea/Taxus/…), **generic** fallback.
  Each archetype = one crown color + one of ~4 low-poly GLTF models
  (round, columnar, weeping, conifer).

## Rendering the trees

Single dataset, two deck.gl layers swapped by zoom (both instanced, both trivially
handle 125k):

- **Zoom < 14 — dots**: `ScatterplotLayer`, radius scaled by tree height, color by
  archetype. Reads as a density/species map of the whole city.
- **Zoom ≥ 14 — 3D models**: `SimpleMeshLayer` with 4 procedurally generated
  low-poly crown meshes (round, oval, weeping, conifer — see `src/lib/meshes.ts`;
  no GLTF assets needed). Per-instance: scale from `heightM`, deterministic pseudo-random
  rotation + ±10% scale jitter from tree index (stable across frames, kills the
  copy-paste look). Cross-fade opacity over zoom 13.5–14.5 so the switch is soft.
- **Near-camera LOD** (zoom ≥ 15.3): the ≤12k trees nearest the camera focus
  (selected on `moveend`, `src/lib/lod.ts`) additionally draw a detailed mesh —
  multi-lobed crown with baked per-face shading, tapered trunk, branch stubs —
  on top of their base mesh. Everything else stays at ~30 tris, so total
  vertex cost remains a few million triangles.
- Monumental: brighter/warmer crown color in both modes; optional pulsing ring in
  "monumental" filter mode.

Filters are GPU-side via `DataFilterExtension` (archetype, height range, plant-year
range, monumental) — no re-upload, instant sliders.

Buildings: MapLibre `fill-extrusion` from OpenFreeMap building heights, muted
facade palette (brick/sand/plaster) hashed off the feature id, vertical gradient
plus a fixed-position light (`map.setLight`, anchor `map`) for directional wall
shading; deck.gl interleaved mode gives correct depth-occlusion between trees
and buildings. OpenMapTiles ships `render_height: 0` for buildings without OSM
height data — those get a per-building pseudo-random 5–9 m so they never
disappear.

## Interaction

- Standard MapLibre controls: pan/zoom/rotate/tilt (pitch up to ~70°), 45° initial
  tilt on load, camera starts over the Grote Markt / Noorderplantsoen.
- **Click a tree** → popup: species (NL + Latijn), height (met "geschat" indien
  gescat), plantjaar + leeftijd, straat/buurt, monumentaal-badge.
- **Sidebar**:
  - species filter (top 15 + genus groups, with tree counts)
  - height + plant-year range sliders
  - "alleen monumentale bomen" toggle
  - search box: straat/buurt → fly-to (built from the details string tables,
    fuzzy match client-side)
  - live count of visible trees
- URL hash encodes camera + filters for shareable views.

## Build order

1. **Scaffold**: Vite + React + MapLibre with OpenFreeMap muted style, 3D buildings,
   tilt — camera over Groningen. *(city visible, no trees)*
2. **Pipeline**: `build-data.mjs` producing `trees.bin` + `details.json`, with a
   small stats report (counts per archetype, % estimated heights) to verify cleaning.
3. **Dots**: ScatterplotLayer from `trees.bin`. Sanity-check positions against
   streets (Noorderplantsoen and Stadspark should light up densely).
4. **3D**: 4 procedural low-poly tree meshes, SimpleMeshLayer with jitter,
   zoom cross-fade.
5. **Interaction**: picking + popup (lazy details fetch), sidebar filters via
   DataFilterExtension, search/fly-to, URL hash.
6. **Polish**: monumental highlight, lighting/sky at high pitch, mobile layout,
   Lighthouse pass (target: interactive < 3 s on fast 3G thanks to the 1 MB bin).

## Risks / open items

- OpenFreeMap building coverage in Groningen suburbs — verify in step 1; Protomaps
  extract is the fallback.
- ScenegraphLayer perf with 125k instances on weak iGPUs — if it stutters, cap 3D
  mode to viewport-filtered instances (cheap CPU cull on pan-end) or raise the 3D
  zoom threshold.
- The municipal dataset likely updates; pipeline is one command, so refresh is
  re-run + redeploy. Only automate (backend/cron) if it becomes a habit.
