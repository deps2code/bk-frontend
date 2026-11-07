// Top-down camera that follows the player. World y grows north, screen y
// grows down. `scale` is CSS px per meter; the canvas transform handles DPR.

export const MIN_SCALE = 2;
export const MAX_SCALE = 24;
const FOLLOW = 7; // 1/s, exponential follow rate

export class Camera {
  x: number;
  y: number;
  scale = 8;
  viewW = 0;
  viewH = 0;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  resize(w: number, h: number) {
    this.viewW = w;
    this.viewH = h;
  }

  /** Default zoom: roughly 90 m across the shorter screen side. */
  fitDefault() {
    this.scale = clampScale(Math.min(this.viewW, this.viewH) / 90);
  }

  follow(tx: number, ty: number, dt: number) {
    const k = 1 - Math.exp(-FOLLOW * dt);
    this.x += (tx - this.x) * k;
    this.y += (ty - this.y) * k;
  }

  jumpTo(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  zoomBy(factor: number) {
    this.scale = clampScale(this.scale * factor);
  }

  sx(wx: number): number {
    return (wx - this.x) * this.scale + this.viewW / 2;
  }

  sy(wy: number): number {
    return -(wy - this.y) * this.scale + this.viewH / 2;
  }

  /** Visible world rectangle, RD meters. */
  bounds() {
    const hw = this.viewW / 2 / this.scale;
    const hh = this.viewH / 2 / this.scale;
    return { minX: this.x - hw, maxX: this.x + hw, minY: this.y - hh, maxY: this.y + hh };
  }
}

function clampScale(s: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}

/** Canvas transform mapping chunk-local meters (y north) to device pixels. */
export function setChunkTransform(ctx: CanvasRenderingContext2D, cam: Camera, dpr: number, ox: number, oy: number) {
  const s = cam.scale * dpr;
  ctx.setTransform(s, 0, 0, -s, cam.sx(ox) * dpr, cam.sy(oy) * dpr);
}
