// Procedural player sprite: drop shadow, two-step leg swing, body, head with
// hair showing the facing direction, and a name tag. Drawn larger than true
// scale (game convention) with a minimum on-screen size for small phones.

import type { Facing } from "../player";

const SKIN = "#e8b98f";
const SHIRT = "#2f7d4a";
const PANTS = "#3b4a6b";
const HAIR = "#5a3b22";
const OUTLINE = "rgba(30, 30, 30, 0.55)";

/** Height of the player figure in meters (≈2.5× a real person). */
const PLAYER_HEIGHT_M = 4.5;
const MIN_HEIGHT_PX = 40;

export function drawPlayer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  facing: Facing,
  walkPhase: number,
  moving: boolean,
  name: string,
) {
  const h = Math.max(MIN_HEIGHT_PX, PLAYER_HEIGHT_M * scale);
  const u = h / 10; // drawing unit
  const swing = moving ? Math.sin(walkPhase) : 0;
  const bob = moving ? Math.abs(Math.cos(walkPhase)) * 0.35 * u : 0;
  const side = facing === "left" || facing === "right";

  // shadow
  ctx.beginPath();
  ctx.ellipse(x, y, 2.4 * u, 0.9 * u, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
  ctx.fill();

  ctx.lineWidth = Math.max(1, u * 0.18);
  ctx.strokeStyle = OUTLINE;

  // legs: front/back views swing vertically, side views swing horizontally
  ctx.fillStyle = PANTS;
  for (const s of [-1, 1]) {
    const lift = swing * s;
    const lx = side ? x + lift * 0.9 * u - 0.55 * u : x + s * 0.75 * u - 0.55 * u;
    const ly = y - 3.2 * u - bob + (side ? 0 : Math.min(0, lift) * 0.6 * u);
    roundRect(ctx, lx, ly, 1.1 * u, 3.2 * u, 0.4 * u);
  }

  // body
  const bodyTop = y - 6.8 * u - bob;
  ctx.fillStyle = SHIRT;
  roundRect(ctx, x - 1.7 * u, bodyTop, 3.4 * u, 3.9 * u, 1 * u);

  // arms swing opposite to legs
  ctx.fillStyle = SKIN;
  for (const s of [-1, 1]) {
    const ax = side ? x - 0.4 * u - swing * s * 0.8 * u : x + s * 2.1 * u - 0.4 * u;
    roundRect(ctx, ax, bodyTop + 0.5 * u + (side ? 0 : swing * s * 0.3 * u), 0.8 * u, 2.8 * u, 0.4 * u);
  }

  // head + hair (hair covers the face when walking away)
  const hx = x;
  const hy = bodyTop - 1.5 * u;
  ctx.beginPath();
  ctx.arc(hx, hy, 1.7 * u, 0, Math.PI * 2);
  ctx.fillStyle = facing === "up" ? HAIR : SKIN;
  ctx.fill();
  ctx.stroke();
  if (facing !== "up") {
    ctx.beginPath();
    const start = facing === "left" ? Math.PI * 0.75 : facing === "right" ? Math.PI * 1.25 : Math.PI;
    ctx.arc(hx, hy, 1.7 * u, start, start + Math.PI);
    ctx.closePath();
    ctx.fillStyle = HAIR;
    ctx.fill();
    // eyes
    ctx.fillStyle = "#222";
    const eyeY = hy + 0.35 * u;
    const eyes = facing === "down" ? [-0.6, 0.6] : facing === "left" ? [-0.9] : [0.9];
    for (const ex of eyes) {
      ctx.beginPath();
      ctx.arc(hx + ex * u, eyeY, Math.max(1, 0.22 * u), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // name tag
  ctx.font = `700 ${Math.round(Math.max(11, u * 1.5))}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
  ctx.strokeText(name, x, hy - 2.2 * u);
  ctx.fillStyle = "#3a2a14";
  ctx.fillText(name, x, hy - 2.2 * u);
  ctx.textAlign = "start";
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  ctx.stroke();
}
