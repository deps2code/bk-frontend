// The y-sorted object pass: buildings, trees and the player drawn back to
// front by their south-most ground point (larger RD y = further north =
// further back). A building or tree crown drawn after the player that
// covers them turns see-through, so the player is never lost behind it.
// Returns the screen-space hit shapes of the drawn trees for picking.

import type { Camera } from "../camera";
import type { Building, Chunk } from "../worldFormat";
import type { TreeData } from "../../lib/loadTrees";
import type { Agent } from "../traffic";
import { agentSortY, CAR_LEN, drawAgent, drawLamp, LAMP_HEAD_Z, LAMP_MIN_SCALE } from "./agents";
import { drawBuilding, hidesPlayer, roofLift } from "./buildings";
import { HEIGHT_FACTOR } from "./geometry";
import type { Night } from "./night";
import { crownRadius } from "./geometry";
import { drawPlayer, playerHeightPx, type PlayerView } from "./sprites";
import { crownCoversPlayer, drawSelection, drawTree, layoutTree, treeLift, type TreeHit } from "./trees";

const SEE_THROUGH = 0.42;
const TREE_SEE_THROUGH = 0.5;

const BUILDING = 0, TREE = 1, LAMP = 2, AGENT = 3, PLAYER = 4;
const WINDOW_MIN_SCALE = 5; // as in buildings.ts
interface Item {
  /** Sort key: south-most ground y, RD meters. */
  y: number;
  type: number;
  chunk?: Chunk;
  building?: Building;
  tree?: number;
  agent?: Agent;
  /** Lamp position, or the agent's interpolated position. */
  x?: number;
  ay?: number;
}

/** Things that move or light up, beside the static world. */
export interface SceneExtras {
  agents: Agent[];
  /** Interpolation fraction since the last fixed step. */
  alpha: number;
  /** Street lamps in view, world [x, y, …]. */
  lamps: number[];
  /** Light map, when night mode is (fading) on. */
  night: Night | null;
}

export interface ScenePlayer extends PlayerView {
  /** Interpolated world position, RD meters. */
  x: number;
  y: number;
  name: string;
}

// reused across frames to avoid per-frame allocation of hit records
const hits: TreeHit[] = [];

export function drawScene(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  dpr: number,
  chunks: Chunk[],
  trees: TreeData | null,
  player: ScenePlayer,
  selected: number | null,
  time: number,
  extras: SceneExtras,
): TreeHit[] {
  const b = cam.bounds();
  const items: Item[] = [];
  const night = extras.night;
  const level = night?.level ?? 0;
  const s = cam.scale;

  for (const c of chunks) {
    for (const bd of c.buildings) {
      // a building's silhouette reaches `lift` m north of its footprint
      if (c.ox + bd.maxX < b.minX || c.ox + bd.minX > b.maxX) continue;
      if (c.oy + bd.maxY + roofLift(bd) < b.minY || c.oy + bd.minY > b.maxY) continue;
      items.push({ y: c.oy + bd.minY, type: BUILDING, chunk: c, building: bd });
    }
    const range = trees?.chunks.get(`${c.cx},${c.cy}`);
    if (!trees || !range) continue;
    for (let i = range[0], end = range[0] + range[1]; i < end; i++) {
      const x = trees.x[i] / 10, y = trees.y[i] / 10;
      const h = trees.heights[i];
      const r = crownRadius(h, i) * 1.5; // tallest crown aspect
      if (x + r < b.minX || x - r > b.maxX || y + treeLift(h, r) + r < b.minY || y - r > b.maxY) continue;
      items.push({ y, type: TREE, tree: i });
    }
  }
  for (const a of extras.agents) {
    const x = a.prevX + (a.x - a.prevX) * extras.alpha;
    const y = a.prevY + (a.y - a.prevY) * extras.alpha;
    if (x < b.minX - CAR_LEN || x > b.maxX + CAR_LEN || y < b.minY - CAR_LEN || y > b.maxY + 8) continue;
    items.push({ y: agentSortY(a, y), type: AGENT, agent: a, x, ay: y });
  }
  const showPoles = s >= LAMP_MIN_SCALE;
  for (let k = 0; k < extras.lamps.length; k += 2) {
    const x = extras.lamps[k], y = extras.lamps[k + 1];
    // light pools on the ground go into the light map first; buildings drawn
    // later in scene order cover them where they stand in front
    if (night) night.glow(cam.sx(x), cam.sy(y), 11 * s, "lamp", 0.5);
    if (showPoles) items.push({ y, type: LAMP, x });
  }
  if (night) {
    // a little light around the player, so you're never lost in the dark
    night.glow(cam.sx(player.x), cam.sy(player.y), 9 * s, "white", 0.35);
  }
  items.push({ y: player.y, type: PLAYER });
  items.sort((a, z) => z.y - a.y || a.type - z.type);

  const playerH = playerHeightPx(cam.scale);
  const psx = cam.sx(player.x), psy = cam.sy(player.y);
  let afterPlayer = false;
  let n = 0;
  for (const it of items) {
    if (it.type === BUILDING) {
      const c = it.chunk!, bd = it.building!;
      const hides = afterPlayer && hidesPlayer(bd, player.x - c.ox, player.y - c.oy, playerH / cam.scale);
      drawBuilding(ctx, cam, dpr, c, bd, hides ? SEE_THROUGH : 1);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      night?.building(cam, c, bd, hides ? SEE_THROUGH : 1, s >= WINDOW_MIN_SCALE);
    } else if (it.type === TREE) {
      const i = it.tree!;
      if (i === selected) drawSelection(ctx, cam, trees!, i, time);
      const hit = (hits[n++] ??= { i: 0, cx: 0, cy: 0, r: 0, fx: 0, fy: 0 });
      layoutTree(cam, trees!, i, hit);
      const covers = afterPlayer && crownCoversPlayer(hit, psx, psy, playerH);
      drawTree(ctx, cam, trees!, hit, covers ? TREE_SEE_THROUGH : 1);
      if (night && !covers) night.crown(hit.cx, hit.cy, hit.r);
    } else if (it.type === LAMP) {
      drawLamp(ctx, cam, it.x!, it.y, level);
      if (night) night.glow(cam.sx(it.x!), cam.sy(it.y) - LAMP_HEAD_Z * HEIGHT_FACTOR * s, Math.max(6, 1.8 * s), "lamp", 0.9);
    } else if (it.type === AGENT) {
      const a = it.agent!;
      drawAgent(ctx, cam, a, it.x!, it.ay!, level);
      if (night && a.kind === "car") carLights(night, cam, a, it.x!, it.ay!);
    } else {
      drawPlayer(ctx, psx, psy, cam.scale, player, player.name);
      afterPlayer = true;
    }
  }
  hits.length = n;
  return hits;
}

/** Headlight beams ahead of a car and a red glow behind it. */
function carLights(night: Night, cam: Camera, a: Agent, x: number, y: number) {
  const c = Math.cos(a.heading), sn = Math.sin(a.heading);
  const half = CAR_LEN / 2;
  const fz = 0.75 * 1.5 * HEIGHT_FACTOR * cam.scale; // light height on screen
  const fx = cam.sx(x + c * half), fy = cam.sy(y + sn * half);
  // screen y is down, so the screen angle of a world heading is −heading
  night.beam(fx, fy, -a.heading, 18 * cam.scale, 0.38, 0.75);
  night.glow(fx, fy - fz, 1.6 * cam.scale, "white", 0.8);
  night.glow(cam.sx(x - c * half), cam.sy(y - sn * half) - fz, 1.4 * cam.scale, "red", 0.7);
}
