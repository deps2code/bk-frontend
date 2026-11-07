// Area names painted on the ground (squares, parks, water, neighbourhoods),
// in the screenshot style: big, uppercase, translucent.

import type { Camera } from "../camera";
import type { Chunk } from "../worldFormat";

// [min px size, meters → px factor, color] per label kind
const STYLE: [number, number, string][] = [
  [12, 1.6, "rgba(110, 90, 60, 0.55)"], // square
  [13, 2.0, "rgba(50, 95, 40, 0.55)"], // park
  [12, 1.8, "rgba(30, 90, 130, 0.55)"], // water
  [13, 2.6, "rgba(90, 80, 60, 0.35)"], // neighbourhood
  [14, 3.2, "rgba(90, 80, 60, 0.3)"], // quarter
];

export function drawLabels(ctx: CanvasRenderingContext2D, cam: Camera, chunks: Chunk[]) {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const c of chunks) {
    for (const l of c.labels) {
      const [min, k, color] = STYLE[l.kind] ?? STYLE[0];
      const size = Math.min(40, Math.max(min, k * cam.scale));
      ctx.font = `800 ${Math.round(size)}px system-ui, sans-serif`;
      ctx.fillStyle = color;
      ctx.fillText(l.name.toUpperCase(), cam.sx(l.x), cam.sy(l.y));
    }
  }
  ctx.textAlign = "start";
}
