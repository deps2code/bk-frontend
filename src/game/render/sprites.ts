// Procedural player sprites: a walker (two-step leg swing) and a cyclist on a
// black Dutch omafiets with a basket (pedalling legs, spinning wheels), both
// in 4 facings, plus a drop shadow and a name tag. Drawn larger than true
// scale (game convention) with a minimum on-screen size for small phones.

import type { Facing } from "../player";
import type { Mode } from "../store";

const SKIN = "#e8b98f";
const SHIRT = "#2f7d4a";
const PANTS = "#3b4a6b";
const PANTS_BACK = "#2e3a55";
const HAIR = "#5a3b22";
const FRAME = "#262626";
const TYRE = "#1d1d1d";
const SPOKE = "rgba(200, 200, 200, 0.8)";
const BASKET = "#9a6b45";
const OUTLINE = "rgba(30, 30, 30, 0.55)";
const SHADOW = "rgba(0, 0, 0, 0.18)";

/** Height of the player figure in meters (≈2.5× a real person). */
const PLAYER_HEIGHT_M = 4.5;
const MIN_HEIGHT_PX = 40;

export interface PlayerView {
  mode: Mode;
  facing: Facing;
  phase: number;
  moving: boolean;
}

/** On-screen sprite height in CSS px (also how far it reaches "north"). */
export function playerHeightPx(scale: number): number {
  return Math.max(MIN_HEIGHT_PX, PLAYER_HEIGHT_M * scale);
}

/** Draw the player with feet (or wheels) on screen point (x, y). */
export function drawPlayer(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, v: PlayerView, name: string) {
  const u = playerHeightPx(scale) / 10; // drawing unit
  ctx.lineWidth = Math.max(1, u * 0.18);
  ctx.strokeStyle = OUTLINE;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const headY = v.mode === "bike" ? drawCyclist(ctx, x, y, u, v) : drawWalker(ctx, x, y, u, v);
  nameTag(ctx, x, headY - 2.2 * u, u, name);
}

// ---- walker ---------------------------------------------------------------

function drawWalker(ctx: CanvasRenderingContext2D, x: number, y: number, u: number, v: PlayerView): number {
  const swing = v.moving ? Math.sin(v.phase) : 0;
  const bob = v.moving ? Math.abs(Math.cos(v.phase)) * 0.35 * u : 0;
  const side = v.facing === "left" || v.facing === "right";

  shadow(ctx, x, y, 2.4 * u, 0.9 * u);

  // legs: front/back views swing vertically, side views swing horizontally
  ctx.fillStyle = PANTS;
  for (const s of [-1, 1]) {
    const lift = swing * s;
    const lx = side ? x + lift * 0.9 * u - 0.55 * u : x + s * 0.75 * u - 0.55 * u;
    const ly = y - 3.2 * u - bob + (side ? 0 : Math.min(0, lift) * 0.6 * u);
    roundRect(ctx, lx, ly, 1.1 * u, 3.2 * u, 0.4 * u);
  }

  const bodyTop = y - 6.8 * u - bob;
  ctx.fillStyle = SHIRT;
  roundRect(ctx, x - 1.7 * u, bodyTop, 3.4 * u, 3.9 * u, 1 * u);

  // arms swing opposite to legs
  ctx.fillStyle = SKIN;
  for (const s of [-1, 1]) {
    const ax = side ? x - 0.4 * u - swing * s * 0.8 * u : x + s * 2.1 * u - 0.4 * u;
    roundRect(ctx, ax, bodyTop + 0.5 * u + (side ? 0 : swing * s * 0.3 * u), 0.8 * u, 2.8 * u, 0.4 * u);
  }

  const hy = bodyTop - 1.5 * u;
  head(ctx, x, hy, 1.7 * u, v.facing);
  return hy;
}

// ---- cyclist --------------------------------------------------------------

function drawCyclist(ctx: CanvasRenderingContext2D, x: number, y: number, u: number, v: PlayerView): number {
  return v.facing === "left" || v.facing === "right" ? cyclistSide(ctx, x, y, u, v) : cyclistFront(ctx, x, y, u, v);
}

function cyclistSide(ctx: CanvasRenderingContext2D, x: number, y: number, u: number, v: PlayerView): number {
  const d = v.facing === "right" ? 1 : -1;
  const r = 1.45 * u; // wheel radius
  const rear = { x: x - 2.4 * u * d, y: y - r };
  const front = { x: x + 2.4 * u * d, y: y - r };
  const bb = { x: x - 0.2 * u * d, y: y - r }; // bottom bracket
  const seat = { x: x - 0.9 * u * d, y: y - 4.3 * u };
  const headTube = { x: x + 1.8 * u * d, y: y - 4.4 * u };
  const bar = { x: x + 1.4 * u * d, y: y - 5.5 * u };
  const crank = v.phase * d;

  shadow(ctx, x, y, 4.4 * u, 0.9 * u);
  wheel(ctx, rear.x, rear.y, r, u, crank * 2.4);
  wheel(ctx, front.x, front.y, r, u, crank * 2.4);

  const hip = { x: seat.x + 0.1 * u * d, y: seat.y - 0.4 * u };
  const pedal = (a: number) => ({ x: bb.x + Math.cos(a) * 0.85 * u, y: bb.y + Math.sin(a) * 0.85 * u });
  leg(ctx, hip, pedal(crank + Math.PI), u, d, PANTS_BACK); // far leg behind the frame

  // frame: chainstay, seat tube, low step-through tube, fork, stem and bar
  ctx.strokeStyle = FRAME;
  ctx.lineWidth = 0.38 * u;
  ctx.beginPath();
  ctx.moveTo(rear.x, rear.y);
  ctx.lineTo(bb.x, bb.y);
  ctx.lineTo(seat.x, seat.y);
  ctx.moveTo(bb.x, bb.y);
  ctx.quadraticCurveTo(x + 0.9 * u * d, y - 1.6 * u, headTube.x, headTube.y);
  ctx.lineTo(front.x, front.y);
  ctx.moveTo(headTube.x, headTube.y);
  ctx.lineTo(bar.x, bar.y);
  ctx.lineTo(bar.x - 0.8 * u * d, bar.y - 0.1 * u);
  ctx.stroke();
  ctx.lineWidth = 0.6 * u; // saddle
  ctx.beginPath();
  ctx.moveTo(seat.x - 0.5 * u * d, seat.y);
  ctx.lineTo(seat.x + 0.4 * u * d, seat.y);
  ctx.stroke();

  // basket on the front carrier
  ctx.fillStyle = BASKET;
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = Math.max(1, u * 0.18);
  roundRect(ctx, front.x - 0.2 * u * d - (d < 0 ? 1.5 * u : 0), y - 5.1 * u, 1.5 * u, 1.2 * u, 0.25 * u);

  leg(ctx, hip, pedal(crank), u, d, PANTS);

  // torso leaning to the bar, arm, head
  const bob = v.moving ? Math.abs(Math.sin(v.phase)) * 0.15 * u : 0;
  const shoulder = { x: x + 0.3 * u * d, y: y - 7.5 * u + bob };
  ctx.strokeStyle = SHIRT;
  ctx.lineWidth = 1.7 * u;
  line(ctx, hip.x, hip.y, shoulder.x, shoulder.y);
  ctx.strokeStyle = SKIN;
  ctx.lineWidth = 0.65 * u;
  line(ctx, shoulder.x, shoulder.y + 0.3 * u, bar.x - 0.6 * u * d, bar.y);

  const hy = shoulder.y - 1.4 * u;
  ctx.lineWidth = Math.max(1, u * 0.18);
  ctx.strokeStyle = OUTLINE;
  head(ctx, shoulder.x + 0.5 * u * d, hy, 1.6 * u, v.facing);
  return hy;
}

function cyclistFront(ctx: CanvasRenderingContext2D, x: number, y: number, u: number, v: PlayerView): number {
  const towards = v.facing === "down";
  const pedal = v.moving ? Math.sin(v.phase) : 0;

  shadow(ctx, x, y, 1.5 * u, 0.8 * u);
  // the wheel(s) seen end-on
  ctx.fillStyle = TYRE;
  roundRect(ctx, x - 0.3 * u, y - 2.9 * u, 0.6 * u, 2.9 * u, 0.3 * u);

  // pedalling legs move up and down against each other
  ctx.fillStyle = PANTS;
  for (const s of [-1, 1]) {
    const lift = pedal * s * 0.7 * u;
    roundRect(ctx, x + s * 0.8 * u - 0.55 * u, y - 4.4 * u - lift, 1.1 * u, 2.9 * u, 0.4 * u);
  }

  const bodyTop = y - 7.4 * u;
  ctx.fillStyle = SHIRT;
  roundRect(ctx, x - 1.7 * u, bodyTop, 3.4 * u, 3.6 * u, 1 * u);

  // handlebar with hands on the grips
  ctx.strokeStyle = FRAME;
  ctx.lineWidth = 0.4 * u;
  line(ctx, x - 2.3 * u, y - 5 * u, x + 2.3 * u, y - 5 * u);
  line(ctx, x, y - 5 * u, x, y - 2.6 * u);
  ctx.strokeStyle = SKIN;
  ctx.lineWidth = 0.65 * u;
  for (const s of [-1, 1]) line(ctx, x + s * 1.8 * u, bodyTop + 0.8 * u, x + s * 2.1 * u, y - 5 * u);

  ctx.lineWidth = Math.max(1, u * 0.18);
  ctx.strokeStyle = OUTLINE;
  if (towards) {
    ctx.fillStyle = BASKET;
    roundRect(ctx, x - 1.1 * u, y - 4.7 * u, 2.2 * u, 1.3 * u, 0.25 * u);
  }

  const hy = bodyTop - 1.4 * u;
  head(ctx, x, hy, 1.6 * u, v.facing);
  return hy;
}

/** Two-segment leg from hip to foot, knee bent forward (direction d). */
function leg(ctx: CanvasRenderingContext2D, hip: Pt, foot: Pt, u: number, d: number, color: string) {
  const l = 2.25 * u;
  const dx = foot.x - hip.x, dy = foot.y - hip.y;
  const dist = Math.min(Math.hypot(dx, dy), 2 * l - 0.01);
  const a = Math.atan2(dy, dx);
  const bend = Math.acos(dist / (2 * l)) * -d;
  const knee = { x: hip.x + Math.cos(a + bend) * l, y: hip.y + Math.sin(a + bend) * l };
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.95 * u;
  ctx.beginPath();
  ctx.moveTo(hip.x, hip.y);
  ctx.lineTo(knee.x, knee.y);
  ctx.lineTo(foot.x, foot.y);
  ctx.stroke();
}

function wheel(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, u: number, angle: number) {
  ctx.strokeStyle = SPOKE;
  ctx.lineWidth = Math.max(0.6, 0.08 * u);
  ctx.beginPath();
  for (let k = 0; k < 3; k++) {
    const a = angle + (k * Math.PI) / 3;
    ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.lineTo(cx - Math.cos(a) * r, cy - Math.sin(a) * r);
  }
  ctx.stroke();
  ctx.strokeStyle = TYRE;
  ctx.lineWidth = 0.38 * u;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
}

// ---- shared ---------------------------------------------------------------

interface Pt {
  x: number;
  y: number;
}

/** Head with hair; the hair covers the face when moving away. */
function head(ctx: CanvasRenderingContext2D, hx: number, hy: number, r: number, facing: Facing) {
  const u = r / 1.7;
  ctx.beginPath();
  ctx.arc(hx, hy, r, 0, Math.PI * 2);
  ctx.fillStyle = facing === "up" ? HAIR : SKIN;
  ctx.fill();
  ctx.stroke();
  if (facing === "up") return;
  ctx.beginPath();
  const start = facing === "left" ? Math.PI * 0.75 : facing === "right" ? Math.PI * 1.25 : Math.PI;
  ctx.arc(hx, hy, r, start, start + Math.PI);
  ctx.closePath();
  ctx.fillStyle = HAIR;
  ctx.fill();
  ctx.fillStyle = "#222";
  const eyeY = hy + 0.35 * u;
  const eyes = facing === "down" ? [-0.6, 0.6] : facing === "left" ? [-0.9] : [0.9];
  for (const ex of eyes) {
    ctx.beginPath();
    ctx.arc(hx + ex * u, eyeY, Math.max(1, 0.22 * u), 0, Math.PI * 2);
    ctx.fill();
  }
}

function nameTag(ctx: CanvasRenderingContext2D, x: number, y: number, u: number, name: string) {
  ctx.font = `700 ${Math.round(Math.max(11, u * 1.5))}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
  ctx.strokeText(name, x, y);
  ctx.fillStyle = "#3a2a14";
  ctx.fillText(name, x, y);
  ctx.textAlign = "start";
}

function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = SHADOW;
  ctx.fill();
}

function line(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  ctx.stroke();
}
