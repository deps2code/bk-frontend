// The floating touch joystick: a base where the finger first landed and a
// knob following it. On touch devices a faint "ghost" stick bottom-left hints
// at it until the first drag.

import type { Camera } from "../camera";

export interface StickView {
  active: boolean;
  /** Base centre and knob centre, CSS px. */
  ox: number;
  oy: number;
  kx: number;
  ky: number;
  /** Has the joystick been used yet (hides the ghost hint). */
  used: boolean;
}

const BASE_R = 56;
const KNOB_R = 24;

export function drawStick(ctx: CanvasRenderingContext2D, cam: Camera, s: StickView, touch: boolean) {
  if (s.active) {
    base(ctx, s.ox, s.oy, 1);
    knob(ctx, s.kx, s.ky, 1);
  } else if (touch && !s.used) {
    const x = 96, y = cam.viewH - 150;
    base(ctx, x, y, 0.55);
    knob(ctx, x, y, 0.55);
  }
}

function base(ctx: CanvasRenderingContext2D, x: number, y: number, a: number) {
  ctx.beginPath();
  ctx.arc(x, y, BASE_R, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(38, 42, 30, ${0.32 * a})`;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = `rgba(241, 230, 200, ${0.7 * a})`;
  ctx.stroke();
}

function knob(ctx: CanvasRenderingContext2D, x: number, y: number, a: number) {
  ctx.beginPath();
  ctx.arc(x, y, KNOB_R, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(132, 189, 0, ${0.92 * a})`;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = `rgba(63, 92, 0, ${0.9 * a})`;
  ctx.stroke();
}
