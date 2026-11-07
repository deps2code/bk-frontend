// The y-sorted object pass: buildings, trees and the player drawn back to
// front by their south-most ground point (larger RD y = further north =
// further back). A building or tree crown drawn after the player that
// covers them turns see-through, so the player is never lost behind it.
// Returns the screen-space hit shapes of the drawn trees for picking.

import type { Camera } from "../camera";
import type { Building, Chunk } from "../worldFormat";
import type { TreeData } from "../../lib/loadTrees";
import { drawBuilding, hidesPlayer, roofLift } from "./buildings";
import { crownRadius } from "./geometry";
import { drawPlayer, playerHeightPx, type PlayerView } from "./sprites";
import { crownCoversPlayer, drawSelection, drawTree, layoutTree, treeLift, type TreeHit } from "./trees";

const SEE_THROUGH = 0.42;
const TREE_SEE_THROUGH = 0.5;

const BUILDING = 0, TREE = 1, PLAYER = 2;
interface Item {
  /** Sort key: south-most ground y, RD meters. */
  y: number;
  type: number;
  chunk?: Chunk;
  building?: Building;
  tree?: number;
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
): TreeHit[] {
  const b = cam.bounds();
  const items: Item[] = [];

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
    } else if (it.type === TREE) {
      const i = it.tree!;
      if (i === selected) drawSelection(ctx, cam, trees!, i, time);
      const hit = (hits[n++] ??= { i: 0, cx: 0, cy: 0, r: 0, fx: 0, fy: 0 });
      layoutTree(cam, trees!, i, hit);
      const covers = afterPlayer && crownCoversPlayer(hit, psx, psy, playerH);
      drawTree(ctx, cam, trees!, hit, covers ? TREE_SEE_THROUGH : 1);
    } else {
      drawPlayer(ctx, psx, psy, cam.scale, player, player.name);
      afterPlayer = true;
    }
  }
  hits.length = n;
  return hits;
}
