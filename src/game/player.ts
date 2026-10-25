// The player: position in RD meters, smoothed velocity, 4-way facing and a
// walk-cycle phase for the sprite.

import type { Input } from "./input";
import { WORLD_BOUNDS } from "./world";

/** m/s — well above real walking pace; the city is ~20 km across. */
export const WALK_SPEED = 8;
export const RUN_SPEED = 18;
const ACCEL = 14; // 1/s, exponential approach to target velocity

export type Facing = "up" | "down" | "left" | "right";

export class Player {
  x: number;
  y: number;
  /** Position at the previous fixed step, for render interpolation. */
  prevX: number;
  prevY: number;
  vx = 0;
  vy = 0;
  facing: Facing = "down";
  /** Walk-cycle phase in radians; advances with distance travelled. */
  walkPhase = 0;

  constructor(x: number, y: number) {
    this.x = this.prevX = x;
    this.y = this.prevY = y;
  }

  get moving(): boolean {
    return Math.hypot(this.vx, this.vy) > 0.3;
  }

  teleport(x: number, y: number) {
    this.x = this.prevX = x;
    this.y = this.prevY = y;
    this.vx = this.vy = 0;
  }

  update(dt: number, input: Input) {
    this.prevX = this.x;
    this.prevY = this.y;

    const dir = input.move();
    const speed = input.fast ? RUN_SPEED : WALK_SPEED;
    const k = 1 - Math.exp(-ACCEL * dt);
    this.vx += (dir.x * speed - this.vx) * k;
    this.vy += (dir.y * speed - this.vy) * k;
    if (dir.x === 0 && dir.y === 0 && !this.moving) this.vx = this.vy = 0;

    this.x = clamp(this.x + this.vx * dt, WORLD_BOUNDS.minX, WORLD_BOUNDS.maxX);
    this.y = clamp(this.y + this.vy * dt, WORLD_BOUNDS.minY, WORLD_BOUNDS.maxY);

    if (dir.x !== 0 || dir.y !== 0) {
      this.facing = Math.abs(dir.x) > Math.abs(dir.y) ? (dir.x > 0 ? "right" : "left") : dir.y > 0 ? "up" : "down";
    }
    // ~1.6 strides per meter at any speed reads as a natural cadence
    this.walkPhase = (this.walkPhase + Math.hypot(this.vx, this.vy) * dt * 1.6) % (Math.PI * 2);
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
