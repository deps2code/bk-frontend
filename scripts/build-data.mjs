// Build pipeline: raw municipal GeoJSON -> compact static assets.
//
//   node scripts/build-data.mjs
//
// Reads  "Bomen gemeente Groningen.json" (68 MB GeoJSON)
// Writes public/data/trees.bin    binary columnar tree data (see FORMAT below)
//        public/data/details.json string-table-encoded popup details
//        public/data/search.json  street/buurt centroids for fly-to search
//
// FORMAT trees.bin (little endian). Trees are sorted by 250 m chunk of the
// RD grid (cy, then cx), north to south within a chunk; details.json uses the
// same order. Every section starts 4-byte aligned for typed-array views.
//   Uint32  N
//   Uint32  C                      number of non-empty chunks
//   per chunk [C]: Uint16 cx, Uint16 cy, Uint32 start, Uint32 count
//   Int32   x  (RD New, dm)  [N]
//   Int32   y  (RD New, dm)  [N]
//   Uint16  kiemjaar    [N]   0 = unknown, clamped to [1750, THIS_YEAR]
//   Uint8   height (m)  [N]   resolved, clamped to [3, 40]
//   Uint8   archetype   [N]   index into ARCHETYPES
//   Uint8   flags       [N]   bit0 monumental, bit1 height estimated
//
// search.json entries carry RD x/y (m) of the street/buurt centroid.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RAW = join(ROOT, "Bomen gemeente Groningen.json");
const OUT = join(ROOT, "public", "data");
const THIS_YEAR = new Date().getFullYear();
const CHUNK_SIZE = 250; // m — must match src/game/world.ts

// Fixed order — must match src/lib/archetypes.ts
const ARCHETYPES = [
  "Eik", "Es", "Linde", "Els", "Esdoorn", "Berk", "Wilg",
  "Populier", "Iep", "Beuk", "Plataan", "Conifeer", "Sierboom", "Overig",
];
const GENUS_TO_ARCHETYPE = {
  quercus: 0, fraxinus: 1, tilia: 2, alnus: 3, acer: 4, betula: 5,
  salix: 6, populus: 7, ulmus: 8, fagus: 9, carpinus: 9, platanus: 10,
  prunus: 12, crataegus: 12, sorbus: 12, malus: 12, pyrus: 12,
};
const CONIFER_GENERA = new Set([
  "pinus", "picea", "abies", "larix", "pseudotsuga", "tsuga", "cedrus",
  "taxus", "thuja", "thujopsis", "chamaecyparis", "cupressus",
  "cupressocyparis", "juniperus", "metasequoia", "sequoia",
  "sequoiadendron", "araucaria", "cryptomeria", "calocedrus", "taxodium",
]);

const HEIGHT_CLASS = {
  "tot 6 m.": 4.5,
  "6 tot 9 m.": 7.5,
  "9 tot 12 m.": 10.5,
  "12 tot 15 m.": 13.5,
  "15 tot 18 m.": 16.5,
  "18 tot 24 m.": 21,
  "24 m. en hoger": 26,
};

function archetypeOf(latin) {
  if (!latin) return 13;
  const genus = String(latin).trim().split(/\s+/)[0].toLowerCase().replace(/^x/, "");
  if (genus in GENUS_TO_ARCHETYPE) return GENUS_TO_ARCHETYPE[genus];
  if (CONIFER_GENERA.has(genus)) return 11;
  return 13;
}

console.log("reading raw dataset…");
const raw = JSON.parse(readFileSync(RAW, "utf8"));
const feats = raw.features.filter((f) => f.geometry?.coordinates);
const N = feats.length;
console.log(`${N} trees`);

const xs = new Int32Array(N);
const ys = new Int32Array(N);
const year = new Uint16Array(N);
const height = new Uint8Array(N);
const archetype = new Uint8Array(N);
const flags = new Uint8Array(N);

// string tables for details.json
const tables = { species: [], latin: [], streets: [], buurten: [], stadsdelen: [], owners: [] };
const tableIdx = Object.fromEntries(Object.keys(tables).map((k) => [k, new Map()]));
function intern(table, value) {
  const v = value == null || value === "" ? "—" : String(value);
  const m = tableIdx[table];
  if (!m.has(v)) { m.set(v, tables[table].length); tables[table].push(v); }
  return m.get(v);
}
const t = { id: [], sp: [], la: [], st: [], bu: [], sd: [], ow: [] };

// aggregation for search.json
const streetAgg = new Map(); // "STRAAT|WOONPLAATS" -> {sumLon,sumLat,c,straat,plaats}
const buurtAgg = new Map();

const stats = { estimated: 0, defaultHeight: 0, badYear: 0, monumental: 0, perArchetype: new Array(ARCHETYPES.length).fill(0) };

for (let i = 0; i < N; i++) {
  const p = feats[i].properties;
  const x = p.X_COORDINAAT;
  const y = p.Y_COORDINAAT;
  xs[i] = Math.round(x * 10);
  ys[i] = Math.round(y * 10);

  let yr = p.KIEMJAAR;
  if (!Number.isInteger(yr) || yr < 1750 || yr > THIS_YEAR) {
    if (yr != null) stats.badYear++;
    yr = 0;
  }
  year[i] = yr;

  let h = HEIGHT_CLASS[p.BOOMHOOGTE];
  let estimated = false;
  if (h === undefined) {
    estimated = true;
    stats.estimated++;
    if (yr > 0) {
      h = Math.min(4 + (THIS_YEAR - yr) * 0.35, 18);
    } else {
      h = 8;
      stats.defaultHeight++;
    }
  }
  height[i] = Math.max(3, Math.min(40, Math.round(h)));

  const a = archetypeOf(p.LATIJNSE_NAAM);
  archetype[i] = a;
  stats.perArchetype[a]++;

  const mon = p.MONUMENTAAL != null && p.MONUMENTAAL !== "";
  if (mon) stats.monumental++;
  flags[i] = (mon ? 1 : 0) | (estimated ? 2 : 0);

  t.id.push(p.OBJECT ?? "");
  t.sp.push(intern("species", p.BOOMSOORT));
  t.la.push(intern("latin", p.LATIJNSE_NAAM));
  t.st.push(intern("streets", p.STRAAT));
  t.bu.push(intern("buurten", p.BUURT));
  t.sd.push(intern("stadsdelen", p.STADSDEEL));
  t.ow.push(intern("owners", p.EIGENAAR));

  if (p.STRAAT) {
    const key = `${p.STRAAT}|${p.WOONPLAATS ?? ""}`;
    const e = streetAgg.get(key) ?? { sumX: 0, sumY: 0, c: 0, straat: p.STRAAT, plaats: p.WOONPLAATS ?? "" };
    e.sumX += x; e.sumY += y; e.c++;
    streetAgg.set(key, e);
  }
  if (p.BUURT) {
    const e = buurtAgg.get(p.BUURT) ?? { sumX: 0, sumY: 0, c: 0 };
    e.sumX += x; e.sumY += y; e.c++;
    buurtAgg.set(p.BUURT, e);
  }
}

// ---- sort by chunk ----
const chunkKey = (i) => Math.floor(ys[i] / 10 / CHUNK_SIZE) * 100000 + Math.floor(xs[i] / 10 / CHUNK_SIZE);
const order = Array.from({ length: N }, (_, i) => i).sort((a, b) => chunkKey(a) - chunkKey(b) || ys[b] - ys[a]);
const permute = (arr) => { const out = new arr.constructor(N); order.forEach((src, dst) => (out[dst] = arr[src])); return out; };
const sx = permute(xs), sy = permute(ys);
const sYear = permute(year), sHeight = permute(height), sArch = permute(archetype), sFlags = permute(flags);
for (const k of Object.keys(t)) t[k] = order.map((src) => t[k][src]);

const chunkTable = []; // [cx, cy, start, count]
for (let i = 0; i < N; i++) {
  const cx = Math.floor(sx[i] / 10 / CHUNK_SIZE), cy = Math.floor(sy[i] / 10 / CHUNK_SIZE);
  const last = chunkTable[chunkTable.length - 1];
  if (last && last[0] === cx && last[1] === cy) last[3]++;
  else chunkTable.push([cx, cy, i, 1]);
}

// ---- trees.bin ----
const C = chunkTable.length;
const pad4 = (n) => (n + 3) & ~3;
const buf = Buffer.alloc(pad4(8 + C * 12 + N * (4 + 4 + 2 + 1 + 1 + 1)));
let off = 0;
buf.writeUInt32LE(N, off); off += 4;
buf.writeUInt32LE(C, off); off += 4;
for (const [cx, cy, start, count] of chunkTable) {
  buf.writeUInt16LE(cx, off); buf.writeUInt16LE(cy, off + 2);
  buf.writeUInt32LE(start, off + 4); buf.writeUInt32LE(count, off + 8);
  off += 12;
}
for (const [arr, write, size] of [
  [sx, (v, o) => buf.writeInt32LE(v, o), 4],
  [sy, (v, o) => buf.writeInt32LE(v, o), 4],
  [sYear, (v, o) => buf.writeUInt16LE(v, o), 2],
  [sHeight, (v, o) => buf.writeUInt8(v, o), 1],
  [sArch, (v, o) => buf.writeUInt8(v, o), 1],
  [sFlags, (v, o) => buf.writeUInt8(v, o), 1],
]) {
  for (let i = 0; i < N; i++) { write(arr[i], off); off += size; }
}

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "trees.bin"), buf);

// ---- details.json ----
writeFileSync(join(OUT, "details.json"), JSON.stringify({ ...tables, t }));

// ---- search.json ----
const streetDupes = new Map(); // straat -> #woonplaatsen
for (const e of streetAgg.values())
  streetDupes.set(e.straat, (streetDupes.get(e.straat) ?? 0) + 1);
const search = [];
for (const e of streetAgg.values()) {
  const n = streetDupes.get(e.straat) > 1 && e.plaats ? `${e.straat} (${e.plaats})` : e.straat;
  search.push({ n, t: "s", x: Math.round(e.sumX / e.c), y: Math.round(e.sumY / e.c), c: e.c });
}
for (const [name, e] of buurtAgg) {
  search.push({ n: name, t: "b", x: Math.round(e.sumX / e.c), y: Math.round(e.sumY / e.c), c: e.c });
}
search.sort((a, b) => b.c - a.c);
writeFileSync(join(OUT, "search.json"), JSON.stringify(search));

// ---- report ----
console.log(`\ntrees.bin    ${(buf.length / 1e6).toFixed(2)} MB, ${C} chunks (max ${Math.max(...chunkTable.map((c) => c[3]))} trees/chunk)`);
console.log(`details.json ${(JSON.stringify({ ...tables, t }).length / 1e6).toFixed(2)} MB (uncompressed)`);
console.log(`search.json  ${search.length} entries`);
console.log(`\nheights estimated: ${stats.estimated} (${(100 * stats.estimated / N).toFixed(1)}%), of which default 8 m: ${stats.defaultHeight}`);
console.log(`kiemjaar rejected: ${stats.badYear}, monumental: ${stats.monumental}`);
console.log("\nper archetype:");
stats.perArchetype.forEach((c, i) => console.log(`  ${ARCHETYPES[i].padEnd(9)} ${c}`));
