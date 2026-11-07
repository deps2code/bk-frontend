// Player collision. Each chunk near the player gets a 0.5 m blocked/free
// mask, rasterized with a canvas: water (polygons + waterway lines) is
// blocked, roads/paths/bridges and paved areas carve walkable ground back out
// of it (so canals are crossed at the real bridges), then buildings are
// blocked on top. Tree trunks are separate circles. Movement is resolved per
// axis in small sub-steps, so the player slides along walls instead of
// stopping dead; a player already inside an obstacle (spawned or teleported
// there) can move freely until clear.

import type { TreeData } from "../lib/loadTrees";
import type { Camera } from "./camera";
import { CHUNK_SIZE, chunkOf, type World } from "./world";
import type { Chunk } from "./worldFormat";

const CELL = 0.5; // m
const N = CHUNK_SIZE / CELL; // cells per chunk side
const MAX_MASKS = 16;
const SUBSTEP = 0.2; // m
const WATER_GROUND = 6;
const PAVED_GROUND = 7;
const WATER_LINE = 7;
const RAIL_LINE = 6;

interface Mask {
  cells: Uint8Array; // row 0 = north edge, 1 = blocked
  /** False if a neighbour chunk (whose buildings may reach in) wasn't loaded. */
  complete: boolean;
  /** Tick it was rasterized; incomplete masks are retried every REBUILD ticks. */
  built: number;
  used: number;
  /** Debug overlay image (G key), built on demand. */
  debug?: OffscreenCanvas | HTMLCanvasElement;
}

const REBUILD = 30;

export class Collision {
  private masks = new Map<string, Mask>();
  private tick = 0;
  private canvas: OffscreenCanvas | HTMLCanvasElement | null = null;

  constructor(private world: World) {}

  /** Is the world point (x, y) blocked? Unknown ground counts as free. */
  blocked(x: number, y: number): boolean {
    const cx = chunkOf(x), cy = chunkOf(y);
    const m = this.mask(cx, cy);
    if (!m) return false;
    const col = Math.floor((x - cx * CHUNK_SIZE) / CELL);
    const row = Math.floor(((cy + 1) * CHUNK_SIZE - y) / CELL);
    return m.cells[Math.min(N - 1, Math.max(0, row)) * N + Math.min(N - 1, Math.max(0, col))] === 1;
  }

  /** Circle of radius r at (x, y) touches a blocked cell (centre + 8 rim points). */
  circleBlocked(x: number, y: number, r: number): boolean {
    if (this.blocked(x, y)) return true;
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      if (this.blocked(x + Math.cos(a) * r, y + Math.sin(a) * r)) return true;
    }
    return false;
  }

  /** Can collision be judged at (x, y) yet (its chunk is loaded)? */
  ready(x: number, y: number): boolean {
    return this.world.chunkAt(chunkOf(x), chunkOf(y)) !== null;
  }

  /** Nearest free spot for a circle, spiralling out up to `maxDist` m. */
  findFree(x: number, y: number, r: number, maxDist = 40): { x: number; y: number } | null {
    if (!this.circleBlocked(x, y, r)) return { x, y };
    for (let d = 1; d <= maxDist; d++) {
      const steps = Math.max(8, Math.round(d * 2));
      for (let k = 0; k < steps; k++) {
        const a = (k / steps) * Math.PI * 2;
        const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
        if (!this.circleBlocked(px, py, r)) return { x: px, y: py };
      }
    }
    return null;
  }

  /**
   * Move a circle from (x, y) by (dx, dy). Returns the resolved position and
   * which axes were stopped, so the caller can zero that velocity component.
   */
  move(x: number, y: number, dx: number, dy: number, r: number): { x: number; y: number; hitX: boolean; hitY: boolean } {
    this.tick++;
    let hitX = false, hitY = false;
    const stuck = this.circleBlocked(x, y, r);
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / SUBSTEP));
    const sx = dx / steps, sy = dy / steps;
    for (let s = 0; s < steps; s++) {
      if (sx !== 0 && !hitX) {
        if (stuck || !this.circleBlocked(x + sx, y, r)) x += sx;
        else hitX = true;
      }
      if (sy !== 0 && !hitY) {
        if (stuck || !this.circleBlocked(x, y + sy, r)) y += sy;
        else hitY = true;
      }
    }
    [x, y] = this.pushOutOfTrunks(x, y, r);
    return { x, y, hitX, hitY };
  }

  /** Tree trunks are small circles; push the player out along the normal. */
  private pushOutOfTrunks(x: number, y: number, r: number): [number, number] {
    const t = this.world.trees;
    if (!t) return [x, y];
    for (let cy = chunkOf(y - 2); cy <= chunkOf(y + 2); cy++) {
      for (let cx = chunkOf(x - 2); cx <= chunkOf(x + 2); cx++) {
        const range = t.chunks.get(`${cx},${cy}`);
        if (!range) continue;
        for (let i = range[0], end = range[0] + range[1]; i < end; i++) {
          const tx = t.x[i] / 10, ty = t.y[i] / 10;
          const min = trunkRadius(t, i) + r;
          const ddx = x - tx, ddy = y - ty;
          if (Math.abs(ddx) >= min || Math.abs(ddy) >= min) continue;
          const d = Math.hypot(ddx, ddy);
          if (d >= min) continue;
          if (this.blocked(tx, ty)) continue; // a tree "inside" a building: data noise, ignore
          const nx = d > 1e-6 ? ddx / d : 1, ny = d > 1e-6 ? ddy / d : 0;
          const px = tx + nx * min, py = ty + ny * min;
          if (!this.circleBlocked(px, py, r)) {
            x = px;
            y = py;
          }
        }
      }
    }
    return [x, y];
  }

  private mask(cx: number, cy: number): Mask | null {
    const key = `${cx},${cy}`;
    let m = this.masks.get(key);
    if (m && (m.complete || this.tick - m.built < REBUILD)) {
      m.used = this.tick;
      return m;
    }
    const chunk = this.world.chunkAt(cx, cy);
    if (!chunk) return m ?? null;
    m = this.rasterize(chunk, m);
    this.masks.set(key, m);
    this.evict();
    return m;
  }

  private rasterize(c: Chunk, prev: Mask | undefined): Mask {
    this.canvas ??= makeCanvas(N);
    const ctx = this.canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, N, N);
    const k = 1 / CELL;
    const place = (o: Chunk) => ctx.setTransform(k, 0, 0, -k, (o.ox - c.ox) * k, (c.oy + CHUNK_SIZE - o.oy) * k);
    place(c);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // water blocks…
    ctx.fillStyle = ctx.strokeStyle = "#fff";
    const water = c.ground[WATER_GROUND];
    if (water) ctx.fill(water, "evenodd");
    for (const g of c.lines) {
      if (g.kind !== WATER_LINE) continue;
      ctx.lineWidth = g.width;
      ctx.stroke(g.path);
    }
    // …except where a road, path, bridge or paved area crosses it
    ctx.fillStyle = ctx.strokeStyle = "#000";
    const paved = c.ground[PAVED_GROUND];
    if (paved) ctx.fill(paved, "evenodd");
    for (const g of c.lines) {
      if (g.kind >= RAIL_LINE) continue;
      ctx.lineWidth = g.width;
      ctx.stroke(g.path);
    }

    // buildings, including neighbours' that reach into this chunk
    let complete = true;
    ctx.fillStyle = "#fff";
    for (let ny = c.cy - 1; ny <= c.cy + 1; ny++) {
      for (let nx = c.cx - 1; nx <= c.cx + 1; nx++) {
        const o = nx === c.cx && ny === c.cy ? c : this.world.chunkAt(nx, ny);
        if (!o) {
          if (this.world.isPending(nx, ny)) complete = false;
          continue;
        }
        place(o);
        const p = new Path2D();
        for (const b of o.buildings) {
          if (b.maxX + o.ox < c.ox - 1 || b.minX + o.ox > c.ox + CHUNK_SIZE + 1) continue;
          if (b.maxY + o.oy < c.oy - 1 || b.minY + o.oy > c.oy + CHUNK_SIZE + 1) continue;
          for (const r of b.rings) {
            p.moveTo(r[0], r[1]);
            for (let i = 2; i < r.length; i += 2) p.lineTo(r[i], r[i + 1]);
            p.closePath();
          }
        }
        ctx.fill(p, "evenodd");
      }
    }

    const px = ctx.getImageData(0, 0, N, N).data;
    const cells = prev?.cells ?? new Uint8Array(N * N);
    for (let i = 0; i < N * N; i++) cells[i] = px[i * 4] > 127 ? 1 : 0;
    return { cells, complete, built: this.tick, used: this.tick }; // debug image rebuilt lazily
  }

  /** Debug overlay: blocked cells of the masks built so far, tinted red. */
  drawDebug(ctx: CanvasRenderingContext2D, cam: Camera) {
    for (const [key, m] of this.masks) {
      if (!m.debug) {
        m.debug = makeCanvas(N);
        const dctx = m.debug.getContext("2d") as CanvasRenderingContext2D;
        const img = dctx.createImageData(N, N);
        for (let i = 0; i < N * N; i++) {
          if (!m.cells[i]) continue;
          img.data[i * 4] = 220;
          img.data[i * 4 + 1] = 40;
          img.data[i * 4 + 2] = 40;
          img.data[i * 4 + 3] = 110;
        }
        dctx.putImageData(img, 0, 0);
      }
      const [cx, cy] = key.split(",").map(Number);
      const x0 = cam.sx(cx * CHUNK_SIZE), y0 = cam.sy((cy + 1) * CHUNK_SIZE);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(m.debug, x0, y0, CHUNK_SIZE * cam.scale, CHUNK_SIZE * cam.scale);
      ctx.imageSmoothingEnabled = true;
    }
  }

  private evict() {
    if (this.masks.size <= MAX_MASKS) return;
    const oldest = [...this.masks.entries()].sort((a, b) => a[1].used - b[1].used)[0];
    this.masks.delete(oldest[0]);
  }
}

/** Trunk radius in meters (collision only; the sprite trunk is drawn wider). */
function trunkRadius(t: TreeData, i: number): number {
  return 0.2 + t.heights[i] * 0.012;
}

function makeCanvas(size: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(size, size);
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return c;
}
