// Debug overlay (toggle with G): 10 m / 50 m grid and labelled 250 m chunk
// boundaries.

import type { Camera } from "../camera";
import { CHUNK_SIZE } from "../world";

const LINE_10 = "rgba(90, 80, 50, 0.08)";
const LINE_50 = "rgba(90, 80, 50, 0.16)";
const LINE_CHUNK = "rgba(160, 40, 40, 0.5)";

export function drawDebugGrid(ctx: CanvasRenderingContext2D, cam: Camera) {
  if (cam.scale >= 4) gridLines(ctx, cam, 10, LINE_10, 1);
  gridLines(ctx, cam, 50, LINE_50, 1);
  gridLines(ctx, cam, CHUNK_SIZE, LINE_CHUNK, 2);

  const b = cam.bounds();
  ctx.font = "600 11px system-ui, sans-serif";
  ctx.fillStyle = LINE_CHUNK;
  ctx.textBaseline = "top";
  for (let cx = Math.floor(b.minX / CHUNK_SIZE); cx * CHUNK_SIZE <= b.maxX; cx++) {
    for (let cy = Math.floor(b.minY / CHUNK_SIZE); cy * CHUNK_SIZE <= b.maxY; cy++) {
      // label sits in the chunk's north-west corner
      ctx.fillText(`${cx},${cy}`, cam.sx(cx * CHUNK_SIZE) + 5, cam.sy((cy + 1) * CHUNK_SIZE) + 5);
    }
  }
}

function gridLines(ctx: CanvasRenderingContext2D, cam: Camera, step: number, color: string, width: number) {
  const b = cam.bounds();
  ctx.beginPath();
  for (let x = Math.ceil(b.minX / step) * step; x <= b.maxX; x += step) {
    const sx = Math.round(cam.sx(x)) + 0.5;
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, cam.viewH);
  }
  for (let y = Math.ceil(b.minY / step) * step; y <= b.maxY; y += step) {
    const sy = Math.round(cam.sy(y)) + 0.5;
    ctx.moveTo(0, sy);
    ctx.lineTo(cam.viewW, sy);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}
