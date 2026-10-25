// Placeholder ground for milestone 1: flat fill plus a 10 m / 50 m grid and
// the 250 m chunk boundaries (labelled), so movement and scale are readable.

import type { Camera } from "../camera";
import { CHUNK_SIZE, SPAWN } from "../world";

const GROUND = "#e4dcc4";
const LINE_10 = "rgba(90, 80, 50, 0.08)";
const LINE_50 = "rgba(90, 80, 50, 0.16)";
const LINE_CHUNK = "rgba(60, 90, 50, 0.45)";

export function drawGround(ctx: CanvasRenderingContext2D, cam: Camera) {
  ctx.fillStyle = GROUND;
  ctx.fillRect(0, 0, cam.viewW, cam.viewH);

  if (cam.scale >= 4) gridLines(ctx, cam, 10, LINE_10, 1);
  gridLines(ctx, cam, 50, LINE_50, 1);
  gridLines(ctx, cam, CHUNK_SIZE, LINE_CHUNK, 2);
  chunkLabels(ctx, cam);
  spawnMarker(ctx, cam);
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

function chunkLabels(ctx: CanvasRenderingContext2D, cam: Camera) {
  const b = cam.bounds();
  ctx.font = "600 11px system-ui, sans-serif";
  ctx.fillStyle = LINE_CHUNK;
  ctx.textBaseline = "top";
  for (let cx = Math.floor(b.minX / CHUNK_SIZE); cx * CHUNK_SIZE <= b.maxX; cx++) {
    for (let cy = Math.floor(b.minY / CHUNK_SIZE) + 1; (cy - 1) * CHUNK_SIZE <= b.maxY; cy++) {
      // label sits in the chunk's north-west corner
      ctx.fillText(`${cx},${cy - 1}`, cam.sx(cx * CHUNK_SIZE) + 5, cam.sy(cy * CHUNK_SIZE) + 5);
    }
  }
}

function spawnMarker(ctx: CanvasRenderingContext2D, cam: Camera) {
  const x = cam.sx(SPAWN.x);
  const y = cam.sy(SPAWN.y);
  ctx.beginPath();
  ctx.arc(x, y, 6 * cam.scale, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(200, 120, 40, 0.5)";
  ctx.setLineDash([6, 6]);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = `700 ${Math.max(12, Math.min(28, 2.2 * cam.scale))}px system-ui, sans-serif`;
  ctx.fillStyle = "rgba(120, 90, 40, 0.35)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("GROTE MARKT", x, y + 9 * cam.scale);
  ctx.textAlign = "start";
}
