// Minimap and full map. The region's overview SVG (built by build-world.mjs)
// is rasterized once into a bitmap (≤2048 px on its long side); each draw
// crops it around the player (minimap) or fits the whole region (full map),
// then adds monumental trees as gold dots and the player as an arrow.

import type { TreeData } from "../lib/loadTrees";
import { BASE_GROUND } from "./render/palette";
import type { Bounds, World } from "./world";

const MAX_PX = 2048;
const GOLD = "#e6b422";

export interface MapPlayer {
  x: number;
  y: number;
  /** Heading in radians, math convention (0 = east, π/2 = north). */
  heading: number;
}

interface View {
  /** World x of the canvas' left edge and y of its top edge, m per CSS px. */
  x0: number;
  y1: number;
  mpp: number;
}

export class Minimap {
  private base: OffscreenCanvas | HTMLCanvasElement | null = null;
  private bounds: Bounds | null = null;
  private baseMpp = 1;
  private monumental: Float32Array | null = null;
  private loading = false;
  /** Last full-map view, for turning clicks into world positions. */
  private fullView: View | null = null;

  /** Kick off loading once the world index is known. Cheap to call often. */
  ensure(world: World) {
    if (!this.loading) {
      const m = world.minimap;
      if (!m) return;
      this.loading = true;
      const img = new Image();
      img.src = m.url;
      img
        .decode()
        .then(() => {
          const w = m.maxX - m.minX, h = m.maxY - m.minY;
          this.baseMpp = Math.max(1, Math.max(w, h) / MAX_PX);
          const c = makeCanvas(Math.round(w / this.baseMpp), Math.round(h / this.baseMpp));
          (c.getContext("2d") as CanvasRenderingContext2D).drawImage(img, 0, 0, c.width, c.height);
          this.base = c;
          this.bounds = m;
        })
        .catch((e) => console.error("minimap:", e));
    }
    if (!this.monumental && this.bounds && world.trees) this.monumental = monumentalIn(world.trees, this.bounds);
  }

  /** Square-ish crop of `extent` meters across, centred on the player. */
  drawMini(canvas: HTMLCanvasElement, p: MapPlayer, extent: number) {
    const ctx = fit(canvas);
    if (!ctx) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const mpp = extent / w;
    this.paint(ctx, w, h, { x0: p.x - (w / 2) * mpp, y1: p.y + (h / 2) * mpp, mpp }, p, 1.5);
  }

  /** The whole region, fitted; remembers the view for `fullToWorld`. */
  drawFull(canvas: HTMLCanvasElement, p: MapPlayer) {
    const ctx = fit(canvas);
    const b = this.bounds;
    if (!ctx || !b) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const mpp = Math.max((b.maxX - b.minX) / w, (b.maxY - b.minY) / h) * 1.04;
    const view = {
      x0: (b.minX + b.maxX) / 2 - (w / 2) * mpp,
      y1: (b.minY + b.maxY) / 2 + (h / 2) * mpp,
      mpp,
    };
    this.fullView = view;
    this.paint(ctx, w, h, view, p, 1.3);
  }

  /** World position of a point on the full map (CSS px), or null. */
  fullToWorld(px: number, py: number): { x: number; y: number } | null {
    const v = this.fullView;
    return v ? { x: v.x0 + px * v.mpp, y: v.y1 - py * v.mpp } : null;
  }

  private paint(ctx: CanvasRenderingContext2D, w: number, h: number, v: View, p: MapPlayer, dot: number) {
    ctx.fillStyle = BASE_GROUND;
    ctx.fillRect(0, 0, w, h);
    const b = this.bounds;
    if (this.base && b) {
      // intersect the view with the map bbox; drawImage source rects must stay inside
      const x0 = Math.max(v.x0, b.minX), x1 = Math.min(v.x0 + w * v.mpp, b.maxX);
      const y1 = Math.min(v.y1, b.maxY), y0 = Math.max(v.y1 - h * v.mpp, b.minY);
      if (x1 > x0 && y1 > y0) {
        ctx.drawImage(
          this.base,
          (x0 - b.minX) / this.baseMpp,
          (b.maxY - y1) / this.baseMpp,
          (x1 - x0) / this.baseMpp,
          (y1 - y0) / this.baseMpp,
          (x0 - v.x0) / v.mpp,
          (v.y1 - y1) / v.mpp,
          (x1 - x0) / v.mpp,
          (y1 - y0) / v.mpp,
        );
      }
    }

    const m = this.monumental;
    if (m) {
      ctx.fillStyle = GOLD;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      const xMax = v.x0 + w * v.mpp, yMin = v.y1 - h * v.mpp;
      for (let i = 0; i < m.length; i += 2) {
        if (m[i] < v.x0 || m[i] > xMax || m[i + 1] < yMin || m[i + 1] > v.y1) continue;
        const sx = (m[i] - v.x0) / v.mpp, sy = (v.y1 - m[i + 1]) / v.mpp;
        ctx.moveTo(sx + dot, sy);
        ctx.arc(sx, sy, dot, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // player arrow
    const sx = (p.x - v.x0) / v.mpp, sy = (v.y1 - p.y) / v.mpp;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(-p.heading + Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(7, 7);
    ctx.lineTo(0, 3);
    ctx.lineTo(-7, 7);
    ctx.closePath();
    ctx.fillStyle = "#84bd00";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#3e2a1c";
    ctx.stroke();
    ctx.restore();
  }
}

function monumentalIn(t: TreeData, b: Bounds): Float32Array {
  const out: number[] = [];
  for (let i = 0; i < t.count; i++) {
    if (!(t.flags[i] & 1)) continue;
    const x = t.x[i] / 10, y = t.y[i] / 10;
    if (x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY) out.push(x, y);
  }
  return Float32Array.from(out);
}

/** Size the canvas backing store to its CSS box × DPR; returns a CSS-px context. */
function fit(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
  if (!w || !h) return null;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext("2d");
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function makeCanvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}
