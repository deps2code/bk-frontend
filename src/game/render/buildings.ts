// Oblique ("3/4 view") buildings, the screenshot style: the roof is the
// footprint lifted up the screen by the building's (compressed) height and
// the south-facing walls show as facades with windows. Everything is built
// once per building as Path2Ds in chunk-local meters — lifting by `lift`
// meters north equals moving up the screen — and drawn with the chunk
// transform. Ground shadows are baked into the ground tiles (shadows.ts).

import { setChunkTransform, type Camera } from "../camera";
import type { Building, Chunk } from "../worldFormat";
import { HEIGHT_FACTOR, visualHeight } from "./geometry";

const WINDOW_MIN_SCALE = 5; // px/m before windows are drawn
const FLOOR_M = 3.2;
const OUTLINE = "rgba(70, 52, 36, 0.55)";
const WINDOW = "#5f7b98";
const WINDOW_LIT = "#f3d27c";

const BRICK = ["#b86b4b", "#a65a3e", "#c27a57", "#9e5a42"];
const SAND = ["#dcc9a3", "#d2bd94"];
const PLASTER = ["#e6dccb", "#ece5d8"];
const GREY = ["#c8c4bc", "#b9b5ad"];
const WALLS: string[][] = [
  [...BRICK, ...SAND, ...PLASTER], // generic
  [...BRICK, ...BRICK, ...SAND], // house
  [...PLASTER, ...GREY, ...BRICK], // apartments
  [...GREY, ...PLASTER, "#b86b4b"], // commercial
  ["#a8836a", "#b39274"], // religious
  ["#a9aba6", "#9aa3a8", "#b5b0a4"], // industrial
  [...BRICK, ...SAND], // public
  ["#9c7a5a", "#a9a49a"], // small
];
const ROOFS: string[][] = [
  ["#8a8580", "#b9573f", "#d6d1c7"], // generic
  ["#b9573f", "#a34e3a", "#c0634a", "#5f636b", "#6f6a66"], // house — Dutch tile and slate
  ["#d8d3ca", "#cfcac0", "#c4c9cc"], // apartments — flat
  ["#d8d3ca", "#cfcac0", "#c4c9cc"], // commercial
  ["#56606b", "#4f5a63"], // religious — slate
  ["#bfc3c2", "#a9b0b3"], // industrial
  ["#d8d3ca", "#b9573f"], // public
  ["#8d8a84", "#a46a4c"], // small
];

interface Gfx {
  /** Northward roof offset, chunk-local meters. */
  lift: number;
  /** Wall quads by shade: lit (west-facing), mid, dark (east-facing). */
  walls: (Path2D | null)[];
  wallColors: string[];
  wallLines: Path2D | null;
  windows: Path2D | null;
  windowsLit: Path2D | null;
  roof: Path2D;
  roofColor: string;
}

export function roofLift(b: Building): number {
  return visualHeight(b.height) * HEIGHT_FACTOR;
}

export function drawBuilding(ctx: CanvasRenderingContext2D, cam: Camera, dpr: number, c: Chunk, b: Building, alpha: number) {
  const g = gfxOf(b);
  setChunkTransform(ctx, cam, dpr, c.ox, c.oy);
  ctx.globalAlpha = alpha;
  for (let i = 0; i < 3; i++) {
    const path = g.walls[i];
    if (!path) continue;
    ctx.fillStyle = g.wallColors[i];
    ctx.fill(path);
  }
  if (cam.scale >= WINDOW_MIN_SCALE) {
    if (g.windows) {
      ctx.fillStyle = WINDOW;
      ctx.fill(g.windows);
    }
    if (g.windowsLit) {
      ctx.fillStyle = WINDOW_LIT;
      ctx.fill(g.windowsLit);
    }
  }
  ctx.lineWidth = 1 / cam.scale; // 1 CSS px
  ctx.lineJoin = "round";
  ctx.strokeStyle = OUTLINE;
  if (g.wallLines) ctx.stroke(g.wallLines);
  ctx.fillStyle = g.roofColor;
  ctx.fill(g.roof, "evenodd");
  ctx.stroke(g.roof);
  ctx.globalAlpha = 1;
}

/**
 * Does building `b` hide the player standing at chunk-local (px, py)? The
 * silhouette is the footprint swept `lift` m north; the player's sprite
 * covers ~`playerH` m north of their feet. Overlap ⇔ the vertical segment
 * x = px, y ∈ [py − lift, py + playerH] meets the footprint.
 */
export function hidesPlayer(b: Building, px: number, py: number, playerH: number): boolean {
  const lift = roofLift(b);
  if (px < b.minX || px > b.maxX || py + playerH < b.minY || py - lift > b.maxY) return false;
  for (let y = py - lift; y <= py + playerH; y += 0.75) {
    if (insideFootprint(b, px, y)) return true;
  }
  return false;
}

// ---- geometry --------------------------------------------------------------

function gfxOf(b: Building): Gfx {
  if (b.gfx) return b.gfx as Gfx;
  const v = visualHeight(b.height);
  const lift = v * HEIGHT_FACTOR;
  const walls: (Path2D | null)[] = [null, null, null];
  let wallLines: Path2D | null = null;
  let windows: Path2D | null = null;
  let windowsLit: Path2D | null = null;
  const withWindows = b.kind !== 7 && v >= 4;
  let n = 0;

  for (const r of b.rings) {
    for (let i = 0; i < r.length; i += 2) {
      const j = (i + 2) % r.length;
      const ax = r[i], ay = r[i + 1];
      const dx = r[j] - ax, dy = r[j + 1] - ay;
      // solid is left of the edge, so the wall faces right: (dy, -dx).
      // Visible from the south ⇔ that normal points south ⇔ dx > 0.
      if (dx <= 0.05) continue;
      const len = Math.hypot(dx, dy);
      const nx = dy / len;
      const shade = nx < -0.35 ? 0 : nx > 0.35 ? 2 : 1;
      const quad = (walls[shade] ??= new Path2D());
      quadTo(quad, ax, ay, dx, dy, 0, 1, 0, lift);
      quadTo((wallLines ??= new Path2D()), ax, ay, dx, dy, 0, 1, 0, lift);

      if (!withWindows || len < 2) continue;
      const cols = Math.max(1, Math.floor(len / 2.8));
      const w = Math.min(0.8 / cols, 1.1 / len); // window width as an edge fraction
      for (let f = 0; ; f++) {
        const z0 = 1 + f * FLOOR_M;
        const z1 = z0 + 1.5;
        if (z1 > v - 0.6) break;
        for (let k = 0; k < cols; k++) {
          const tc = (k + 0.5) / cols;
          const lit = hash(b.seed, n++) < 0.12;
          const path = lit ? (windowsLit ??= new Path2D()) : (windows ??= new Path2D());
          quadTo(path, ax, ay, dx, dy, tc - w / 2, tc + w / 2, z0 * HEIGHT_FACTOR, z1 * HEIGHT_FACTOR);
        }
      }
    }
  }

  const roof = new Path2D();
  for (const r of b.rings) ring(roof, r, 0, lift);

  const wallBase = pick(WALLS[b.kind] ?? WALLS[0], b.seed);
  const gfx: Gfx = {
    lift,
    walls,
    wallColors: [mix(wallBase, "#ffffff", 0.1), wallBase, mix(wallBase, "#000000", 0.16)],
    wallLines,
    windows,
    windowsLit,
    roof,
    roofColor: pick(ROOFS[b.kind] ?? ROOFS[0], (b.seed * 7.31) % 1),
  };
  b.gfx = gfx;
  return gfx;
}

/** Quad on a wall: edge parameter t ∈ [t0, t1], height offset z ∈ [z0, z1] (local m). */
function quadTo(p: Path2D, ax: number, ay: number, dx: number, dy: number, t0: number, t1: number, z0: number, z1: number) {
  p.moveTo(ax + dx * t0, ay + dy * t0 + z0);
  p.lineTo(ax + dx * t1, ay + dy * t1 + z0);
  p.lineTo(ax + dx * t1, ay + dy * t1 + z1);
  p.lineTo(ax + dx * t0, ay + dy * t0 + z1);
  p.closePath();
}

function ring(p: Path2D, r: Float32Array, ox: number, oy: number) {
  p.moveTo(r[0] + ox, r[1] + oy);
  for (let i = 2; i < r.length; i += 2) p.lineTo(r[i] + ox, r[i + 1] + oy);
  p.closePath();
}

/** Even-odd point-in-footprint over all rings (holes excluded). */
function insideFootprint(b: Building, x: number, y: number): boolean {
  let inside = false;
  for (const r of b.rings) {
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
      const yi = r[i + 1], yj = r[j + 1];
      if (yi > y !== yj > y && x < ((r[j] - r[i]) * (y - yi)) / (yj - yi) + r[i]) inside = !inside;
    }
  }
  return inside;
}

function pick(list: string[], r: number): string {
  return list[Math.min(list.length - 1, Math.floor(r * list.length))];
}

function hash(seed: number, n: number): number {
  let h = Math.imul((seed * 4294967296) ^ Math.imul(n + 1, 0x9e3779b1), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}
