// Milestone 2 tree pass: one dot per tree, sized by crown and coloured by
// archetype, monumental trees ringed in gold. Milestone 4 swaps in sprites.

import type { Camera } from "../camera";
import type { Chunk } from "../worldFormat";
import { ARCHETYPES, MONUMENTAL_COLOR } from "../../lib/archetypes";
import type { TreeData } from "../../lib/loadTrees";

const FILL = ARCHETYPES.map((a) => `rgb(${a.color.join(",")})`);
const GOLD = `rgb(${MONUMENTAL_COLOR.join(",")})`;

/** Crown radius in meters from tree height. */
export function crownRadius(height: number): number {
  return 1.2 + height * 0.16;
}

export function drawTrees(ctx: CanvasRenderingContext2D, cam: Camera, chunks: Chunk[], trees: TreeData): number {
  const b = cam.bounds();
  let drawn = 0;
  ctx.lineWidth = 1;
  for (const c of chunks) {
    const range = trees.chunks.get(`${c.cx},${c.cy}`);
    if (!range) continue;
    const [start, count] = range;
    for (let i = start; i < start + count; i++) {
      const x = trees.x[i] / 10;
      const y = trees.y[i] / 10;
      const r = crownRadius(trees.heights[i]);
      if (x + r < b.minX || x - r > b.maxX || y + r < b.minY || y - r > b.maxY) continue;
      const sx = cam.sx(x);
      const sy = cam.sy(y);
      const sr = Math.max(2, r * cam.scale);
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fillStyle = FILL[trees.archetypes[i]];
      ctx.globalAlpha = 0.85;
      ctx.fill();
      ctx.globalAlpha = 1;
      if (trees.flags[i] & 1) {
        ctx.strokeStyle = GOLD;
        ctx.lineWidth = Math.max(1.5, 0.35 * cam.scale);
        ctx.stroke();
      } else {
        ctx.strokeStyle = "rgba(30, 50, 20, 0.45)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      drawn++;
    }
  }
  return drawn;
}
