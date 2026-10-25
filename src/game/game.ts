// Game wiring: canvas sizing (DPR capped at 2), input, player, camera, the
// fixed-step loop, wheel zoom, HUD updates and the `#p=x/y[/scale]` URL hash.

import { Camera } from "./camera";
import { Input } from "./input";
import { startLoop } from "./loop";
import { Player } from "./player";
import { drawGround } from "./render/ground";
import { drawPlayer } from "./render/sprites";
import { hud } from "./store";
import { SPAWN, chunkOf } from "./world";

const MAX_DPR = 2;
const HUD_INTERVAL = 0.25; // s
const HASH_INTERVAL = 1; // s

export interface Game {
  destroy(): void;
}

export function startGame(canvas: HTMLCanvasElement): Game {
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas 2D wordt niet ondersteund");

  const start = readHash();
  const player = new Player(start?.x ?? SPAWN.x, start?.y ?? SPAWN.y);
  const camera = new Camera(player.x, player.y);
  const input = new Input();

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

  const onHashChange = () => {
    const h = readHash();
    if (!h) return;
    player.teleport(h.x, h.y);
    camera.jumpTo(h.x, h.y);
    if (h.scale) camera.zoomBy(h.scale / camera.scale);
  };
  window.addEventListener("hashchange", onHashChange);

  let hudTimer = 0;
  let hashTimer = 0;
  let frames = 0;
  let fpsTime = 0;
  let lastHash = "";

  const update = (dt: number) => {
    player.update(dt, input);
  };

  const render = (alpha: number, frameDt: number) => {
    const px = player.prevX + (player.x - player.prevX) * alpha;
    const py = player.prevY + (player.y - player.prevY) * alpha;
    camera.follow(px, py, frameDt);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawGround(ctx, camera);
    drawPlayer(ctx, camera.sx(px), camera.sy(py), camera.scale, player.facing, player.walkPhase, player.moving, "Jij");

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
    destroy() {
      stopLoop();
      ro.disconnect();
      input.destroy();
      canvas.removeEventListener("wheel", onWheel);
      window.removeEventListener("hashchange", onHashChange);
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
