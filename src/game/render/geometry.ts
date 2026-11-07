// Shared oblique-view geometry. "Up the screen by z meters" is drawn as
// "north by z × HEIGHT_FACTOR" in ground meters; light comes from the
// north-west, so shadows fall south-east.

import { jitter } from "../../lib/loadTrees";

/** Screen-up offset per meter of visual height, relative to the ground scale. */
export const HEIGHT_FACTOR = 0.62;
/** Ground shadow offset per meter of height. */
export const SHADOW = { x: 0.42, y: -0.3 };

/** Visual height: tall buildings are compressed so they don't bury the street. */
export function visualHeight(h: number): number {
  return Math.max(2.5, h <= 16 ? h : 16 + (h - 16) * 0.45);
}

/** Crown radius in meters for tree `i` of height `h` (±10% per-tree jitter). */
export function crownRadius(h: number, i: number): number {
  return (1.2 + h * 0.16) * (0.9 + 0.2 * jitter(i, 1));
}

/** Height of the crown centre in meters: top of the crown at the tree height,
 *  but always a bit of trunk showing. */
export function crownCenterZ(h: number, r: number): number {
  return Math.max(h - r, r * 0.8 + 1);
}
