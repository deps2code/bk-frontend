// Game wiring: canvas sizing (DPR capped at 2), input, player, camera, the
// fixed-step loop, wheel zoom, HUD updates and the `#p=x/y[/scale]` URL hash.

import { Camera } from "./camera";
import { Collision } from "./collision";
import { Minimap } from "./minimap";
import { peekDetails } from "../lib/details";
import { Input, isTyping } from "./input";
import { startLoop } from "./loop";
import { Player, RADIUS } from "./player";
import { drawDebugGrid } from "./render/debug";
import { GroundCache } from "./render/groundCache";
import { drawLabels } from "./render/labels";
import { drawStick, type StickView } from "./render/joystick";
import { drawScene } from "./render/scene";
import { hitsTree, type TreeHit } from "./render/trees";
import { controls, hud, selection } from "./store";
import { SPAWN, World, chunkOf } from "./world";
import { t } from "../lib/i18n";

const MAX_DPR = 2;
/** Joystick knob travel and the drag distance that turns a tap into a drag (CSS px). */
const STICK_RADIUS = 56;
const DRAG_START = 10;
const HUD_INTERVAL = 0.25; // s
const HASH_INTERVAL = 1; // s
const PLACE_INTERVAL = 0.5; // s, street/buurt lookup
const MINI_EXTENT = 420; // m across the minimap

export interface Game {
  /** Keyboard movement and debug keys; off while a menu is open. */
  setControlsEnabled(on: boolean): void;
  /** Jump the player to an RD position (nudged out of buildings once loaded). */
  teleport(x: number, y: number): void;
  /** Is there map data at (x, y)? */
  covers(x: number, y: number): boolean;
  /** Canvases the game paints the minimap / full map into (null = none). */
  setMinimapCanvas(c: HTMLCanvasElement | null): void;
  setMapCanvas(c: HTMLCanvasElement | null): void;
  /** World position under a point (CSS px) of the full map canvas. */
  mapToWorld(px: number, py: number): { x: number; y: number } | null;
  destroy(): void;
}

export function startGame(canvas: HTMLCanvasElement, opts: { controls?: boolean } = {}): Game {
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas 2D wordt niet ondersteund");

  const start = readHash();
  const player = new Player(start?.x ?? SPAWN.x, start?.y ?? SPAWN.y);
  const camera = new Camera(player.x, player.y);
  const input = new Input();
  input.enabled = opts.controls ?? true;
  const world = new World();
  world
    .init(import.meta.env.BASE_URL)
    .then(() => hud.set({ loading: false }))
    .catch((e) => hud.set({ loading: false, error: e instanceof Error ? e.message : String(e) }));
  const ground = new GroundCache();
  const collision = new Collision(world);
  let debugGrid = false;

  let dpr = 1;
  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    camera.resize(w, h);
  };
  resize();
  camera.fitDefault();
  if (start?.scale) camera.zoomBy(start.scale / camera.scale);
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    camera.zoomBy(Math.exp(-e.deltaY * 0.0015));
  };
  canvas.addEventListener("wheel", onWheel, { passive: false });

  // after a jump, wait for the chunk to load, then step out of any building
  let settle = true; // the spawn point may sit in a building too
  const teleport = (x: number, y: number) => {
    selection.set({ tree: null });
    player.teleport(x, y);
    camera.jumpTo(x, y);
    settle = true;
  };

  const onHashChange = () => {
    const h = readHash();
    if (!h) return;
    teleport(h.x, h.y);
    if (h.scale) camera.zoomBy(h.scale / camera.scale);
  };
  window.addEventListener("hashchange", onHashChange);

  // ---- tree selection: tap/click a tree, or E for the nearest one --------
  let treeHits: TreeHit[] = [];

  const select = (i: number | null) => {
    const t = world.trees;
    if (i === null || !t) return selection.set({ tree: null });
    selection.set({
      tree: {
        index: i,
        archetype: t.archetypes[i],
        height: t.heights[i],
        heightEstimated: (t.flags[i] & 2) !== 0,
        year: t.years[i],
        monumental: (t.flags[i] & 1) !== 0,
      },
    });
  };

  /** Front-most tree under a screen point (CSS px), or null. */
  const pick = (x: number, y: number): number | null => {
    const t = world.trees;
    if (!t) return null;
    for (let k = treeHits.length - 1; k >= 0; k--) if (hitsTree(t, treeHits[k], x, y)) return treeHits[k].i;
    return null;
  };

  const nearestTree = (maxDist: number): number | null => {
    const t = world.trees;
    if (!t) return null;
    let best: number | null = null;
    let bestD = maxDist * maxDist;
    for (let cy = chunkOf(player.y) - 1; cy <= chunkOf(player.y) + 1; cy++) {
      for (let cx = chunkOf(player.x) - 1; cx <= chunkOf(player.x) + 1; cx++) {
        const range = t.chunks.get(`${cx},${cy}`);
        if (!range) continue;
        for (let i = range[0]; i < range[0] + range[1]; i++) {
          const d = (t.x[i] / 10 - player.x) ** 2 + (t.y[i] / 10 - player.y) ** 2;
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
      }
    }
    return best;
  };

  // ---- pointer: tap = select tree, drag = floating joystick, 2 fingers = pinch
  const pointers = new Map<number, { x: number; y: number }>();
  let gesture: { id: number; ox: number; oy: number; t: number; dragging: boolean } | null = null;
  let pinch: { dist: number; scale: number } | null = null;
  const stick: StickView = { active: false, ox: 0, oy: 0, kx: 0, ky: 0, used: false };
  const coarse = window.matchMedia("(pointer: coarse)").matches;

  const releaseStick = () => {
    stick.active = false;
    input.stick = { x: 0, y: 0 };
  };
  const pinchDist = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (!input.enabled) return;
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (pointers.size === 1) {
      gesture = { id: e.pointerId, ox: e.offsetX, oy: e.offsetY, t: performance.now(), dragging: false };
    } else if (pointers.size === 2) {
      gesture = null;
      releaseStick();
      pinch = { dist: Math.max(1, pinchDist()), scale: camera.scale };
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    const p = pointers.get(e.pointerId);
    if (!p) {
      if (e.pointerType === "mouse" && e.buttons === 0) {
        canvas.style.cursor = input.enabled && pick(e.offsetX, e.offsetY) !== null ? "pointer" : "";
      }
      return;
    }
    p.x = e.offsetX;
    p.y = e.offsetY;
    if (pinch && pointers.size >= 2) {
      camera.zoomBy((pinch.scale * (pinchDist() / pinch.dist)) / camera.scale);
      return;
    }
    if (!gesture || gesture.id !== e.pointerId) return;
    const dx = p.x - gesture.ox, dy = p.y - gesture.oy;
    const len = Math.hypot(dx, dy);
    if (!gesture.dragging && len > DRAG_START) gesture.dragging = true;
    if (!gesture.dragging) return;
    const reach = Math.min(len, STICK_RADIUS);
    // analog: pushing the knob further means moving faster; screen y is down
    input.stick = { x: (dx / len) * (reach / STICK_RADIUS), y: (-dy / len) * (reach / STICK_RADIUS) };
    Object.assign(stick, { active: true, used: true, ox: gesture.ox, oy: gesture.oy });
    stick.kx = gesture.ox + (dx / len) * reach;
    stick.ky = gesture.oy + (dy / len) * reach;
  };

  const onPointerUp = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pinch && pointers.size < 2) pinch = null; // the lifted-off finger doesn't become a joystick
    if (!gesture || gesture.id !== e.pointerId) return;
    const tap = !gesture.dragging && e.type === "pointerup" && performance.now() - gesture.t < 600;
    gesture = null;
    releaseStick();
    if (tap && input.enabled) select(pick(e.offsetX, e.offsetY));
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);

  const onKey = (e: KeyboardEvent) => {
    if (e.repeat || !input.enabled || isTyping(e.target)) return;
    if (e.code === "KeyG") {
      debugGrid = !debugGrid;
      hud.set({ debug: debugGrid });
    }
    if (e.code === "KeyF") controls.set({ mode: controls.get().mode === "bike" ? "walk" : "bike" });
    if (e.code === "KeyE") select(nearestTree(12));
    if (e.code === "Escape") select(null);
  };
  window.addEventListener("keydown", onKey);

  let hudTimer = 0;
  let hashTimer = 0;
  let frames = 0;
  let fpsTime = 0;
  let lastHash = "";

  const update = (dt: number) => {
    if (settle && collision.ready(player.x, player.y)) {
      settle = false;
      const free = collision.findFree(player.x, player.y, RADIUS[controls.get().mode]);
      if (free) player.teleport(free.x, free.y);
    }
    player.update(dt, input, controls.get().mode, collision);
  };

  const minimap = new Minimap();
  let miniCanvas: HTMLCanvasElement | null = null;
  let mapCanvas: HTMLCanvasElement | null = null;
  let placeTimer = PLACE_INTERVAL;

  /** Street (nearest named road) and buurt (from the nearest tree's details). */
  const updatePlace = () => {
    const street = world.streetNear(player.x, player.y, 40);
    let buurt: string | null = null;
    const d = peekDetails();
    const i = d ? nearestTree(250) : null;
    if (d && i !== null) {
      const b = d.buurten[d.t.bu[i]];
      if (b && b !== "—") buurt = b;
    }
    const cur = hud.get();
    if (cur.street !== street || cur.buurt !== buurt) hud.set({ street, buurt });
  };

  const render = (alpha: number, frameDt: number) => {
    const px = player.prevX + (player.x - player.prevX) * alpha;
    const py = player.prevY + (player.y - player.prevY) * alpha;
    camera.follow(px, py, frameDt);

    const chunks = world.visible(camera.bounds());
    ground.draw(ctx, camera, dpr, world);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawLabels(ctx, camera, chunks);
    treeHits = drawScene(
      ctx,
      camera,
      dpr,
      chunks,
      world.trees,
      {
        x: px,
        y: py,
        name: t().you,
        mode: player.mode,
        facing: player.facing,
        phase: player.phase,
        moving: player.moving,
      },
      selection.get().tree?.index ?? null,
      performance.now() / 1000,
    );
    if (debugGrid) {
      drawDebugGrid(ctx, camera);
      collision.drawDebug(ctx, camera);
    }

    minimap.ensure(world);
    const mp = { x: px, y: py, heading: player.heading };
    if (miniCanvas && frames % 2 === 0) minimap.drawMini(miniCanvas, mp, MINI_EXTENT);
    if (mapCanvas) minimap.drawFull(mapCanvas, mp);
    placeTimer += frameDt;
    if (placeTimer >= PLACE_INTERVAL) {
      placeTimer = 0;
      updatePlace();
    }
    drawStick(ctx, camera, stick, coarse && input.enabled);

    frames++;
    fpsTime += frameDt;
    hudTimer += frameDt;
    hashTimer += frameDt;
    if (hudTimer >= HUD_INTERVAL) {
      hud.set({
        fps: fpsTime > 0 ? Math.round(frames / fpsTime) : 0,
        x: player.x,
        y: player.y,
        chunkX: chunkOf(player.x),
        chunkY: chunkOf(player.y),
        scale: camera.scale,
        chunksLoaded: world.loadedCount,
        treesDrawn: treeHits.length,
      });
      hudTimer = frames = fpsTime = 0;
    }
    if (hashTimer >= HASH_INTERVAL) {
      hashTimer = 0;
      const hash = `#p=${Math.round(player.x)}/${Math.round(player.y)}/${camera.scale.toFixed(1)}`;
      if (hash !== lastHash) {
        lastHash = hash;
        history.replaceState(null, "", hash);
      }
    }
  };

  const stopLoop = startLoop(update, render);

  return {
    teleport,
    covers: (x, y) => world.covers(x, y),
    setMinimapCanvas(c) {
      miniCanvas = c;
    },
    setMapCanvas(c) {
      mapCanvas = c;
    },
    mapToWorld: (px, py) => minimap.fullToWorld(px, py),
    setControlsEnabled(on) {
      input.enabled = on;
      if (!on) {
        gesture = pinch = null;
        pointers.clear();
        releaseStick();
      }
    },
    destroy() {
      stopLoop();
      world.destroy();
      ro.disconnect();
      input.destroy();
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("hashchange", onHashChange);
      window.removeEventListener("keydown", onKey);
    },
  };
}

function readHash(): { x: number; y: number; scale?: number } | null {
  const m = /p=(-?[\d.]+)\/(-?[\d.]+)(?:\/([\d.]+))?/.exec(location.hash);
  if (!m) return null;
  const x = Number(m[1]);
  const y = Number(m[2]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const scale = m[3] ? Number(m[3]) : undefined;
  return { x, y, scale: scale && Number.isFinite(scale) ? scale : undefined };
}
