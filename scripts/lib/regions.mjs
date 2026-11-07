// Build regions in chunk coordinates (CHUNK_SIZE m cells of the RD grid).
// Must stay in sync with src/game/world.ts (CHUNK_SIZE).

export const CHUNK_SIZE = 250;

export const REGIONS = {
  // inside the Diepenring plus one ring of chunks (milestone 2)
  centrum: { cx0: 931, cy0: 2324, cx1: 940, cy1: 2332 },
};

export function regionBBoxRD(region) {
  return {
    minX: region.cx0 * CHUNK_SIZE,
    minY: region.cy0 * CHUNK_SIZE,
    maxX: (region.cx1 + 1) * CHUNK_SIZE,
    maxY: (region.cy1 + 1) * CHUNK_SIZE,
  };
}
