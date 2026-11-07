// Tiny pub/sub store bridging the game loop and the React HUD. The loop
// writes at a throttled rate (a few Hz); React reads via useSyncExternalStore.

type Listener = () => void;

export interface Store<T> {
  get(): T;
  set(patch: Partial<T>): void;
  subscribe(listener: Listener): () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => state,
    set(patch) {
      state = { ...state, ...patch };
      listeners.forEach((l) => l());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export interface HudState {
  fps: number;
  /** Player position, RD New meters. */
  x: number;
  y: number;
  chunkX: number;
  chunkY: number;
  /** Camera scale, CSS px per meter. */
  scale: number;
  /** World data still loading (index + trees). */
  loading: boolean;
  error: string | null;
  chunksLoaded: number;
  treesDrawn: number;
  /** Nearest street name and the neighbourhood around the player. */
  street: string | null;
  buurt: string | null;
  /** Debug overlay on (G): grid, collision masks, debug panel. */
  debug: boolean;
}

export const hud = createStore<HudState>({
  fps: 0, x: 0, y: 0, chunkX: 0, chunkY: 0, scale: 0,
  loading: true, error: null, chunksLoaded: 0, treesDrawn: 0,
  street: null, buurt: null, debug: false,
});

export type Mode = "walk" | "bike";
const MODE_KEY = "bomenkomen.mode";

/** Player choices that outlive a session (per browser). */
export const controls = createStore<{ mode: Mode }>({ mode: readMode() });
controls.subscribe(() => {
  try {
    localStorage.setItem(MODE_KEY, controls.get().mode);
  } catch {
    // storage blocked (private mode): the choice just isn't remembered
  }
});

function readMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === "bike" ? "bike" : "walk";
  } catch {
    return "walk";
  }
}

/** Numeric facts of the selected tree (strings come from details.json). */
export interface TreeFacts {
  /** Index into trees.bin / details.json. */
  index: number;
  archetype: number;
  /** Meters, rounded. */
  height: number;
  heightEstimated: boolean;
  /** Kiemjaar; 0 = unknown. */
  year: number;
  monumental: boolean;
}

export const selection = createStore<{ tree: TreeFacts | null }>({ tree: null });
