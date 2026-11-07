// Ground shadows of a chunk — buildings swept south-east by their height and
// tree crowns as discs — as one nonzero path (every sub-path counter-clockwise
// in chunk-local y-up meters), so overlapping shadows don't double-darken.
// Baked into the ground tiles by ground.ts.

import type { TreeData } from "../../lib/loadTrees";
import type { Chunk } from "../worldFormat";
import { SHADOW, crownCenterZ, crownRadius, visualHeight } from "./geometry";

/** Multiplied onto the ground, so grass stays green and paving stays warm. */
export const SHADOW_COLOR = "rgba(150, 138, 112, 0.55)";
/** Longest shadow reach in meters (for ground-tile completeness checks). */
export const SHADOW_REACH = visualHeight(120) * Math.hypot(SHADOW.x, SHADOW.y);

const cache = new WeakMap<Chunk, Path2D>();

export function chunkShadowPath(c: Chunk, trees: TreeData | null): Path2D {
  let path = cache.get(c);
  if (path) return path;
  path = new Path2D();

  for (const b of c.buildings) {
    const v = visualHeight(b.height);
    const dx = v * SHADOW.x;
    const dy = v * SHADOW.y;
    const r = b.rings[0]; // outer ring, CCW
    ring(path, r, 0, 0);
    ring(path, r, dx, dy);
    for (let i = 0; i < r.length; i += 2) {
      const j = (i + 2) % r.length;
      const ax = r[i], ay = r[i + 1], bx = r[j], by = r[j + 1];
      const ccw = (bx - ax) * dy - (by - ay) * dx > 0;
      path.moveTo(ax, ay);
      if (ccw) {
        path.lineTo(bx, by);
        path.lineTo(bx + dx, by + dy);
        path.lineTo(ax + dx, ay + dy);
      } else {
        path.lineTo(ax + dx, ay + dy);
        path.lineTo(bx + dx, by + dy);
        path.lineTo(bx, by);
      }
      path.closePath();
    }
  }

  const range = trees?.chunks.get(`${c.cx},${c.cy}`);
  if (trees && range) {
    for (let i = range[0], end = range[0] + range[1]; i < end; i++) {
      const h = trees.heights[i];
      const r = crownRadius(h, i);
      const z = crownCenterZ(h, r);
      const x = trees.x[i] / 10 - c.ox + z * SHADOW.x;
      const y = trees.y[i] / 10 - c.oy + z * SHADOW.y;
      const rr = r * 0.85;
      path.moveTo(x + rr, y);
      path.arc(x, y, rr, 0, Math.PI * 2); // increasing angle = CCW in y-up space
      path.closePath();
    }
  }

  // only cache once trees are known, or tree shadows would never appear
  if (trees) cache.set(c, path);
  return path;
}

function ring(p: Path2D, r: Float32Array, ox: number, oy: number) {
  p.moveTo(r[0] + ox, r[1] + oy);
  for (let i = 2; i < r.length; i += 2) p.lineTo(r[i] + ox, r[i + 1] + oy);
  p.closePath();
}
