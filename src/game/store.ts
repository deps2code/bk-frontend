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
}

export const hud = createStore<HudState>({ fps: 0, x: 0, y: 0, chunkX: 0, chunkY: 0, scale: 0 });
