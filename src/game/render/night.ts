// Night mode as a light map. The frame is drawn as by day; meanwhile an
// offscreen canvas collects the light: a dark blue ambient, plus additive
// glows (street lamps, headlights, the player's surroundings). Buildings and
// tree crowns are painted into it in scene order with the ambient colour, so
// a building in front hides the lights behind it, and lit windows are
// painted bright. The light map is then multiplied over the frame. `level`
// fades between day (0) and night (1).

import { setChunkTransform, type Camera } from "../camera";
import type { Building, Chunk } from "../worldFormat";
import { buildingSilhouette } from "./buildings";

const AMBIENT: [number, number, number] = [62, 74, 132];
const WINDOW_GLOW = "#ffe9b8";
const FADE = 2.5; // 1/s
const TREE_SHADE = 0.7;

export type GlowKind = "lamp" | "white" | "red";
const GLOW_RGB: Record<GlowKind, string> = { lamp: "255, 190, 105", white: "255, 246, 225", red: "255, 60, 45" };

export class Night {
  level = 0;
  private canvas = document.createElement("canvas");
  readonly ctx = this.canvas.getContext("2d")!;
  private glows = new Map<GlowKind, HTMLCanvasElement>();
  private ambient = "rgb(255, 255, 255)";
  private dpr = 1;

  update(on: boolean, dt: number) {
    const target = on ? 1 : 0;
    this.level += (target - this.level) * (1 - Math.exp(-FADE * dt));
    if (Math.abs(this.level - target) < 0.003) this.level = target;
  }

  get active(): boolean {
    return this.level > 0;
  }

  /** Start a frame's light map at the main canvas' device size. */
  begin(width: number, height: number, dpr: number) {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.dpr = dpr;
    const f = this.level;
    const ch = (i: number) => Math.round(255 + (AMBIENT[i] - 255) * f);
    this.ambient = `rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`;
    const g = this.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
    g.fillStyle = this.ambient;
    g.fillRect(0, 0, width, height);
  }

  /** Additive soft glow centred on a screen point (CSS px), radius in CSS px. */
  glow(x: number, y: number, r: number, kind: GlowKind, strength: number) {
    if (r < 0.5) return;
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = Math.min(1, strength * this.level);
    g.drawImage(this.sprite(kind), x - r, y - r, r * 2, r * 2);
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
  }

  /** Headlight beam: a cone from (x, y) along `angle` (screen radians), CSS px. */
  beam(x: number, y: number, angle: number, length: number, spread: number, strength: number) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = Math.min(1, strength * this.level);
    const grad = g.createRadialGradient(x, y, 0, x, y, length);
    grad.addColorStop(0, "rgba(255, 244, 214, 0.9)");
    grad.addColorStop(1, "rgba(255, 244, 214, 0)");
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(x, y);
    g.arc(x, y, length, angle - spread, angle + spread);
    g.closePath();
    g.fill();
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
  }

  /** A building in front hides the light behind it; its lit windows glow. */
  building(cam: Camera, c: Chunk, b: Building, alpha: number, windows: boolean) {
    const g = this.ctx;
    const sil = buildingSilhouette(b);
    setChunkTransform(g, cam, this.dpr, c.ox, c.oy);
    g.globalAlpha = alpha;
    g.fillStyle = this.ambient;
    for (const p of sil.walls) if (p) g.fill(p);
    g.fill(sil.roof, "evenodd");
    if (windows && sil.windowsLit) {
      g.fillStyle = WINDOW_GLOW;
      g.fill(sil.windowsLit);
    }
    g.globalAlpha = 1;
  }

  /** A tree crown (screen circle, CSS px) mostly hides the light behind it. */
  crown(x: number, y: number, r: number) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.globalAlpha = TREE_SHADE;
    g.fillStyle = this.ambient;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
  }

  /** Multiply the light map over the finished frame. */
  apply(main: CanvasRenderingContext2D) {
    main.save();
    main.setTransform(1, 0, 0, 1, 0, 0);
    main.globalCompositeOperation = "multiply";
    main.drawImage(this.canvas, 0, 0);
    main.restore();
  }

  private sprite(kind: GlowKind): HTMLCanvasElement {
    let c = this.glows.get(kind);
    if (c) return c;
    c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    const rgb = GLOW_RGB[kind];
    grad.addColorStop(0, `rgba(${rgb}, 1)`);
    grad.addColorStop(0.35, `rgba(${rgb}, 0.55)`);
    grad.addColorStop(1, `rgba(${rgb}, 0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    this.glows.set(kind, c);
    return c;
  }
}
