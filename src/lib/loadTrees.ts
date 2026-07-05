// Decoder for public/data/trees.bin — format documented in scripts/build-data.mjs.

import { ARCHETYPES, SHAPES, type Shape } from "./archetypes";

export interface TreeData {
  count: number;
  lon: Float64Array;
  lat: Float64Array;
  heights: Uint8Array;
  archetypes: Uint8Array;
  years: Uint16Array;
  flags: Uint8Array; // bit0 monumental, bit1 height estimated
  /** Per shape: global tree indices rendered with that crown mesh. */
  shapeIndices: Record<Shape, Uint32Array>;
  /** Stable virtual-data objects for deck.gl layers (identity must not change). */
  dotsData: { length: number };
  shapeData: Record<Shape, { length: number }>;
  /** Tree count per archetype. */
  archetypeCounts: number[];
  monumentalCount: number;
}

export function isMonumental(data: TreeData, i: number): boolean {
  return (data.flags[i] & 1) !== 0;
}

export function isHeightEstimated(data: TreeData, i: number): boolean {
  return (data.flags[i] & 2) !== 0;
}

/** Deterministic per-tree pseudo-random in [0, 1) — stable across frames. */
export function jitter(i: number, salt: number): number {
  let h = (i + 1) * 2654435761 + salt * 40503;
  h = (h ^ (h >>> 13)) * 2246822519;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export async function loadTrees(url: string): Promise<TreeData> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`kan boomdata niet laden: ${res.status}`);
  const buf = await res.arrayBuffer();
  const n = new DataView(buf).getUint32(0, true);

  let off = 4;
  const lonI = new Int32Array(buf, off, n); off += 4 * n;
  const latI = new Int32Array(buf, off, n); off += 4 * n;
  const years = new Uint16Array(buf, off, n); off += 2 * n;
  const heights = new Uint8Array(buf, off, n); off += n;
  const archetypes = new Uint8Array(buf, off, n); off += n;
  const flags = new Uint8Array(buf, off, n);

  const lon = new Float64Array(n);
  const lat = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    lon[i] = lonI[i] / 1e7;
    lat[i] = latI[i] / 1e7;
  }

  const archetypeCounts = new Array(ARCHETYPES.length).fill(0);
  let monumentalCount = 0;
  const perShape: Record<Shape, number[]> = { round: [], oval: [], weeping: [], conifer: [] };
  for (let i = 0; i < n; i++) {
    archetypeCounts[archetypes[i]]++;
    if (flags[i] & 1) monumentalCount++;
    perShape[ARCHETYPES[archetypes[i]].shape].push(i);
  }

  const shapeIndices = Object.fromEntries(
    SHAPES.map((s) => [s, Uint32Array.from(perShape[s])]),
  ) as Record<Shape, Uint32Array>;
  const shapeData = Object.fromEntries(
    SHAPES.map((s) => [s, { length: shapeIndices[s].length }]),
  ) as Record<Shape, { length: number }>;

  return {
    count: n,
    lon, lat, heights, archetypes, years, flags,
    shapeIndices,
    dotsData: { length: n },
    shapeData,
    archetypeCounts,
    monumentalCount,
  };
}
