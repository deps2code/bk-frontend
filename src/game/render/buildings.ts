// Milestone 2 building pass: flat footprints with an outline. Milestone 3
// replaces this with oblique extrusion (south facades + raised roofs).

import { setChunkTransform, type Camera } from "../camera";
import type { Chunk } from "../worldFormat";
import { BUILDING_FILL, BUILDING_STROKE } from "./palette";

export function drawBuildings(ctx: CanvasRenderingContext2D, cam: Camera, dpr: number, chunks: Chunk[]) {
  ctx.strokeStyle = BUILDING_STROKE;
  ctx.lineJoin = "round";
  for (const c of chunks) {
    setChunkTransform(ctx, cam, dpr, c.ox, c.oy);
    ctx.lineWidth = 1 / cam.scale; // 1 CSS px
    for (const b of c.buildings) {
      ctx.fillStyle = BUILDING_FILL[b.kind];
      ctx.fill(b.path, "evenodd");
      ctx.stroke(b.path);
    }
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
