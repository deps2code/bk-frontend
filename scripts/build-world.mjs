// Build the streamed world chunks from extracted OSM data.
//
//   node scripts/build-world.mjs [region]          (default: centrum)
//
// Reads  raw/osm-<region>.json (see extract-osm.mjs)
// Writes public/world/index.json        chunk list + shared name table
//        public/world/c_<cx>_<cy>.bin   one file per non-empty chunk
//        public/world/minimap.svg       simplified overview map of the region
//
// FORMAT c_<cx>_<cy>.bin (little endian). Points are Int16 x/y pairs in
// decimeters relative to the chunk's south-west corner (cx*250, cy*250).
//   Uint8  version (1), Uint8 reserved
//   Uint16 nGround, nLines, nBuildings, nLabels
//   ground   × nGround:    Uint8 kind, Uint8 nRings, rings
//   lines    × nLines:     Uint8 kind, Uint8 flags (bit0 bridge), Uint16 width dm,
//                          Uint16 nameId (0xFFFF none), Uint16 nPts, pts
//   building × nBuildings: Uint8 kind, Uint8 nRings, Uint16 height dm, rings
//   label    × nLabels:    Uint8 kind, Uint16 nameId, Int16 x, Int16 y
//   ring:                  Uint16 nPts, pts (closed; first point not repeated)
// Ground polygons are clipped to the chunk (+1 m), lines to the chunk (+25 m),
// so each chunk renders on its own. Buildings are not clipped: each lives in
// the chunk holding its centroid. Kind enums mirror src/game/worldFormat.ts.
// Map data © OpenStreetMap contributors, ODbL.

import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CHUNK_SIZE, REGIONS, regionBBoxRD } from "./lib/regions.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "world");
const GROUND_PAD = 1;
const LINE_PAD = 25;
const NO_NAME = 0xffff;
const BASE_GROUND = "#e7dfc8"; // = src/game/render/palette.ts

// ---- enums (order = draw order; must match src/game/worldFormat.ts) ----
const G = { farmland: 0, industrial: 1, grass: 2, wood: 3, pitch: 4, sand: 5, water: 6, paved: 7 };
const L = { major: 0, medium: 1, minor: 2, service: 3, foot: 4, cycle: 5, rail: 6, water: 7 };
const B = { generic: 0, house: 1, apartments: 2, commercial: 3, religious: 4, industrial: 5, public: 6, small: 7 };
const LB = { square: 0, park: 1, water: 2, neighbourhood: 3, quarter: 4 };

const name = process.argv[2] ?? "centrum";
const region = REGIONS[name];
if (!region) throw new Error(`unknown region "${name}"`);
const raw = JSON.parse(readFileSync(join(ROOT, "raw", `osm-${name}.json`), "utf8"));

// ---- classification ----------------------------------------------------

function groundKind(t) {
  if (t.natural === "water" || t.water || t.landuse === "basin" || t.landuse === "reservoir" ||
    t.waterway === "riverbank" || t.waterway === "dock") return G.water;
  if (t.place === "square" || t["area:highway"] || (t.highway && t.area === "yes") ||
    t.amenity === "parking" || t.amenity === "marketplace" || t.man_made === "pier" || t.man_made === "bridge") return G.paved;
  if (t.natural === "wood" || t.natural === "scrub" || t.landuse === "forest") return G.wood;
  if (t.leisure === "pitch" || t.leisure === "track" || t.leisure === "playground") return G.pitch;
  if (t.natural === "sand" || t.natural === "beach" || ["construction", "brownfield", "landfill"].includes(t.landuse)) return G.sand;
  if (["park", "garden", "common", "dog_park", "golf_course"].includes(t.leisure) ||
    ["grassland", "heath", "wetland"].includes(t.natural) || t.amenity === "grave_yard" ||
    ["grass", "meadow", "village_green", "recreation_ground", "cemetery", "greenfield", "allotments", "flowerbed"].includes(t.landuse)) return G.grass;
  if (["farmland", "farmyard", "orchard", "vineyard", "plant_nursery", "greenhouse_horticulture"].includes(t.landuse)) return G.farmland;
  if (["industrial", "railway", "port", "depot"].includes(t.landuse)) return G.industrial;
  return -1;
}

const HIGHWAY = {
  motorway: [L.major, 12], trunk: [L.major, 12], primary: [L.major, 11],
  secondary: [L.medium, 9], tertiary: [L.medium, 8],
  residential: [L.minor, 7], unclassified: [L.minor, 6], living_street: [L.minor, 6], road: [L.minor, 6],
  service: [L.service, 4],
  pedestrian: [L.foot, 6], footway: [L.foot, 2.5], path: [L.foot, 2], steps: [L.foot, 2],
  bridleway: [L.foot, 2.5], track: [L.foot, 3],
  cycleway: [L.cycle, 3],
};
const WATERWAY = { river: 15, canal: 10, stream: 3, ditch: 1.5, drain: 1.5 };

function lineKind(t) {
  if (t.tunnel && t.tunnel !== "no" && t.tunnel !== "building_passage") return null;
  if (t.highway) {
    const base = t.highway.replace(/_link$/, "");
    const hit = HIGHWAY[base];
    return hit ? { kind: hit[0], width: hit[1] } : null;
  }
  if (t.railway) return { kind: L.rail, width: 2 };
  if (t.waterway && WATERWAY[t.waterway]) {
    const w = parseFloat(t.width);
    return { kind: L.water, width: Number.isFinite(w) && w > 0 && w < 60 ? w : WATERWAY[t.waterway] };
  }
  return null;
}

function buildingKind(v) {
  if (["house", "detached", "semidetached_house", "terrace", "residential", "bungalow", "farm"].includes(v)) return B.house;
  if (["apartments", "dormitory", "hotel"].includes(v)) return B.apartments;
  if (["commercial", "retail", "office", "supermarket", "kiosk"].includes(v)) return B.commercial;
  if (["church", "cathedral", "chapel", "religious", "mosque", "synagogue", "temple"].includes(v)) return B.religious;
  if (["industrial", "warehouse", "manufacture", "hangar", "service", "transformer_tower"].includes(v)) return B.industrial;
  if (["school", "university", "college", "public", "civic", "government", "hospital", "train_station", "museum", "library"].includes(v)) return B.public;
  if (["garage", "garages", "shed", "roof", "carport", "hut", "cabin", "toilets", "bicycle_parking"].includes(v)) return B.small;
  return B.generic;
}

const DEFAULT_HEIGHT = { [B.house]: 8, [B.apartments]: 15, [B.commercial]: 11, [B.religious]: 18, [B.industrial]: 8, [B.public]: 12, [B.small]: 3 };

function buildingHeight(t, kind, stats) {
  const h = parseFloat(String(t.height ?? "").replace(",", "."));
  if (Number.isFinite(h) && h > 1 && h < 200) {
    stats.hTag++;
    return h;
  }
  const lv = parseFloat(t["building:levels"]);
  if (Number.isFinite(lv) && lv > 0 && lv < 60) {
    stats.hLevels++;
    const roof = parseFloat(t["roof:levels"]);
    return lv * 3 + (Number.isFinite(roof) ? roof * 2 : 1);
  }
  stats.hDefault++;
  return DEFAULT_HEIGHT[kind] ?? 9;
}

const isAreaTags = (t) =>
  (t.building && t.building !== "no") || groundKind(t) >= 0 || t.area === "yes" ||
  (t.landuse !== undefined) || (t.natural !== undefined && t.natural !== "tree_row") || t.leisure !== undefined;

// ---- geometry helpers (flat [x0, y0, x1, y1, …] arrays) ----------------

const closed = (xy) => xy.length >= 8 && xy[0] === xy[xy.length - 2] && xy[1] === xy[xy.length - 1];
const openRing = (xy) => (closed(xy) ? xy.slice(0, -2) : xy);

function reversePairs(xy) {
  const out = new Array(xy.length);
  for (let i = 0, j = xy.length - 2; j >= 0; i += 2, j -= 2) {
    out[i] = xy[j];
    out[i + 1] = xy[j + 1];
  }
  return out;
}

/** Join multipolygon member ways into closed rings by matching endpoints. */
function assembleRings(parts, stats) {
  const rings = [];
  const open = [];
  for (const p of parts) (closed(p) ? rings : open).push(p);
  while (open.length) {
    let cur = open.pop();
    let progress = true;
    while (!closed(cur) && progress) {
      progress = false;
      const n = cur.length;
      for (let i = 0; i < open.length; i++) {
        const p = open[i];
        const m = p.length;
        if (cur[n - 2] === p[0] && cur[n - 1] === p[1]) cur = cur.concat(p.slice(2));
        else if (cur[n - 2] === p[m - 2] && cur[n - 1] === p[m - 1]) cur = cur.concat(reversePairs(p).slice(2));
        else if (cur[0] === p[m - 2] && cur[1] === p[m - 1]) cur = p.concat(cur.slice(2));
        else if (cur[0] === p[0] && cur[1] === p[1]) cur = reversePairs(p).concat(cur.slice(2));
        else continue;
        open.splice(i, 1);
        progress = true;
        break;
      }
    }
    if (closed(cur)) rings.push(cur);
    else stats.brokenRings++;
  }
  return rings;
}

function bboxOf(rings) {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const xy of rings) {
    for (let i = 0; i < xy.length; i += 2) {
      if (xy[i] < b.minX) b.minX = xy[i];
      if (xy[i] > b.maxX) b.maxX = xy[i];
      if (xy[i + 1] < b.minY) b.minY = xy[i + 1];
      if (xy[i + 1] > b.maxY) b.maxY = xy[i + 1];
    }
  }
  return b;
}

/** Douglas–Peucker on a flat [x0, y0, …] polyline. */
function simplify(xy, tol) {
  const n = xy.length / 2;
  if (n <= 2) return xy;
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const ax = xy[2 * a], ay = xy[2 * a + 1], bx = xy[2 * b], by = xy[2 * b + 1];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    let worst = -1, dmax = tol;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (ay - xy[2 * i + 1]) - (ax - xy[2 * i]) * (by - ay)) / len;
      if (d > dmax) {
        dmax = d;
        worst = i;
      }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(xy[2 * i], xy[2 * i + 1]);
  return out;
}

/** Signed area and centroid of a ring (open or closed). */
function ringStats(xy) {
  const r = openRing(xy);
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < r.length; i += 2) {
    const j = (i + 2) % r.length;
    const f = r[i] * r[j + 1] - r[j] * r[i + 1];
    a += f;
    cx += (r[i] + r[j]) * f;
    cy += (r[i + 1] + r[j + 1]) * f;
  }
  a /= 2;
  if (Math.abs(a) < 1e-9) return { area: 0, x: r[0], y: r[1] };
  return { area: Math.abs(a), x: cx / (6 * a), y: cy / (6 * a) };
}

/** Sutherland–Hodgman clip of a ring to an axis-aligned box. Fill-only use. */
function clipRing(xy, box) {
  let pts = openRing(xy);
  const edges = [
    [(x) => x >= box.minX, (ax, ay, bx, by) => [box.minX, ay + ((by - ay) * (box.minX - ax)) / (bx - ax)]],
    [(x, y) => y >= box.minY, (ax, ay, bx, by) => [ax + ((bx - ax) * (box.minY - ay)) / (by - ay), box.minY]],
    [(x) => x <= box.maxX, (ax, ay, bx, by) => [box.maxX, ay + ((by - ay) * (box.maxX - ax)) / (bx - ax)]],
    [(x, y) => y <= box.maxY, (ax, ay, bx, by) => [ax + ((bx - ax) * (box.maxY - ay)) / (by - ay), box.maxY]],
  ];
  for (const [inside, cut] of edges) {
    if (pts.length < 6) return null;
    const out = [];
    for (let i = 0; i < pts.length; i += 2) {
      const ax = pts[i], ay = pts[i + 1];
      const j = (i + 2) % pts.length;
      const bx = pts[j], by = pts[j + 1];
      const ain = inside(ax, ay), bin = inside(bx, by);
      if (ain) out.push(ax, ay);
      if (ain !== bin) out.push(...cut(ax, ay, bx, by));
    }
    pts = out;
  }
  return pts.length >= 6 ? pts : null;
}

/** Clip a polyline to a box (Liang–Barsky per segment); returns runs. */
function clipLine(xy, box) {
  const runs = [];
  let run = null;
  for (let i = 0; i + 3 < xy.length; i += 2) {
    const seg = clipSegment(xy[i], xy[i + 1], xy[i + 2], xy[i + 3], box);
    if (!seg) {
      run = null;
      continue;
    }
    const [x0, y0, x1, y1] = seg;
    if (run && run[run.length - 2] === x0 && run[run.length - 1] === y0) run.push(x1, y1);
    else {
      run = [x0, y0, x1, y1];
      runs.push(run);
    }
  }
  return runs;
}

function clipSegment(x0, y0, x1, y1, b) {
  let t0 = 0, t1 = 1;
  const dx = x1 - x0, dy = y1 - y0;
  for (const [p, q] of [[-dx, x0 - b.minX], [dx, b.maxX - x0], [-dy, y0 - b.minY], [dy, b.maxY - y0]]) {
    if (p === 0) {
      if (q < 0) return null;
    } else {
      const r = q / p;
      if (p < 0) {
        if (r > t1) return null;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return null;
        if (r < t1) t1 = r;
      }
    }
  }
  return [x0 + t0 * dx, y0 + t0 * dy, x0 + t1 * dx, y0 + t1 * dy];
}

// ---- collect features ----------------------------------------------------

const stats = { brokenRings: 0, hTag: 0, hLevels: 0, hDefault: 0, droppedOutside: 0, ringCap: 0 };
const names = [];
const nameIds = new Map();
function nameId(n) {
  if (!n) return NO_NAME;
  if (!nameIds.has(n)) {
    nameIds.set(n, names.length);
    names.push(n);
  }
  return nameIds.get(n);
}

const polygons = []; // {tags, outer: [ring], inner: [ring]}
const lines = []; // {tags, xy}

for (const w of raw.ways) {
  if (closed(w.xy) && isAreaTags(w.tags) && !(w.tags.highway && w.tags.area !== "yes" && !w.tags["area:highway"])) {
    polygons.push({ tags: w.tags, outer: [w.xy], inner: [] });
  } else if (!(w.tags.building && w.tags.building !== "no")) {
    lines.push({ tags: w.tags, xy: w.xy });
  }
}
for (const r of raw.relations) {
  const outer = assembleRings(r.members.filter((m) => m.role !== "inner").map((m) => m.xy), stats);
  const inner = assembleRings(r.members.filter((m) => m.role === "inner").map((m) => m.xy), stats);
  if (outer.length) polygons.push({ tags: r.tags, outer, inner });
}

// ---- bucket into chunks --------------------------------------------------

const chunks = new Map(); // "cx,cy" -> {ground:[], lines:[], buildings:[], labels:[]}
function chunk(cx, cy) {
  if (cx < region.cx0 || cx > region.cx1 || cy < region.cy0 || cy > region.cy1) return null;
  const key = `${cx},${cy}`;
  if (!chunks.has(key)) chunks.set(key, { cx, cy, ground: [], lines: [], buildings: [], labels: [] });
  return chunks.get(key);
}
function chunkBox(cx, cy, pad) {
  return { minX: cx * CHUNK_SIZE - pad, minY: cy * CHUNK_SIZE - pad, maxX: (cx + 1) * CHUNK_SIZE + pad, maxY: (cy + 1) * CHUNK_SIZE + pad };
}
function forChunks(b, pad, fn) {
  for (let cx = Math.floor((b.minX - pad) / CHUNK_SIZE); cx <= Math.floor((b.maxX + pad) / CHUNK_SIZE); cx++)
    for (let cy = Math.floor((b.minY - pad) / CHUNK_SIZE); cy <= Math.floor((b.maxY + pad) / CHUNK_SIZE); cy++) {
      const c = chunk(cx, cy);
      if (c) fn(c, cx, cy);
    }
}

const counts = { ground: new Array(8).fill(0), lines: new Array(8).fill(0), buildings: new Array(8).fill(0), labels: 0 };

for (const p of polygons) {
  const t = p.tags;
  const rings = [...p.outer, ...p.inner];
  const main = ringStats(p.outer.reduce((a, b) => (ringStats(b).area > ringStats(a).area ? b : a)));

  if (t.building && t.building !== "no") {
    const kind = buildingKind(t.building);
    const c = chunk(Math.floor(main.x / CHUNK_SIZE), Math.floor(main.y / CHUNK_SIZE));
    if (!c) {
      stats.droppedOutside++;
      continue;
    }
    c.buildings.push({ kind, height: buildingHeight(t, kind, stats), rings: rings.map(openRing) });
    counts.buildings[kind]++;
    continue;
  }

  const kind = groundKind(t);
  if (kind >= 0) {
    forChunks(bboxOf(p.outer), GROUND_PAD, (c, cx, cy) => {
      const box = chunkBox(cx, cy, GROUND_PAD);
      const clipped = rings.map((r) => clipRing(r, box)).filter(Boolean);
      if (clipped.length) c.ground.push({ kind, rings: clipped });
    });
    counts.ground[kind]++;
  }

  // labels for named squares, parks and water bodies of some size
  const n = t.name;
  if (!n) continue;
  let lk = -1;
  if (t.place === "square" || (t.highway === "pedestrian" && t.area === "yes")) lk = LB.square;
  else if ((t.leisure === "park" || t.leisure === "garden") && main.area > 2500) lk = LB.park;
  else if (kind === G.water && main.area > 4000) lk = LB.water;
  if (lk < 0) continue;
  const c = chunk(Math.floor(main.x / CHUNK_SIZE), Math.floor(main.y / CHUNK_SIZE));
  if (c) {
    c.labels.push({ kind: lk, name: nameId(n), x: main.x, y: main.y });
    counts.labels++;
  }
}

for (const l of lines) {
  const k = lineKind(l.tags);
  if (!k) continue;
  const bridge = l.tags.bridge && l.tags.bridge !== "no" ? 1 : 0;
  const nid = l.tags.highway ? nameId(l.tags.name) : NO_NAME;
  forChunks(bboxOf([l.xy]), LINE_PAD, (c, cx, cy) => {
    for (const run of clipLine(l.xy, chunkBox(cx, cy, LINE_PAD))) {
      c.lines.push({ kind: k.kind, flags: bridge, width: k.width, name: nid, xy: run });
    }
  });
  counts.lines[k.kind]++;
}

for (const nd of raw.nodes) {
  const kind = nd.tags.place === "square" ? LB.square : nd.tags.place === "neighbourhood" ? LB.neighbourhood : LB.quarter;
  const c = chunk(Math.floor(nd.x / CHUNK_SIZE), Math.floor(nd.y / CHUNK_SIZE));
  if (c) {
    c.labels.push({ kind, name: nameId(nd.tags.name), x: nd.x, y: nd.y });
    counts.labels++;
  }
}

// ---- encode --------------------------------------------------------------

class Writer {
  constructor() {
    this.buf = Buffer.alloc(1 << 16);
    this.off = 0;
  }
  ensure(n) {
    if (this.off + n <= this.buf.length) return;
    const next = Buffer.alloc(Math.max(this.buf.length * 2, this.off + n));
    this.buf.copy(next, 0, 0, this.off);
    this.buf = next;
  }
  u8(v) { this.ensure(1); this.buf.writeUInt8(v, this.off); this.off += 1; }
  u16(v) { this.ensure(2); this.buf.writeUInt16LE(v, this.off); this.off += 2; }
  i16(v) { this.ensure(2); this.buf.writeInt16LE(v, this.off); this.off += 2; }
  bytes() { return this.buf.subarray(0, this.off); }
}

/** Quantize to dm relative to the chunk origin, dropping repeated points. */
function quantize(xy, ox, oy) {
  const out = [];
  for (let i = 0; i < xy.length; i += 2) {
    const x = Math.round((xy[i] - ox) * 10);
    const y = Math.round((xy[i + 1] - oy) * 10);
    if (x < -32768 || x > 32767 || y < -32768 || y > 32767) throw new Error("point out of Int16 range");
    if (out.length && out[out.length - 2] === x && out[out.length - 1] === y) continue;
    out.push(x, y);
  }
  return out;
}

function writePts(w, q) {
  w.u16(q.length / 2);
  for (const v of q) w.i16(v);
}

function quantizeRings(rings, ox, oy) {
  if (rings.length > 255) stats.ringCap++;
  return rings.map((r) => quantize(r, ox, oy)).filter((q) => q.length >= 6).slice(0, 255);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const index = [];
let total = 0;
for (const c of [...chunks.values()].sort((a, b) => a.cy - b.cy || a.cx - b.cx)) {
  const ox = c.cx * CHUNK_SIZE;
  const oy = c.cy * CHUNK_SIZE;
  const w = new Writer();
  w.u8(1);
  w.u8(0);
  w.u16(c.ground.length);
  w.u16(c.lines.length);
  w.u16(c.buildings.length);
  w.u16(c.labels.length);
  for (const g of c.ground.sort((a, b) => a.kind - b.kind)) {
    const qs = quantizeRings(g.rings, ox, oy);
    w.u8(g.kind);
    w.u8(qs.length);
    for (const q of qs) writePts(w, q);
  }
  for (const l of c.lines.sort((a, b) => a.kind - b.kind)) {
    w.u8(l.kind);
    w.u8(l.flags);
    w.u16(Math.round(l.width * 10));
    w.u16(l.name);
    writePts(w, quantize(l.xy, ox, oy));
  }
  for (const b of c.buildings) {
    const qs = quantizeRings(b.rings, ox, oy);
    w.u8(b.kind);
    w.u8(qs.length);
    w.u16(Math.min(65535, Math.round(b.height * 10)));
    for (const q of qs) writePts(w, q);
  }
  for (const lb of c.labels) {
    w.u8(lb.kind);
    w.u16(lb.name);
    w.i16(Math.round((lb.x - ox) * 10));
    w.i16(Math.round((lb.y - oy) * 10));
  }
  const bytes = w.bytes();
  writeFileSync(join(OUT, `c_${c.cx}_${c.cy}.bin`), bytes);
  index.push([c.cx, c.cy, bytes.length]);
  total += bytes.length;
}

// ---- minimap.svg ---------------------------------------------------------
// Overview for the HUD minimap: ground, water, roads and buildings, simplified.
// viewBox is the region bbox in meters with y flipped (north up), so the
// client maps RD -> image with one offset + scale.

const rb = regionBBoxRD(region);
const MAP = {
  ground: ["#dfe2b4", "#dcd6cb", "#b5d68a", "#8dbb6e", "#a5d38c", "#efdfae", "#86c5e3", "#d8d1c2"],
  roads: [[L.major, 16, "#fbf8f1"], [L.medium, 12, "#fbf8f1"], [L.minor, 8, "#f6f2e9"], [L.service, 5, "#f1ece1"], [L.rail, 3, "#8e877c"]],
  building: "#c9b9a1",
  water: "#86c5e3",
};
const svgPt = (x, y) => `${Math.round(x - rb.minX)} ${Math.round(rb.maxY - y)}`;
function svgRing(r, tol) {
  const s = simplify(openRing(r), tol);
  if (s.length < 6) return "";
  let d = `M${svgPt(s[0], s[1])}`;
  for (let i = 2; i < s.length; i += 2) d += `L${svgPt(s[i], s[i + 1])}`;
  return d + "Z";
}
function svgLine(xy, tol) {
  const s = simplify(xy, tol);
  let d = `M${svgPt(s[0], s[1])}`;
  for (let i = 2; i < s.length; i += 2) d += `L${svgPt(s[i], s[i + 1])}`;
  return d;
}
const inRegion = (b) => b.maxX >= rb.minX && b.minX <= rb.maxX && b.maxY >= rb.minY && b.minY <= rb.maxY;

const groundD = MAP.ground.map(() => []);
const buildingD = [];
for (const p of polygons) {
  if (!inRegion(bboxOf(p.outer))) continue;
  const rings = [...p.outer, ...p.inner];
  if (p.tags.building && p.tags.building !== "no") {
    if (ringStats(p.outer[0]).area >= 25) buildingD.push(rings.map((r) => svgRing(r, 1.5)).join(""));
    continue;
  }
  const kind = groundKind(p.tags);
  if (kind >= 0) groundD[kind].push(rings.map((r) => svgRing(r, 2)).join(""));
}
const roadD = new Map(); // kind -> [d]
const waterLines = new Map(); // width -> [d]
for (const l of lines) {
  const k = lineKind(l.tags);
  if (!k || !inRegion(bboxOf([l.xy]))) continue;
  if (k.kind === L.water) {
    const w = Math.max(3, Math.round(k.width));
    if (!waterLines.has(w)) waterLines.set(w, []);
    waterLines.get(w).push(svgLine(l.xy, 2));
  } else if (MAP.roads.some(([rk]) => rk === k.kind)) {
    if (!roadD.has(k.kind)) roadD.set(k.kind, []);
    roadD.get(k.kind).push(svgLine(l.xy, 2));
  }
}
const W = rb.maxX - rb.minX, H = rb.maxY - rb.minY;
let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`;
svg += `<rect width="${W}" height="${H}" fill="${BASE_GROUND}"/>`;
groundD.forEach((ds, k) => ds.length && (svg += `<path fill="${MAP.ground[k]}" fill-rule="evenodd" d="${ds.join("")}"/>`));
for (const [w, ds] of waterLines) svg += `<path fill="none" stroke="${MAP.water}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" d="${ds.join("")}"/>`;
for (const [kind, w, color] of [...MAP.roads].reverse()) {
  const ds = roadD.get(kind);
  if (ds) svg += `<path fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" d="${ds.join("")}"/>`;
}
svg += `<path fill="${MAP.building}" fill-rule="evenodd" d="${buildingD.join("")}"/>`;
svg += "</svg>";
writeFileSync(join(OUT, "minimap.svg"), svg);

writeFileSync(
  join(OUT, "index.json"),
  JSON.stringify({ version: 1, region: name, chunkSize: CHUNK_SIZE, bounds: region, minimap: { file: "minimap.svg", ...rb }, chunks: index, names }),
);

// ---- report --------------------------------------------------------------

const pct = (n, d) => `${((100 * n) / Math.max(1, d)).toFixed(1)}%`;
const nB = stats.hTag + stats.hLevels + stats.hDefault;
console.log(`region ${name}: ${index.length} chunks, ${(total / 1e6).toFixed(2)} MB (${(total / Math.max(1, index.length) / 1e3).toFixed(1)} kB avg)`);
console.log(`ground polygons per kind: ${Object.keys(G).map((k, i) => `${k} ${counts.ground[i]}`).join(", ")}`);
console.log(`lines per kind:           ${Object.keys(L).map((k, i) => `${k} ${counts.lines[i]}`).join(", ")}`);
console.log(`buildings: ${nB} — height from tag ${pct(stats.hTag, nB)}, levels ${pct(stats.hLevels, nB)}, default ${pct(stats.hDefault, nB)}`);
console.log(`minimap.svg ${(svg.length / 1e6).toFixed(2)} MB (${W}×${H} m)`);
console.log(`labels: ${counts.labels}, names: ${names.length}, broken rings: ${stats.brokenRings}, buildings outside region: ${stats.droppedOutside}`);
