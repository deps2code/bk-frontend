// Ground tiles: the ground layer (see ground.ts) rasterized into 512 px
// tiles per zoom bucket and blitted each frame. Buckets step by √2 in device
// px per meter; a tile is drawn scaled within ±19% of its bucket. Tiles are
// keyed on the world grid, not chunks, so their pixel size stays bounded at
// any zoom.

import type { Camera } from "../camera";
import { chunkOf, type World } from "../world";
import type { Chunk } from "../worldFormat";
import { SHADOW_REACH } from "./shadows";
import { paintGround } from "./ground";
import { BASE_GROUND } from "./palette";

const TILE_PX = 512;
const MAX_TILES = 64;
const RENDERS_PER_FRAME = 6;

interface Tile {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  /** False while a chunk it needs was still loading: re-render later. */
  complete: boolean;
  used: number;
}

export class GroundCache {
  private tiles = new Map<string, Tile>();
  private frame = 0;

  draw(ctx: CanvasRenderingContext2D, cam: Camera, dpr: number, world: World) {
    this.frame++;
    const s = cam.scale * dpr; // device px per meter
    const bucket = 2 ** (Math.round(Math.log2(s) * 2) / 2);
    const tileM = TILE_PX / bucket;
    const b = cam.bounds();
    const X = (wx: number) => Math.round(cam.sx(wx) * dpr);
    const Y = (wy: number) => Math.round(cam.sy(wy) * dpr);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = BASE_GROUND;
    ctx.fillRect(0, 0, cam.viewW * dpr, cam.viewH * dpr);
    ctx.imageSmoothingEnabled = true;

    let renders = 0;
    for (let ty = Math.floor(b.minY / tileM); ty * tileM <= b.maxY; ty++) {
      for (let tx = Math.floor(b.minX / tileM); tx * tileM <= b.maxX; tx++) {
        const key = `${bucket}|${tx}|${ty}`;
        let tile = this.tiles.get(key);
        if ((!tile || !tile.complete) && renders < RENDERS_PER_FRAME) {
          tile = this.render(tile, tx, ty, tileM, bucket, world);
          this.tiles.set(key, tile);
          renders++;
        }
        if (!tile) continue;
        tile.used = this.frame;
        // integer device-pixel edges shared with the neighbours: no seams
        const x0 = X(tx * tileM), x1 = X((tx + 1) * tileM);
        const y0 = Y((ty + 1) * tileM), y1 = Y(ty * tileM);
        ctx.drawImage(tile.canvas, x0, y0, x1 - x0, y1 - y0);
      }
    }
    this.evict();
  }

  private render(prev: Tile | undefined, tx: number, ty: number, tileM: number, bucket: number, world: World): Tile {
    const canvas = prev?.canvas ?? makeCanvas(TILE_PX);
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = BASE_GROUND;
    ctx.fillRect(0, 0, TILE_PX, TILE_PX);

    // chunks touching the tile, widened by the longest shadow
    const x0 = tx * tileM, y0 = ty * tileM;
    const chunks: Chunk[] = [];
    let complete = world.ready && world.trees !== null;
    for (let cy = chunkOf(y0 - SHADOW_REACH); cy <= chunkOf(y0 + tileM + SHADOW_REACH); cy++) {
      for (let cx = chunkOf(x0 - SHADOW_REACH); cx <= chunkOf(x0 + tileM + SHADOW_REACH); cx++) {
        const c = world.chunkAt(cx, cy);
        if (c) chunks.push(c);
        else if (world.isPending(cx, cy)) complete = false;
      }
    }

    paintGround(ctx, chunks, world.trees, (c) =>
      ctx.setTransform(bucket, 0, 0, -bucket, (c.ox - x0) * bucket, (y0 + tileM - c.oy) * bucket),
    );
    return { canvas, complete, used: this.frame };
  }

  private evict() {
    if (this.tiles.size <= MAX_TILES) return;
    const byAge = [...this.tiles.entries()].sort((a, b) => a[1].used - b[1].used);
    for (const [key, t] of byAge) {
      if (this.tiles.size <= MAX_TILES) break;
      if (t.used < this.frame) this.tiles.delete(key);
    }
  }
}

function makeCanvas(size: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(size, size);
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return c;
}

