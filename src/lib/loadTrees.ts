// Decoder for public/data/trees.bin — format documented in scripts/build-data.mjs.

export interface TreeData {
  count: number;
  /** RD New position in decimeters. */
  x: Int32Array;
  y: Int32Array;
  heights: Uint8Array;
  archetypes: Uint8Array;
  years: Uint16Array;
  flags: Uint8Array; // bit0 monumental, bit1 height estimated
  /** "cx,cy" -> [start, count] into the per-tree arrays (trees are chunk-sorted). */
  chunks: Map<string, [number, number]>;
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
  const dv = new DataView(buf);
  const n = dv.getUint32(0, true);
  const c = dv.getUint32(4, true);

  const chunks = new Map<string, [number, number]>();
  let off = 8;
  for (let i = 0; i < c; i++, off += 12) {
    chunks.set(`${dv.getUint16(off, true)},${dv.getUint16(off + 2, true)}`, [dv.getUint32(off + 4, true), dv.getUint32(off + 8, true)]);
  }

  const x = new Int32Array(buf, off, n); off += 4 * n;
  const y = new Int32Array(buf, off, n); off += 4 * n;
  const years = new Uint16Array(buf, off, n); off += 2 * n;
  const heights = new Uint8Array(buf, off, n); off += n;
  const archetypes = new Uint8Array(buf, off, n); off += n;
  const flags = new Uint8Array(buf, off, n);

  return { count: n, x, y, heights, archetypes, years, flags, chunks };
}
