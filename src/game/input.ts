// Keyboard input (arrows / WASD by physical key, Shift = faster). The touch
// joystick (milestone 5) writes `stick`; `move()` merges both sources.

const UP = new Set(["ArrowUp", "KeyW"]);
const DOWN = new Set(["ArrowDown", "KeyS"]);
const LEFT = new Set(["ArrowLeft", "KeyA"]);
const RIGHT = new Set(["ArrowRight", "KeyD"]);
const FAST = new Set(["ShiftLeft", "ShiftRight"]);
const HANDLED = new Set([...UP, ...DOWN, ...LEFT, ...RIGHT, ...FAST, "Space"]);

export interface Vec {
  x: number;
  y: number;
}

export class Input {
  /** Analog stick from the touch joystick, each axis in [-1, 1], y = north. */
  stick: Vec = { x: 0, y: 0 };
  /** Off while a menu (e.g. the welcome screen) owns the keyboard. */
  private on = true;
  private keys = new Set<string>();

  constructor() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.clear);
  }

  destroy() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.clear);
  }

  get enabled(): boolean {
    return this.on;
  }

  set enabled(on: boolean) {
    this.on = on;
    if (!on) this.clear();
  }

  /** Movement intent: x = east, y = north, length ≤ 1. */
  move(): Vec {
    if (!this.on) return { x: 0, y: 0 };
    const any = (set: Set<string>) => [...set].some((k) => this.keys.has(k));
    let x = (any(RIGHT) ? 1 : 0) - (any(LEFT) ? 1 : 0) + this.stick.x;
    let y = (any(UP) ? 1 : 0) - (any(DOWN) ? 1 : 0) + this.stick.y;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  get fast(): boolean {
    return [...FAST].some((k) => this.keys.has(k));
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.on || isTyping(e.target)) return;
    if (HANDLED.has(e.code)) e.preventDefault();
    this.keys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private clear = () => {
    this.keys.clear();
  };
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}
