// The player: position in RD meters, smoothed velocity, 4-way facing and a
// walk/pedal cycle phase for the sprite. Walking or cycling (`Mode`): the
// bike is faster and has more inertia, and turns follow its velocity.
// Movement is resolved against buildings, water and trunks (collision.ts).

import type { Collision } from "./collision";
import type { Input } from "./input";
import type { Mode } from "./store";
import { WORLD_BOUNDS } from "./world";

/** m/s [normal, Shift] — well above real pace; the city is ~20 km across. */
export const SPEEDS: Record<Mode, [number, number]> = { walk: [10.4, 20.8], bike: [26, 39] };
/** 1/s, exponential approach to the target velocity. */
const ACCEL: Record<Mode, number> = { walk: 14, bike: 4 };
/** Collision radius in meters (true scale; the sprite is drawn larger). */
export const RADIUS: Record<Mode, number> = { walk: 0.45, bike: 0.6 };
/** Cycle phase (radians) per meter travelled: steps vs pedal strokes. */
const CADENCE: Record<Mode, number> = { walk: 1.6, bike: 1.1 };

export type Facing = "up" | "down" | "left" | "right";

export class Player {
  x: number;
  y: number;
  /** Position at the previous fixed step, for render interpolation. */
  prevX: number;
  prevY: number;
  vx = 0;
  vy = 0;
  mode: Mode = "walk";
  facing: Facing = "down";
  /** Walk/pedal phase in radians; advances with distance travelled. */
  phase = 0;

  constructor(x: number, y: number) {
    this.x = this.prevX = x;
    this.y = this.prevY = y;
  }

  get speed(): number {
    return Math.hypot(this.vx, this.vy);
  }

  get moving(): boolean {
    return this.speed > 0.3;
  }

  /** Heading in radians (0 = east, π/2 = north): velocity, else facing. */
  get heading(): number {
    if (this.moving) return Math.atan2(this.vy, this.vx);
    return { right: 0, up: Math.PI / 2, left: Math.PI, down: -Math.PI / 2 }[this.facing];
  }

  teleport(x: number, y: number) {
    this.x = this.prevX = x;
    this.y = this.prevY = y;
    this.vx = this.vy = 0;
  }

  update(dt: number, input: Input, mode: Mode, collision: Collision) {
    this.prevX = this.x;
    this.prevY = this.y;
    this.mode = mode;

    const dir = input.move();
    const speed = SPEEDS[mode][input.fast ? 1 : 0];
    const k = 1 - Math.exp(-ACCEL[mode] * dt);
    this.vx += (dir.x * speed - this.vx) * k;
    this.vy += (dir.y * speed - this.vy) * k;
    if (dir.x === 0 && dir.y === 0 && !this.moving) this.vx = this.vy = 0;

    const m = collision.move(this.x, this.y, this.vx * dt, this.vy * dt, RADIUS[mode]);
    if (m.hitX) this.vx = 0;
    if (m.hitY) this.vy = 0;
    this.x = clamp(m.x, WORLD_BOUNDS.minX, WORLD_BOUNDS.maxX);
    this.y = clamp(m.y, WORLD_BOUNDS.minY, WORLD_BOUNDS.maxY);

    // walkers face where they're told to go; a bike faces where it's going
    const fx = mode === "bike" && this.moving ? this.vx : dir.x;
    const fy = mode === "bike" && this.moving ? this.vy : dir.y;
    if (fx !== 0 || fy !== 0) {
      this.facing = Math.abs(fx) > Math.abs(fy) ? (fx > 0 ? "right" : "left") : fy > 0 ? "up" : "down";
    }
    this.phase = (this.phase + this.speed * dt * CADENCE[mode]) % (Math.PI * 2);
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
