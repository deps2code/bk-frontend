// Near-camera LOD selection: which trees get the detailed mesh.
//
// Recomputed on moveend, never per frame. Returns fresh index arrays and a
// fresh {length} data object per shape — deck re-uploads attributes for the
// small detail layers only; the base layers keep their stable identity and
// are never re-uploaded.

import { ARCHETYPES, SHAPES, type Shape } from "./archetypes";
import type { TreeData } from "./loadTrees";

/** Below this zoom no tree is big enough on screen to warrant detail. */
export const DETAIL_MIN_ZOOM = 15.3;
/** Vertex budget: cap × ~150 tris stays a fraction of the base layers' cost. */
const DETAIL_CAP = 12000;

export interface ViewBox {
  west: number;
  south: number;
  east: number;
  north: number;
  /** Camera focus point — used to keep the nearest trees when over cap. */
  clon: number;
  clat: number;
}

export interface DetailSelection {
  /** Per shape: global tree indices that get the detailed mesh. */
  indices: Record<Shape, Uint32Array>;
  /** Virtual data objects for the detail layers (fresh per selection). */
  data: Record<Shape, { length: number }>;
}

export function selectDetail(data: TreeData, box: ViewBox, cap = DETAIL_CAP): DetailSelection {
  const { lon, lat, count } = data;
  let cand: number[] = [];
  for (let i = 0; i < count; i++) {
    if (lon[i] >= box.west && lon[i] <= box.east && lat[i] >= box.south && lat[i] <= box.north) {
      cand.push(i);
    }
  }
  if (cand.length > cap) {
    // keep the trees nearest the camera focus (lon compressed by cos(lat))
    const kx = Math.cos((box.clat * Math.PI) / 180);
    const d2 = (i: number) => {
      const dx = (lon[i] - box.clon) * kx;
      const dy = lat[i] - box.clat;
      return dx * dx + dy * dy;
    };
    cand.sort((a, b) => d2(a) - d2(b));
    cand = cand.slice(0, cap);
  }

  const perShape: Record<Shape, number[]> = { round: [], oval: [], weeping: [], conifer: [] };
  for (const g of cand) perShape[ARCHETYPES[data.archetypes[g]].shape].push(g);

  const indices = Object.fromEntries(
    SHAPES.map((s) => [s, Uint32Array.from(perShape[s])]),
  ) as Record<Shape, Uint32Array>;
  const dataObjs = Object.fromEntries(
    SHAPES.map((s) => [s, { length: indices[s].length }]),
  ) as Record<Shape, { length: number }>;
  return { indices, data: dataObjs };
}
