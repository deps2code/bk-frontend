// Fixed-step update (60 Hz) with a variable-rate render. `alpha` in render()
// is the fraction of a step since the last update, for interpolation.

export const STEP = 1 / 60;
const MAX_STEPS = 5; // after a long stall, drop time instead of spiralling

export function startLoop(
  update: (dt: number) => void,
  render: (alpha: number, frameDt: number) => void,
): () => void {
  let raf = 0;
  let last = performance.now();
  let acc = 0;

  const frame = (now: number) => {
    const frameDt = Math.min((now - last) / 1000, 0.25);
    last = now;
    acc += frameDt;
    let steps = 0;
    while (acc >= STEP && steps < MAX_STEPS) {
      update(STEP);
      acc -= STEP;
      steps++;
    }
    if (steps === MAX_STEPS) acc = 0;
    render(acc / STEP, frameDt);
    raf = requestAnimationFrame(frame);
  };

  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}
