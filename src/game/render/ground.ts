// Ground features of a set of chunks: landuse/water polygons, line features
// (roads, paths, cycleways, rail, waterways) and building/tree shadows. Painted
// into cached ground tiles by groundCache.ts; `place(c)` sets the transform
// mapping a chunk's local meters to the target canvas.

import type { Chunk } from "../worldFormat";
import type { TreeData } from "../../lib/loadTrees";
import { SHADOW_COLOR, chunkShadowPath } from "./shadows";
import { BRIDGE_CASING, GROUND_COLORS, LINE_COLORS, ROAD_CASING } from "./palette";

const CAR_ROAD_MAX_KIND = 3; // major, medium, minor, service

export function paintGround(
  ctx: CanvasRenderingContext2D,
  chunks: Chunk[],
  trees: TreeData | null,
  place: (c: Chunk) => void,
) {
  for (let kind = 0; kind < GROUND_COLORS.length; kind++) {
    ctx.fillStyle = GROUND_COLORS[kind];
    for (const c of chunks) {
      const path = c.ground[kind];
      if (!path) continue;
      place(c);
      ctx.fill(path, "evenodd");
    }
  }

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const bridge of [false, true]) {
    // casings first so crossing roads merge cleanly
    for (const c of chunks) {
      place(c);
      for (const g of c.lines) {
        if (g.bridge !== bridge || (g.kind > CAR_ROAD_MAX_KIND && !bridge)) continue;
        ctx.strokeStyle = bridge ? BRIDGE_CASING : ROAD_CASING;
        ctx.lineWidth = g.width + (bridge ? 1.6 : 1);
        ctx.stroke(g.path);
      }
    }
    for (const c of chunks) {
      place(c);
      for (const g of c.lines) {
        if (g.bridge !== bridge) continue;
        ctx.strokeStyle = LINE_COLORS[g.kind];
        ctx.lineWidth = g.width;
        ctx.stroke(g.path);
      }
    }
    // shadows fall on ground, water and streets, but bridges pass over them
    if (!bridge) paintShadows(ctx, chunks, trees, place);
  }
}

function paintShadows(ctx: CanvasRenderingContext2D, chunks: Chunk[], trees: TreeData | null, place: (c: Chunk) => void) {
  ctx.fillStyle = SHADOW_COLOR;
  ctx.globalCompositeOperation = "multiply";
  for (const c of chunks) {
    place(c);
    ctx.fill(chunkShadowPath(c, trees));
  }
  ctx.globalCompositeOperation = "source-over";
}
