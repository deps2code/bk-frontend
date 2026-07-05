// Shareable URL hash: camera + filters.
//   #m=lon/lat/zoom/pitch/bearing&s=3fff&h=3-40&y=1750-2026&mon=1

import { ARCHETYPES, HEIGHT_MAX, HEIGHT_MIN, THIS_YEAR, YEAR_MIN } from "./archetypes";
import { defaultFilters, type Filters } from "./filters";

export interface Camera {
  lon: number;
  lat: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

export function readHash(): { camera?: Camera; filters?: Filters } {
  const params = new URLSearchParams(location.hash.slice(1));
  const out: { camera?: Camera; filters?: Filters } = {};

  const m = params.get("m")?.split("/").map(Number);
  if (m && m.length === 5 && m.every(Number.isFinite)) {
    out.camera = { lon: m[0], lat: m[1], zoom: m[2], pitch: m[3], bearing: m[4] };
  }

  const f = defaultFilters();
  let any = false;
  const s = params.get("s");
  if (s && /^[0-9a-f]+$/i.test(s)) {
    const mask = parseInt(s, 16);
    f.species = ARCHETYPES.map((_, i) => (mask & (1 << i)) !== 0);
    any = true;
  }
  const h = params.get("h")?.split("-").map(Number);
  if (h && h.length === 2 && h.every(Number.isFinite)) {
    f.hMin = Math.max(HEIGHT_MIN, h[0]);
    f.hMax = Math.min(HEIGHT_MAX, h[1]);
    any = true;
  }
  const y = params.get("y")?.split("-").map(Number);
  if (y && y.length === 2 && y.every(Number.isFinite)) {
    f.yMin = Math.max(YEAR_MIN, y[0]);
    f.yMax = Math.min(THIS_YEAR, y[1]);
    any = true;
  }
  if (params.get("mon") === "1") {
    f.monumental = true;
    any = true;
  }
  if (any) out.filters = f;
  return out;
}

let camera: Camera | null = null;
let filters: Filters | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

export function updateHash(update: { camera?: Camera; filters?: Filters }) {
  camera = update.camera ?? camera;
  filters = update.filters ?? filters;
  if (timer) clearTimeout(timer);
  timer = setTimeout(write, 250);
}

function write() {
  const params = new URLSearchParams();
  if (camera) {
    params.set(
      "m",
      [
        camera.lon.toFixed(5),
        camera.lat.toFixed(5),
        camera.zoom.toFixed(2),
        Math.round(camera.pitch),
        Math.round(camera.bearing),
      ].join("/"),
    );
  }
  if (filters) {
    const mask = filters.species.reduce((acc, on, i) => acc | (on ? 1 << i : 0), 0);
    if (filters.species.some((on) => !on)) params.set("s", mask.toString(16));
    if (filters.hMin > HEIGHT_MIN || filters.hMax < HEIGHT_MAX)
      params.set("h", `${filters.hMin}-${filters.hMax}`);
    if (filters.yMin > YEAR_MIN || filters.yMax < THIS_YEAR)
      params.set("y", `${filters.yMin}-${filters.yMax}`);
    if (filters.monumental) params.set("mon", "1");
  }
  history.replaceState(null, "", `#${params.toString()}`);
}
