// Tree sprites: a trunk drawn per tree plus a crown image from a lazily
// built atlas. Crowns are cartoon blobs per shape (round, oval, weeping,
// conifer) in the archetype colour, with outline, shading and highlights;
// monumental trees get a gold rim. Atlas entries are keyed by shape ×
// archetype × monumental × variant × size bucket (√2 steps of on-screen
// diameter, rendered at the bucket above and drawn scaled down).
// Ground shadows are baked into the ground tiles (shadows.ts).

import type { Camera } from "../camera";
import { ARCHETYPES, MONUMENTAL_COLOR, type Shape } from "../../lib/archetypes";
import { jitter, type TreeData } from "../../lib/loadTrees";
import { HEIGHT_FACTOR, crownCenterZ, crownRadius } from "./geometry";

const TRUNK = "#7a5a3c";
const TRUNK_EDGE = "rgba(60, 40, 22, 0.7)";
const GOLD = `rgb(${MONUMENTAL_COLOR.join(",")})`;
const MIN_BUCKET = 8;
const MAX_BUCKET = 362; // ≈ 2^8.5
const VARIANTS = 2;

/** Crown extent per shape in radii: [half-width, half-height]. */
const ASPECT: Record<Shape, [number, number]> = {
  round: [1, 1],
  oval: [0.8, 1.3],
  weeping: [1.1, 1],
  conifer: [0.72, 1.45],
};
const PAD = 1.18; // sprite canvas margin for outline + lobes past the radius

interface Sprite {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  /** The diameter in px the sprite was rendered for. */
  bucket: number;
}

const atlas = new Map<string, Sprite>();

/** Screen-space hit shapes of the trees drawn this frame, in draw order. */
export interface TreeHit {
  i: number;
  /** Crown centre and radius, CSS px. */
  cx: number;
  cy: number;
  r: number;
  /** Feet (trunk base), CSS px. */
  fx: number;
  fy: number;
}

/** Crown lift in ground meters ("north" = up the screen). */
export function treeLift(h: number, r: number): number {
  return crownCenterZ(h, r) * HEIGHT_FACTOR;
}

/** Screen geometry of tree `i` into `hit` (needed before drawing, e.g. to
 *  decide see-through, and kept afterwards for picking). */
export function layoutTree(cam: Camera, trees: TreeData, i: number, hit: TreeHit) {
  const h = trees.heights[i];
  const r = crownRadius(h, i);
  hit.i = i;
  hit.fx = cam.sx(trees.x[i] / 10);
  hit.fy = cam.sy(trees.y[i] / 10);
  hit.cy = hit.fy - treeLift(h, r) * cam.scale;
  hit.cx = hit.fx;
  hit.r = r * cam.scale;
}

/** Draw a tree laid out by `layoutTree`. */
export function drawTree(ctx: CanvasRenderingContext2D, cam: Camera, trees: TreeData, hit: TreeHit, alpha: number) {
  const i = hit.i;
  const h = trees.heights[i];
  const arch = trees.archetypes[i];
  const mon = (trees.flags[i] & 1) !== 0;
  const { fx, fy, cy, r } = hit;

  ctx.globalAlpha = alpha;
  // trunk, from the ground into the crown
  const tw = Math.max(1.5, (0.3 + h * 0.025) * cam.scale);
  ctx.fillStyle = TRUNK;
  ctx.fillRect(fx - tw / 2, cy, tw, fy - cy);
  if (tw > 3) {
    ctx.strokeStyle = TRUNK_EDGE;
    ctx.lineWidth = 1;
    ctx.strokeRect(fx - tw / 2, cy, tw, fy - cy);
  }

  const sprite = spriteFor(ARCHETYPES[arch].shape, arch, mon, Math.floor(jitter(i, 2) * VARIANTS), 2 * r);
  const k = (2 * r) / sprite.bucket;
  const w = sprite.canvas.width * k;
  const hh = sprite.canvas.height * k;
  ctx.drawImage(sprite.canvas, fx - w / 2, cy - hh / 2, w, hh);
  ctx.globalAlpha = 1;
}

/** Is screen point (x, y) on tree `hit` (crown or trunk)? */
export function hitsTree(trees: TreeData, hit: TreeHit, x: number, y: number): boolean {
  const [ax, ay] = ASPECT[ARCHETYPES[trees.archetypes[hit.i]].shape];
  const dx = (x - hit.cx) / (hit.r * ax);
  const dy = (y - hit.cy) / (hit.r * ay);
  if (dx * dx + dy * dy <= 1.1) return true;
  return Math.abs(x - hit.fx) <= Math.max(4, hit.r * 0.25) && y <= hit.fy + 2 && y >= hit.cy;
}

/** Does the crown of `hit` cover the player sprite (feet at psx, psy)? */
export function crownCoversPlayer(hit: TreeHit, psx: number, psy: number, playerH: number): boolean {
  const halfW = playerH * 0.3;
  const dx = Math.max(Math.abs(hit.cx - psx) - halfW, 0);
  const dy = Math.max(hit.cy - psy, psy - playerH - hit.cy, 0);
  return dx * dx + dy * dy < hit.r * hit.r;
}

/** Pulsing ring at the foot of the selected tree (drawn just before it). */
export function drawSelection(ctx: CanvasRenderingContext2D, cam: Camera, trees: TreeData, i: number, t: number) {
  const r = crownRadius(trees.heights[i], i) * cam.scale;
  const fx = cam.sx(trees.x[i] / 10);
  const fy = cam.sy(trees.y[i] / 10);
  const pulse = 1 + 0.08 * Math.sin(t * 5);
  ctx.beginPath();
  ctx.ellipse(fx, fy, r * 0.9 * pulse, r * 0.45 * pulse, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(132, 189, 0, 0.28)";
  ctx.fill();
  ctx.lineWidth = Math.max(2, cam.scale * 0.25);
  ctx.strokeStyle = "#84bd00";
  ctx.stroke();
}

// ---- atlas -----------------------------------------------------------------

function spriteFor(shape: Shape, arch: number, mon: boolean, variant: number, diameter: number): Sprite {
  const bucket = Math.min(MAX_BUCKET, Math.max(MIN_BUCKET, Math.round(2 ** (Math.ceil(Math.log2(diameter) * 2) / 2))));
  const key = `${shape}|${arch}|${mon ? 1 : 0}|${variant}|${bucket}`;
  let sprite = atlas.get(key);
  if (!sprite) {
    sprite = { canvas: renderCrown(shape, ARCHETYPES[arch].color, mon, variant, bucket), bucket };
    atlas.set(key, sprite);
  }
  return sprite;
}

type Lobe = [number, number, number]; // dx, dy (down = +), radius — in crown radii

const LOBES: Record<"round" | "oval" | "weeping", Lobe[][]> = {
  round: [
    [[0, 0.08, 0.72], [-0.45, 0.15, 0.5], [0.45, 0.12, 0.5], [-0.25, -0.38, 0.5], [0.3, -0.35, 0.48], [0, 0.45, 0.48]],
    [[0, 0.05, 0.74], [-0.5, 0.05, 0.46], [0.42, 0.22, 0.5], [-0.3, -0.42, 0.44], [0.22, -0.45, 0.5], [-0.15, 0.45, 0.46]],
  ],
  oval: [
    [[0, 0.1, 0.62], [-0.38, 0.3, 0.44], [0.38, 0.28, 0.44], [-0.3, -0.25, 0.46], [0.3, -0.3, 0.44], [0, -0.62, 0.42], [0, 0.6, 0.42]],
    [[0, 0, 0.64], [-0.4, 0.4, 0.42], [0.36, 0.2, 0.46], [-0.32, -0.38, 0.42], [0.28, -0.42, 0.44], [0.05, -0.68, 0.38], [-0.05, 0.62, 0.4]],
  ],
  weeping: [
    [[0, -0.15, 0.7], [-0.5, -0.05, 0.45], [0.5, -0.05, 0.45], [-0.25, -0.5, 0.42], [0.28, -0.48, 0.42]],
    [[0, -0.12, 0.72], [-0.52, 0, 0.42], [0.46, -0.08, 0.48], [-0.2, -0.52, 0.44], [0.3, -0.45, 0.4]],
  ],
};

function renderCrown(shape: Shape, rgb: [number, number, number], mon: boolean, variant: number, bucket: number) {
  const R = bucket / 2;
  const [ax, ay] = ASPECT[shape];
  const W = Math.ceil(2 * R * ax * PAD) + 4;
  const H = Math.ceil(2 * R * ay * PAD) + 4;
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  ctx.translate(W / 2, H / 2);

  const base = rgbStr(rgb);
  const dark = rgbStr(mix(rgb, [0, 0, 0], 0.22));
  const light = rgbStr(mix(rgb, [255, 255, 240], 0.22));
  const shine = rgbStr(mix(rgb, [255, 255, 235], 0.45));
  const outline = mon ? GOLD : rgbStr(mix(rgb, [20, 25, 10], 0.6));
  const ow = mon ? Math.max(2, R * 0.13) : Math.max(1, R * 0.06);

  if (shape === "conifer") {
    conifer(ctx, R, ax, ay, { base, dark, light, outline, ow });
  } else {
    const lobes = LOBES[shape][variant % LOBES[shape].length].map(
      ([x, y, r]): Lobe => [x * R * ax, y * R * ay, r * R * Math.min(ax, ay) * (shape === "oval" ? 1.15 : 1)],
    );
    blobs(ctx, lobes, ow, outline); // outline
    blobs(ctx, lobes, 0, dark); // shaded body
    blobs(ctx, lobes.map(([x, y, r]) => [x - R * 0.08, y - R * 0.1, r * 0.82]), 0, base);
    blobs(ctx, lobes.slice(1, 4).map(([x, y, r]) => [x - R * 0.12, y - R * 0.16, r * 0.45]), 0, light);
    if (shape === "weeping") weepingStrands(ctx, R, ax, { dark, base, light });
    // highlight dab, top-left
    blobs(ctx, [[-R * 0.32 * ax, -R * 0.38 * ay, R * 0.14]], 0, shine);
  }
  if (mon) sparkle(ctx, R * 0.42 * ax, -R * 0.55 * ay, Math.max(3, R * 0.2));
  return canvas;
}

function blobs(ctx: CanvasRenderingContext2D, lobes: Lobe[], grow: number, color: string) {
  ctx.beginPath();
  for (const [x, y, r] of lobes) {
    ctx.moveTo(x + r + grow, y);
    ctx.arc(x, y, r + grow, 0, Math.PI * 2);
  }
  ctx.fillStyle = color;
  ctx.fill();
}

function weepingStrands(ctx: CanvasRenderingContext2D, R: number, ax: number, c: { dark: string; base: string; light: string }) {
  ctx.lineCap = "round";
  const n = 7;
  for (let k = 0; k < n; k++) {
    const x = (-0.85 + (1.7 * k) / (n - 1)) * R * ax;
    const len = R * (0.75 + 0.25 * Math.cos(k * 1.7));
    ctx.strokeStyle = k % 2 ? c.base : c.dark;
    ctx.lineWidth = Math.max(1.5, R * 0.2);
    ctx.beginPath();
    ctx.moveTo(x, R * 0.05);
    ctx.quadraticCurveTo(x * 1.08, R * 0.05 + len * 0.6, x * 1.12, R * 0.05 + len);
    ctx.stroke();
  }
}

function conifer(
  ctx: CanvasRenderingContext2D,
  R: number,
  ax: number,
  ay: number,
  c: { base: string; dark: string; light: string; outline: string; ow: number },
) {
  const w = R * ax;
  const h = R * ay;
  // three stacked tiers, bottom first
  const tiers: [number, number, number][] = [
    [h * 0.95, h * 0.05, w], // bottom y, top y, half width
    [h * 0.45, -h * 0.5, w * 0.78],
    [-h * 0.05, -h * 0.98, w * 0.55],
  ];
  for (const [by, ty, hw] of tiers) {
    tri(ctx, by + c.ow, ty - c.ow * 1.4, hw + c.ow, c.outline);
    tri(ctx, by, ty, hw, c.dark);
    // lit left half
    ctx.beginPath();
    ctx.moveTo(0, ty);
    ctx.lineTo(-hw, by);
    ctx.lineTo(-hw * 0.05, by);
    ctx.closePath();
    ctx.fillStyle = c.base;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-hw * 0.15, ty + (by - ty) * 0.25);
    ctx.lineTo(-hw * 0.55, by - (by - ty) * 0.15);
    ctx.lineTo(-hw * 0.3, by - (by - ty) * 0.15);
    ctx.closePath();
    ctx.fillStyle = c.light;
    ctx.fill();
  }
}

function tri(ctx: CanvasRenderingContext2D, by: number, ty: number, hw: number, color: string) {
  ctx.beginPath();
  ctx.moveTo(0, ty);
  ctx.lineTo(hw, by);
  ctx.lineTo(-hw, by);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4 - Math.PI / 2;
    const rr = k % 2 ? r * 0.35 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = "#fff6d0";
  ctx.fill();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = Math.max(1, r * 0.15);
  ctx.stroke();
}

function makeCanvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [0, 1, 2].map((k) => Math.round(a[k] * (1 - t) + b[k] * t)) as [number, number, number];
}

function rgbStr(c: [number, number, number]): string {
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}
