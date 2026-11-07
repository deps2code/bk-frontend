// Extract the OpenStreetMap features a build region needs from a Geofabrik
// .osm.pbf extract (public Overpass servers proved too overloaded to rely on).
//
//   curl -L -o raw/geofabrik/groningen-latest.osm.pbf \
//     https://download.geofabrik.de/europe/netherlands/groningen-latest.osm.pbf
//   node scripts/extract-osm.mjs [region]          (default: centrum)
//
// Writes raw/osm-<region>.json (gitignored):
//   { region, bbox, ways: [{id, tags, xy}], relations: [{id, tags, members: [{role, xy}]}],
//     nodes: [{id, tags, x, y}] }
// where xy is a flat [x0, y0, x1, y1, …] array in RD meters (cm precision).
// Two passes over the file: (1) all node coordinates + relations of interest,
// (2) ways that are interesting themselves or members of those relations.
// Data © OpenStreetMap contributors, ODbL.

import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createOSMStream } from "osm-pbf-parser-node";
import { REGIONS, regionBBoxRD } from "./lib/regions.mjs";
import { toRD } from "./lib/rd.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PBF = join(ROOT, "raw", "geofabrik", "groningen-latest.osm.pbf");
const PAD = 60; // m beyond the region, so features crossing its edge are complete

const name = process.argv[2] ?? "centrum";
const region = REGIONS[name];
if (!region) throw new Error(`unknown region "${name}" (have: ${Object.keys(REGIONS).join(", ")})`);
const rb = regionBBoxRD(region);
const bbox = { minX: rb.minX - PAD, minY: rb.minY - PAD, maxX: rb.maxX + PAD, maxY: rb.maxY + PAD };

const RE = {
  railway: /^(rail|tram|light_rail)$/,
  natural: /^(water|wood|scrub|grassland|heath|wetland|sand|beach)$/,
  leisure: /^(park|garden|pitch|playground|common|nature_reserve|sports_centre|golf_course|dog_park|track)$/,
  amenity: /^(parking|grave_yard|marketplace)$/,
  place: /^(square|neighbourhood|quarter|suburb)$/,
  man_made: /^(bridge|pier)$/,
};

function interesting(tags) {
  if (!tags) return false;
  if ((tags.building && tags.building !== "no") || tags.highway || tags.waterway || tags.water || tags.landuse) return true;
  if (tags["area:highway"]) return true;
  for (const [k, re] of Object.entries(RE)) if (tags[k] && re.test(tags[k])) return true;
  return false;
}

// ---- pass 1: node coordinates (sorted by id in Geofabrik extracts) + relations
let cap = 1 << 23;
let ids = new Float64Array(cap);
let xs = new Float64Array(cap);
let ys = new Float64Array(cap);
let nNodes = 0;
let sorted = true;
const labelNodes = [];
const relations = [];
const memberWays = new Set();

console.log(`pass 1: nodes + relations (${PBF})…`);
for await (const batch of createOSMStream(PBF, { withTags: true, withInfo: false })) {
  const items = Array.isArray(batch) ? batch : [batch];
  for (const it of items) {
    if (it.type === "node") {
      if (nNodes === cap) {
        cap *= 2;
        ids = grow(ids, cap);
        xs = grow(xs, cap);
        ys = grow(ys, cap);
      }
      if (nNodes > 0 && it.id < ids[nNodes - 1]) sorted = false;
      const [x, y] = toRD(it.lon, it.lat);
      ids[nNodes] = it.id;
      xs[nNodes] = x;
      ys[nNodes] = y;
      nNodes++;
      if (it.tags?.place && RE.place.test(it.tags.place) && it.tags.name && inside(x, y)) {
        labelNodes.push({ id: it.id, tags: it.tags, x: r2(x), y: r2(y) });
      }
    } else if (it.type === "relation") {
      const t = it.tags;
      if (!t || !(t.type === "multipolygon" || t.type === "boundary") || !interesting(t)) continue;
      if (t.boundary && !t.landuse && !t.natural && !t.leisure) continue;
      relations.push(it);
      for (const m of it.members) if (m.type === "way") memberWays.add(m.ref);
    }
  }
}
if (!sorted) throw new Error("node ids not sorted — re-sort the extract with `osmium sort`");
console.log(`  ${nNodes} nodes, ${relations.length} candidate relations, ${labelNodes.length} label nodes`);

// ---- pass 2: ways
console.log("pass 2: ways…");
const ways = [];
const memberGeom = new Map();
for await (const batch of createOSMStream(PBF, { withTags: true, withInfo: false })) {
  const items = Array.isArray(batch) ? batch : [batch];
  for (const it of items) {
    if (it.type !== "way") continue;
    const own = interesting(it.tags);
    const member = memberWays.has(it.id);
    if (!own && !member) continue;
    const xy = resolve(it.refs);
    if (!xy) continue;
    if (member) memberGeom.set(it.id, xy);
    if (own && intersects(xy)) ways.push({ id: it.id, tags: it.tags, xy });
  }
}

const rels = [];
for (const rel of relations) {
  const members = [];
  for (const m of rel.members) {
    if (m.type !== "way") continue;
    const xy = memberGeom.get(m.ref);
    if (xy) members.push({ role: m.role || "outer", xy });
  }
  if (members.length && members.some((m) => intersects(m.xy))) rels.push({ id: rel.id, tags: rel.tags, members });
}

const out = join(ROOT, "raw", `osm-${name}.json`);
const json = JSON.stringify({ region: name, bbox, ways, relations: rels, nodes: labelNodes });
writeFileSync(out, json);
console.log(`${ways.length} ways, ${rels.length} relations, ${labelNodes.length} nodes, ${(json.length / 1e6).toFixed(1)} MB -> ${out}`);

function grow(arr, size) {
  const next = new Float64Array(size);
  next.set(arr);
  return next;
}

function find(id) {
  let lo = 0;
  let hi = nNodes - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const v = ids[mid];
    if (v === id) return mid;
    if (v < id) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

function resolve(refs) {
  const xy = new Array(refs.length * 2);
  for (let i = 0; i < refs.length; i++) {
    const k = find(refs[i]);
    if (k < 0) return null; // way clipped by the extract boundary
    xy[2 * i] = r2(xs[k]);
    xy[2 * i + 1] = r2(ys[k]);
  }
  return xy;
}

function intersects(xy) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < xy.length; i += 2) {
    if (xy[i] < minX) minX = xy[i];
    if (xy[i] > maxX) maxX = xy[i];
    if (xy[i + 1] < minY) minY = xy[i + 1];
    if (xy[i + 1] > maxY) maxY = xy[i + 1];
  }
  return maxX >= bbox.minX && minX <= bbox.maxX && maxY >= bbox.minY && minY <= bbox.maxY;
}

function inside(x, y) {
  return x >= bbox.minX && x <= bbox.maxX && y >= bbox.minY && y <= bbox.maxY;
}

function r2(v) {
  return Math.round(v * 100) / 100;
}
