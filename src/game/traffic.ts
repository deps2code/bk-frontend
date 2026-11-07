// Ambient traffic: a handful of cars, pedestrians and cyclists that follow
// the OSM road/path polylines near the player. Each agent walks one way
// (polyline) in one direction; at its end it picks a connecting way (any
// way passing within JOIN m — chunk seams and T-junctions alike), preferring
// to go straight and never turning back unless it's a dead end. Cars keep
// right and brake for the player and for cars ahead. Agents spawn off-screen
// (except to fill an empty city) and vanish once far from the player.
// Purely visual: they don't collide with the player.

import { chunkOf, type World } from "./world";
import type { Chunk, Way } from "./worldFormat";
import type { Facing } from "./player";

export type AgentKind = "car" | "walker" | "cyclist";

/** How many of each are around the player — kept deliberately low. */
const MAX: Record<AgentKind, number> = { car: 4, walker: 6, cyclist: 2 };
/** Line kinds (worldFormat LINE_KINDS) each agent may use. */
const KINDS: Record<AgentKind, number[]> = {
  car: [0, 1, 2], // major, medium, minor
  walker: [2, 3, 4], // minor, service, foot
  cyclist: [1, 2, 5], // medium, minor, cycle
};
/** m/s [min, max] — the player walks at 10 m/s, so the city runs fast too. */
const SPEED: Record<AgentKind, [number, number]> = { car: [9, 14], walker: [2.2, 3.2], cyclist: [6, 8] };
const CADENCE: Record<AgentKind, number> = { car: 0, walker: 1.6, cyclist: 1.1 };

const SPAWN_MIN = 35; // m from the player
const SPAWN_MAX = 220;
const DESPAWN = 280;
const SPAWN_INTERVAL = 0.2; // s between spawn attempts
const JOIN = 0.8; // m: ways this close to a way's end connect to it
const CAR_GAP = 12; // m (centre to obstacle): a car stops this far behind it
const CAR_LOOK = 22; // m: ...and starts slowing this far behind it
const FOLLOW = 12; // 1/s, smoothing of the drawn position around corners

/**
 * Car footprint in meters, at the player's cartoon scale (the player figure
 * is ≈2.5× a real person): about twice the player's height long.
 */
export const CAR_LEN = 9;
export const CAR_WID = 3.8;

export const CAR_COLORS = ["#c8433a", "#2f5d8c", "#e9e6df", "#9aa1a8", "#2b2d31", "#d9a531", "#3d7a52", "#e9e6df"];
export const PED_LOOKS = [
  { shirt: "#c0504d", pants: "#3b4a6b", hair: "#2b1d12", skin: "#e8b98f" },
  { shirt: "#3f78b5", pants: "#4a4a4a", hair: "#d6b45c", skin: "#f1c9a5" },
  { shirt: "#e0a33c", pants: "#2e3a55", hair: "#5a3b22", skin: "#c68b5e" },
  { shirt: "#7a5aa6", pants: "#5b4636", hair: "#1b1b1b", skin: "#8d5a3b" },
  { shirt: "#e6e1d6", pants: "#2f4f3a", hair: "#8a4b2a", skin: "#e8b98f" },
  { shirt: "#3d7a52", pants: "#3b3b46", hair: "#b0aaa0", skin: "#f1c9a5" },
];

export interface Agent {
  kind: AgentKind;
  /** Drawn position (smoothed), RD meters, and its value at the previous step. */
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  /** Heading in radians (0 = east, π/2 = north). */
  heading: number;
  speed: number;
  /** Walk/pedal phase, radians. */
  phase: number;
  facing: Facing;
  /** Colour index (car colour / pedestrian look). */
  look: number;

  // route state
  way: Way;
  ox: number;
  oy: number;
  /** Travelling from vertex `a` to vertex `a + dir`, `s` m along that segment. */
  a: number;
  dir: 1 | -1;
  s: number;
  vmax: number;
  /** Sideways offset from the centre line, m (positive = right of travel). */
  side: number;
}

export class Traffic {
  agents: Agent[] = [];
  private spawnTimer = 0;

  constructor(private world: World) {}

  update(dt: number, px: number, py: number, view: { minX: number; maxX: number; minY: number; maxY: number }) {
    // despawn far agents
    this.agents = this.agents.filter((a) => Math.hypot(a.x - px, a.y - py) < DESPAWN);

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = SPAWN_INTERVAL;
      for (const kind of ["car", "walker", "cyclist"] as AgentKind[]) {
        const n = this.agents.reduce((k, a) => k + (a.kind === kind ? 1 : 0), 0);
        if (n < MAX[kind]) this.trySpawn(kind, px, py, view, n < MAX[kind] / 2);
      }
    }

    for (const a of this.agents) this.step(a, dt, px, py);
  }

  private trySpawn(kind: AgentKind, px: number, py: number, view: Bounds, allowInView: boolean) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);
      const c = this.world.chunkAt(chunkOf(px + Math.cos(ang) * dist), chunkOf(py + Math.sin(ang) * dist));
      if (!c || !c.ways.length) continue;
      const way = c.ways[Math.floor(Math.random() * c.ways.length)];
      if (!KINDS[kind].includes(way.kind)) continue;
      const nSeg = way.pts.length / 2 - 1;
      const seg = Math.floor(Math.random() * nSeg);
      const u = Math.random();
      const x = c.ox + way.pts[seg * 2] + (way.pts[seg * 2 + 2] - way.pts[seg * 2]) * u;
      const y = c.oy + way.pts[seg * 2 + 1] + (way.pts[seg * 2 + 3] - way.pts[seg * 2 + 1]) * u;
      const d = Math.hypot(x - px, y - py);
      if (d < SPAWN_MIN || d > SPAWN_MAX) continue;
      const inView = x > view.minX - 8 && x < view.maxX + 8 && y > view.minY - 8 && y < view.maxY + 12;
      if (inView && !allowInView) continue;
      if (this.agents.some((o) => Math.hypot(o.x - x, o.y - y) < (kind === "car" || o.kind === "car" ? 18 : 4))) continue;

      const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
      const segLen = len(way.pts, seg, seg + 1);
      const [lo, hi] = SPEED[kind];
      const agent: Agent = {
        kind,
        x, y, prevX: x, prevY: y,
        heading: 0,
        speed: 0,
        phase: Math.random() * Math.PI * 2,
        facing: "down",
        look: Math.floor(Math.random() * (kind === "car" ? CAR_COLORS.length : PED_LOOKS.length)),
        way, ox: c.ox, oy: c.oy,
        a: dir === 1 ? seg : seg + 1,
        dir,
        s: dir === 1 ? u * segLen : (1 - u) * segLen,
        vmax: lo + Math.random() * (hi - lo),
        side: sideOffset(kind, way),
      };
      agent.speed = kind === "car" ? agent.vmax * 0.6 : agent.vmax;
      const t = this.target(agent);
      agent.x = agent.prevX = t.x;
      agent.y = agent.prevY = t.y;
      agent.heading = t.h;
      agent.facing = facingOf(t.h);
      this.agents.push(agent);
      return;
    }
  }

  private step(a: Agent, dt: number, px: number, py: number) {
    a.prevX = a.x;
    a.prevY = a.y;

    if (a.kind === "car") {
      const hx = Math.cos(a.heading), hy = Math.sin(a.heading);
      let free = CAR_LOOK;
      const check = (ox: number, oy: number, halfWidth: number) => {
        const rx = ox - a.x, ry = oy - a.y;
        const along = rx * hx + ry * hy;
        if (along <= 0 || along >= free) return;
        if (Math.abs(rx * hy - ry * hx) < halfWidth) free = along;
      };
      check(px, py, CAR_WID / 2 + 0.8);
      for (const o of this.agents) if (o !== a && o.kind !== "walker") check(o.x, o.y, o.kind === "car" ? 2.6 : 1.2);
      const target = free <= CAR_GAP ? 0 : (a.vmax * (free - CAR_GAP)) / (CAR_LOOK - CAR_GAP);
      const rate = target < a.speed ? 6 : 1.5; // brake hard, pull away gently
      a.speed += (target - a.speed) * (1 - Math.exp(-rate * dt));
      if (a.speed < 0.05 && target === 0) a.speed = 0;
    }

    // advance along the route
    let move = a.speed * dt;
    for (let guard = 0; move > 0 && guard < 8; guard++) {
      const b = a.a + a.dir;
      const segLen = len(a.way.pts, a.a, b);
      if (a.s + move < segLen) {
        a.s += move;
        break;
      }
      move -= segLen - a.s;
      a.s = 0;
      a.a = b;
      const next = a.a + a.dir;
      if (next < 0 || next >= a.way.pts.length / 2) this.junction(a);
    }

    // ease the drawn position towards the route point (smooth corners)
    const t = this.target(a);
    const k = 1 - Math.exp(-FOLLOW * dt);
    a.x += (t.x - a.x) * k;
    a.y += (t.y - a.y) * k;
    const mx = a.x - a.prevX, my = a.y - a.prevY;
    if (mx * mx + my * my > 1e-6) {
      a.heading = Math.atan2(my, mx);
      a.facing = facingOf(a.heading);
    }
    a.phase = (a.phase + a.speed * dt * CADENCE[a.kind]) % (Math.PI * 2);
  }

  /** Route point (with the sideways offset) and segment heading. */
  private target(a: Agent): { x: number; y: number; h: number } {
    const p = a.way.pts;
    const b = a.a + a.dir;
    const ax = p[a.a * 2], ay = p[a.a * 2 + 1];
    const dx = p[b * 2] - ax, dy = p[b * 2 + 1] - ay;
    const l = Math.hypot(dx, dy) || 1;
    const ux = dx / l, uy = dy / l;
    // right of travel is (uy, -ux) with y north
    return {
      x: a.ox + ax + ux * a.s + uy * a.side,
      y: a.oy + ay + uy * a.s - ux * a.side,
      h: Math.atan2(uy, ux),
    };
  }

  /** At the end of a way: continue on a connecting one, else turn around. */
  private junction(a: Agent) {
    const p = a.way.pts;
    const ex = a.ox + p[a.a * 2], ey = a.oy + p[a.a * 2 + 1];
    const prev = a.a - a.dir;
    const inX = p[a.a * 2] - p[prev * 2], inY = p[a.a * 2 + 1] - p[prev * 2 + 1];
    const inL = Math.hypot(inX, inY) || 1;
    const hx = inX / inL, hy = inY / inL;

    type Option = { way: Way; c: Chunk; a: number; dir: 1 | -1; s: number; w: number };
    const options: Option[] = [];
    let total = 0;
    const seen = new Set<Chunk>();
    for (const [qx, qy] of [[ex, ey], [ex - JOIN, ey - JOIN], [ex + JOIN, ey + JOIN], [ex - JOIN, ey + JOIN], [ex + JOIN, ey - JOIN]]) {
      const c = this.world.chunkAt(chunkOf(qx), chunkOf(qy));
      if (!c || seen.has(c)) continue;
      seen.add(c);
      const lx = ex - c.ox, ly = ey - c.oy;
      for (const way of c.ways) {
        if (way === a.way || !KINDS[a.kind].includes(way.kind)) continue;
        const q = way.pts;
        const n = q.length / 2;
        for (let i = 0; i < n - 1; i++) {
          const x0 = q[i * 2], y0 = q[i * 2 + 1], x1 = q[i * 2 + 2], y1 = q[i * 2 + 3];
          if (Math.min(x0, x1) - JOIN > lx || Math.max(x0, x1) + JOIN < lx) continue;
          if (Math.min(y0, y1) - JOIN > ly || Math.max(y0, y1) + JOIN < ly) continue;
          const dx = x1 - x0, dy = y1 - y0;
          const L2 = dx * dx + dy * dy;
          if (L2 < 1e-6) continue;
          const u = Math.max(0, Math.min(1, ((lx - x0) * dx + (ly - y0) * dy) / L2));
          if (Math.hypot(x0 + dx * u - lx, y0 + dy * u - ly) > JOIN) continue;
          const L = Math.sqrt(L2);
          const fx = dx / L, fy = dy / L;
          const add = (o: Omit<Option, "w">, dot: number, remaining: number) => {
            if (dot < -0.25 || remaining < 0.5) return; // no U-turns, no stubs
            const w = 1 + 3 * Math.max(0, dot); // prefer going straight on
            options.push({ ...o, w });
            total += w;
          };
          // forward: towards vertex i+1; backward: towards vertex i
          add({ way, c, a: i, dir: 1, s: u * L }, fx * hx + fy * hy, (1 - u) * L + (i + 1 < n - 1 ? 1 : 0));
          add({ way, c, a: i + 1, dir: -1, s: (1 - u) * L }, -(fx * hx + fy * hy), u * L + (i > 0 ? 1 : 0));
        }
      }
    }

    if (!options.length) {
      // dead end (or the next chunk isn't loaded): turn around
      a.dir = a.dir === 1 ? -1 : 1;
      a.s = 0;
      return;
    }
    let r = Math.random() * total;
    let pick = options[0];
    for (const o of options) {
      r -= o.w;
      if (r <= 0) {
        pick = o;
        break;
      }
    }
    a.way = pick.way;
    a.ox = pick.c.ox;
    a.oy = pick.c.oy;
    a.a = pick.a;
    a.dir = pick.dir;
    a.s = pick.s;
    a.side = sideOffset(a.kind, pick.way);
  }
}

interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function len(p: Float32Array, i: number, j: number): number {
  return Math.hypot(p[j * 2] - p[i * 2], p[j * 2 + 1] - p[i * 2 + 1]) || 0.001;
}

/** Keep right: cars in the right lane, people along the right-hand edge. */
function sideOffset(kind: AgentKind, way: Way): number {
  const half = way.width / 2;
  if (kind === "car") return Math.max(CAR_WID / 2, Math.min(half * 0.5, 3));
  if (way.kind <= 3) return Math.max(0, half - (kind === "cyclist" ? 1 : 0.2)); // road edge
  return (Math.random() - 0.3) * Math.min(half, 1); // on a path: anywhere, mostly right
}

function facingOf(h: number): Facing {
  const c = Math.cos(h), s = Math.sin(h);
  return Math.abs(c) > Math.abs(s) ? (c > 0 ? "right" : "left") : s > 0 ? "up" : "down";
}
