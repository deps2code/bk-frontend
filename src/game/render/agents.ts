// Ambient traffic and street furniture drawn in the y-sorted scene pass:
// oblique box cars (body + cabin prisms, like the buildings: a face is
// visible iff its edge runs eastward on the CCW outline), pedestrians and
// cyclists (the player's figure, smaller, other clothes) and street lamps
// placed procedurally along the bigger roads.

import type { Camera } from "../camera";
import type { Agent } from "../traffic";
import { CAR_COLORS, CAR_LEN, CAR_WID, PED_LOOKS } from "../traffic";
import type { Chunk } from "../worldFormat";
import { CHUNK_SIZE } from "../world";
import { insideFootprint } from "./buildings";
import { HEIGHT_FACTOR, SHADOW } from "./geometry";
import { drawFigure, PLAYER_HEIGHT_M, playerHeightPx } from "./sprites";

/** Car footprint in meters — a bit above true size, like the figures. */
/** Vertical stretch of the car boxes: the cabin top reaches ≈ ¾ of the player's height. */
export const CAR_Z = 2.9;

/**
 * Extra on-screen size matching the player's minimum sprite size when zoomed
 * out (so cars stay in proportion to the figures), capped so cars don't
 * swamp the streets at the widest zoom.
 */
export function carBoost(scale: number): number {
  return Math.min(2, playerHeightPx(scale) / (PLAYER_HEIGHT_M * scale));
}

/** Sort key: the south-most ground y of the agent's footprint. */
export function agentSortY(a: { kind: string; heading: number }, y: number): number {
  if (a.kind !== "car") return y;
  return y - (Math.abs(Math.sin(a.heading)) * CAR_LEN + Math.abs(Math.cos(a.heading)) * CAR_WID) / 2;
}

export function drawAgent(ctx: CanvasRenderingContext2D, cam: Camera, a: Agent, x: number, y: number, night: number) {
  if (a.kind === "car") return drawCar(ctx, cam, a, x, y, night);
  // pedestrians and cyclists are drawn exactly as big as the player
  const h = playerHeightPx(cam.scale);
  drawFigure(
    ctx,
    cam.sx(x),
    cam.sy(y),
    h,
    { mode: a.kind === "cyclist" ? "bike" : "walk", facing: a.facing, phase: a.phase, moving: a.speed > 0.3 },
    PED_LOOKS[a.look % PED_LOOKS.length],
  );
}

// ---- cars -------------------------------------------------------------------

function drawCar(ctx: CanvasRenderingContext2D, cam: Camera, a: Agent, x: number, y: number, night: number) {
  const s = cam.scale;
  const k = carBoost(s);
  const c = Math.cos(a.heading), sn = Math.sin(a.heading);
  // (along, right, z) → screen; right of heading is (sn, -c)
  const P = (al: number, r: number, z: number): [number, number] => [
    cam.sx(x + c * al + sn * r),
    cam.sy(y + sn * al - c * r) - z * CAR_Z * HEIGHT_FACTOR * s * k,
  ];
  const L = (CAR_LEN / 2) * k, W = (CAR_WID / 2) * k;
  const color = CAR_COLORS[a.look % CAR_COLORS.length];

  // ground shadow, cast south-east like the buildings'
  const sh = 1.6 * CAR_Z * k;
  ctx.fillStyle = "rgba(40, 30, 20, 0.22)";
  ctx.beginPath();
  for (const [al, r] of [[L, W], [L, -W], [-L, -W], [-L, W]]) {
    const [px, py] = P(al, r, 0);
    ctx.lineTo(px + SHADOW.x * sh * s, py - SHADOW.y * sh * s);
  }
  ctx.fill();

  ctx.lineJoin = "round";
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(30, 30, 30, 0.45)";
  prism(ctx, P, L * 0.92, W * 0.86, 0, 0.35, "#1f1f22", "#1f1f22"); // wheels / underbody
  prism(ctx, P, L, W, 0.3, 1.1, shade(color, -0.22), color);
  // cabin sits a little back; windows are its sides
  prism(ctx, P, L * 0.5, W * 0.84, 1.1, 1.85, "#3b4a5a", shade(color, 0.12), -L * 0.15);

  // lights on whichever end faces the viewer (south)
  const front = sn < 0, rear = sn > 0;
  if (front || rear) {
    const al = front ? L : -L;
    const lit = front ? (night > 0.3 ? "#fffbe6" : "#f3edd6") : night > 0.3 ? "#ff4a3a" : "#b8322b";
    ctx.fillStyle = lit;
    for (const r of [-W * 0.62, W * 0.62]) {
      const [px, py] = P(al, r, 0.75);
      ctx.beginPath();
      ctx.arc(px, py, Math.max(1, 0.3 * s * k), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Box from z0 to z1 over the rectangle |along − shift| ≤ L, |right| ≤ W. */
function prism(
  ctx: CanvasRenderingContext2D,
  P: (al: number, r: number, z: number) => [number, number],
  L: number,
  W: number,
  z0: number,
  z1: number,
  side: string,
  top: string,
  shift = 0,
) {
  // CCW in world (y north): front-right, front-left, rear-left, rear-right
  const corners: [number, number][] = [[shift + L, W], [shift + L, -W], [shift - L, -W], [shift - L, W]];
  const g = corners.map(([al, r]) => P(al, r, z0));
  const t = corners.map(([al, r]) => P(al, r, z1));
  ctx.fillStyle = side;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    // screen x grows with world x, so "edge runs east" ⇔ screen dx > 0
    if (g[j][0] - g[i][0] <= 0) continue;
    ctx.beginPath();
    ctx.moveTo(g[i][0], g[i][1]);
    ctx.lineTo(g[j][0], g[j][1]);
    ctx.lineTo(t[j][0], t[j][1]);
    ctx.lineTo(t[i][0], t[i][1]);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = top;
  ctx.beginPath();
  for (const [px, py] of t) ctx.lineTo(px, py);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function shade(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const to = t < 0 ? 0 : 255;
  const k = Math.abs(t);
  const ch = (sft: number) => Math.round(((n >> sft) & 255) * (1 - k) + to * k);
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

// ---- street lamps ------------------------------------------------------------

const LAMP_SPACING = 32; // m along a road
/** Lamp pole height in meters (head position for the light map). */
export const LAMP_HEAD_Z = 5;
export const LAMP_MIN_SCALE = 4; // px/m before poles are drawn

/**
 * Lamps along major/medium/minor roads and pedestrian streets, alternating
 * sides at the road edge, skipping spots inside buildings. Only lamps inside
 * the chunk proper are kept (ways overlap neighbouring chunks by 25 m).
 */
export function lampsOf(c: Chunk): Float32Array {
  if (c.lamps) return c.lamps;
  const out: number[] = [];
  let n = 0;
  for (const w of c.ways) {
    const road = w.kind <= 2 || (w.kind === 4 && w.width >= 5);
    if (!road) continue;
    const p = w.pts;
    let next = LAMP_SPACING * 0.5;
    let walked = 0;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const dx = p[i + 2] - p[i], dy = p[i + 3] - p[i + 1];
      const L = Math.hypot(dx, dy);
      while (L > 0 && next <= walked + L) {
        const t = (next - walked) / L;
        const side = (n++ & 1 ? 1 : -1) * Math.max(0.5, w.width / 2 - 0.4);
        const x = p[i] + dx * t + (dy / L) * side;
        const y = p[i + 1] + dy * t - (dx / L) * side;
        next += LAMP_SPACING;
        if (x < 0 || y < 0 || x >= CHUNK_SIZE || y >= CHUNK_SIZE) continue;
        if (c.buildings.some((b) => x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY && insideFootprint(b, x, y))) continue;
        out.push(c.ox + x, c.oy + y);
      }
      walked += L;
    }
  }
  c.lamps = new Float32Array(out);
  return c.lamps;
}

export function drawLamp(ctx: CanvasRenderingContext2D, cam: Camera, x: number, y: number, night: number) {
  const s = cam.scale;
  const sx = cam.sx(x), sy = cam.sy(y);
  const top = sy - LAMP_HEAD_Z * HEIGHT_FACTOR * s;
  ctx.strokeStyle = "#4f5459";
  ctx.lineWidth = Math.max(1, 0.16 * s);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(sx, top);
  ctx.stroke();
  ctx.fillStyle = night > 0.3 ? "#fff6d8" : "#d7dad4";
  ctx.strokeStyle = "rgba(40, 40, 40, 0.5)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(sx, top, Math.max(1.5, 0.45 * s), Math.max(1, 0.28 * s), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}
