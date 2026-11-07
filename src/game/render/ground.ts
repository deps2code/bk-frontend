// Ground layer: base fill, landuse/water polygons and line features (roads,
// paths, cycleways, rail, waterways) for the visible chunks. Drawn directly
// each frame for now; milestone 3 caches it per chunk.

import { setChunkTransform, type Camera } from "../camera";
import type { Chunk } from "../worldFormat";
import { BASE_GROUND, BRIDGE_CASING, GROUND_COLORS, LINE_COLORS, ROAD_CASING } from "./palette";

const CAR_ROAD_MAX_KIND = 3; // major, medium, minor, service

export function drawGround(ctx: CanvasRenderingContext2D, cam: Camera, dpr: number, chunks: Chunk[]) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = BASE_GROUND;
  ctx.fillRect(0, 0, cam.viewW, cam.viewH);

  for (let kind = 0; kind < GROUND_COLORS.length; kind++) {
    ctx.fillStyle = GROUND_COLORS[kind];
    for (const c of chunks) {
      const path = c.ground[kind];
      if (!path) continue;
      setChunkTransform(ctx, cam, dpr, c.ox, c.oy);
      ctx.fill(path, "evenodd");
    }
  }

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const bridge of [false, true]) {
    // casings first so crossing roads merge cleanly
    for (const c of chunks) {
      setChunkTransform(ctx, cam, dpr, c.ox, c.oy);
      for (const g of c.lines) {
        if (g.bridge !== bridge || (g.kind > CAR_ROAD_MAX_KIND && !bridge)) continue;
        ctx.strokeStyle = bridge ? BRIDGE_CASING : ROAD_CASING;
        ctx.lineWidth = g.width + (bridge ? 1.6 : 1);
        ctx.stroke(g.path);
      }
    }
    for (const c of chunks) {
      setChunkTransform(ctx, cam, dpr, c.ox, c.oy);
      for (const g of c.lines) {
        if (g.bridge !== bridge) continue;
        ctx.strokeStyle = LINE_COLORS[g.kind];
        ctx.lineWidth = g.width;
        ctx.stroke(g.path);
      }
    }
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
