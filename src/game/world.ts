// World constants and chunk streaming. World units are meters in RD New
// (EPSG:28992): x grows east, y grows north — the same system as the tree
// dataset's X/Y_COORDINAAT and the chunk files in public/world/.

import { loadTrees, type TreeData } from "../lib/loadTrees";
import { decodeChunk, type Chunk } from "./worldFormat";

/** Side of a streaming chunk in meters — must match scripts/lib/regions.mjs. */
export const CHUNK_SIZE = 250;

/** Spawn point: Grote Markt. */
export const SPAWN = { x: 233_880, y: 581_960 };

/** Bbox of the municipal tree dataset, RD meters — the playable area. */
export const WORLD_BOUNDS = { minX: 227_000, minY: 569_800, maxX: 246_700, maxY: 592_700 };

const MAX_CHUNKS = 64; // decoded chunks kept in memory (LRU beyond the view)
const MAX_INFLIGHT = 6;
const PREFETCH = 300; // m around the view that gets loaded (covers ground tiles + shadows)
/** Chunks this far outside the view are still returned: their buildings and
 * trees extend beyond the chunk (unclipped footprints, raised roofs). */
const OBJECT_MARGIN = 60;

export function chunkOf(v: number): number {
  return Math.floor(v / CHUNK_SIZE);
}

interface WorldIndex {
  version: number;
  chunkSize: number;
  /** Built region in chunk coordinates (inclusive). */
  bounds: { cx0: number; cy0: number; cx1: number; cy1: number };
  /** Overview map: SVG whose viewBox is this RD bbox, north up. */
  minimap: Bounds & { file: string };
  chunks: [number, number, number][];
  names: string[];
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export class World {
  trees: TreeData | null = null;
  private index: WorldIndex | null = null;
  private available = new Set<string>();
  private loaded = new Map<string, { chunk: Chunk; used: number }>();
  private inflight = new Set<string>();
  private frame = 0;
  private destroyed = false;
  private base = "/";

  async init(base: string): Promise<void> {
    const [index, trees] = await Promise.all([
      fetch(`${base}world/index.json`).then((r) => {
        if (!r.ok) throw new Error(`kan wereld niet laden: ${r.status}`);
        return r.json() as Promise<WorldIndex>;
      }),
      loadTrees(`${base}data/trees.bin`),
    ]);
    if (index.chunkSize !== CHUNK_SIZE) throw new Error(`chunk size mismatch: ${index.chunkSize}`);
    this.index = index;
    this.trees = trees;
    for (const [cx, cy] of index.chunks) this.available.add(`${cx},${cy}`);
    this.base = base;
  }

  destroy() {
    this.destroyed = true;
  }

  get loadedCount(): number {
    return this.loaded.size;
  }

  /** Overview map file + its RD bbox, once the index is loaded. */
  get minimap(): (Bounds & { url: string }) | null {
    const m = this.index?.minimap;
    return m ? { ...m, url: `${this.base}world/${m.file}` } : null;
  }

  /** Is (x, y) inside the built region (where there is map data)? */
  covers(x: number, y: number): boolean {
    const b = this.index?.bounds;
    if (!b) return false;
    const cx = chunkOf(x), cy = chunkOf(y);
    return cx >= b.cx0 && cx <= b.cx1 && cy >= b.cy0 && cy <= b.cy1;
  }

  /** Street name of the nearest named road within `maxDist` m, from loaded chunks. */
  streetNear(x: number, y: number, maxDist: number): string | null {
    if (!this.index) return null;
    let best: number | null = null;
    let bestD = maxDist * maxDist;
    for (let cy = chunkOf(y - maxDist); cy <= chunkOf(y + maxDist); cy++) {
      for (let cx = chunkOf(x - maxDist); cx <= chunkOf(x + maxDist); cx++) {
        const c = this.chunkAt(cx, cy);
        if (!c) continue;
        const lx = x - c.ox, ly = y - c.oy;
        for (const { nameId, pts } of c.streetNames) {
          for (let i = 0; i + 3 < pts.length; i += 2) {
            const d = segDist2(lx, ly, pts[i], pts[i + 1], pts[i + 2], pts[i + 3]);
            if (d < bestD) {
              bestD = d;
              best = nameId;
            }
          }
        }
      }
    }
    return best === null ? null : (this.index.names[best] ?? null);
  }

  /** Index loaded: chunk availability is known. */
  get ready(): boolean {
    return this.index !== null;
  }

  /** A decoded chunk if it is in memory. */
  chunkAt(cx: number, cy: number): Chunk | null {
    return this.loaded.get(`${cx},${cy}`)?.chunk ?? null;
  }

  /** True while a chunk exists in the world but isn't decoded yet. */
  isPending(cx: number, cy: number): boolean {
    const key = `${cx},${cy}`;
    return this.available.has(key) && !this.loaded.has(key);
  }

  /** Chunks overlapping `b` that are loaded; also schedules loads and evictions. */
  visible(b: Bounds): Chunk[] {
    this.frame++;
    const out: Chunk[] = [];
    if (!this.index) return out;

    const cx0 = chunkOf(b.minX - OBJECT_MARGIN), cx1 = chunkOf(b.maxX + OBJECT_MARGIN);
    const cy0 = chunkOf(b.minY - OBJECT_MARGIN), cy1 = chunkOf(b.maxY + OBJECT_MARGIN);
    const want: { key: string; cx: number; cy: number; d: number }[] = [];
    const midX = (cx0 + cx1) / 2, midY = (cy0 + cy1) / 2;

    for (let cy = chunkOf(b.minY - PREFETCH); cy <= chunkOf(b.maxY + PREFETCH); cy++) {
      for (let cx = chunkOf(b.minX - PREFETCH); cx <= chunkOf(b.maxX + PREFETCH); cx++) {
        const key = `${cx},${cy}`;
        const entry = this.loaded.get(key);
        const inView = cx >= cx0 && cx <= cx1 && cy >= cy0 && cy <= cy1;
        if (entry) {
          entry.used = this.frame;
          if (inView) out.push(entry.chunk);
        } else if (this.available.has(key) && !this.inflight.has(key)) {
          want.push({ key, cx, cy, d: Math.hypot(cx - midX, cy - midY) });
        }
      }
    }

    want.sort((a, b) => a.d - b.d);
    for (const w of want) {
      if (this.inflight.size >= MAX_INFLIGHT) break;
      this.load(w.key, w.cx, w.cy);
    }
    this.evict();
    return out;
  }

  private load(key: string, cx: number, cy: number) {
    this.inflight.add(key);
    fetch(`${this.base}world/c_${cx}_${cy}.bin`)
      .then((r) => {
        if (!r.ok) throw new Error(`chunk ${key}: ${r.status}`);
        return r.arrayBuffer();
      })
      .then((buf) => {
        if (this.destroyed) return;
        this.loaded.set(key, { chunk: decodeChunk(buf, cx, cy, CHUNK_SIZE, this.index!.names), used: this.frame });
      })
      .catch((e) => {
        console.error(e);
        this.available.delete(key); // don't retry a broken chunk every frame
      })
      .finally(() => this.inflight.delete(key));
  }

  private evict() {
    if (this.loaded.size <= MAX_CHUNKS) return;
    const byAge = [...this.loaded.entries()].sort((a, b) => a[1].used - b[1].used);
    for (const [key, e] of byAge) {
      if (this.loaded.size <= MAX_CHUNKS) break;
      if (e.used < this.frame) this.loaded.delete(key);
    }
  }
}

function segDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  const qx = ax + t * dx - px, qy = ay + t * dy - py;
  return qx * qx + qy * qy;
}
