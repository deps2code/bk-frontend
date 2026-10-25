// World constants. World units are meters in RD New (EPSG:28992): x grows
// east, y grows north — the same system as the tree dataset's X/Y_COORDINAAT.

/** Side of a streaming chunk in meters (see PLAN-game.md). */
export const CHUNK_SIZE = 250;

/** Spawn point: Grote Markt. */
export const SPAWN = { x: 233_870, y: 582_020 };

/** Bbox of the municipal tree dataset, RD meters — the playable area. */
export const WORLD_BOUNDS = { minX: 227_000, minY: 569_800, maxX: 246_700, maxY: 592_700 };

export function chunkOf(v: number): number {
  return Math.floor(v / CHUNK_SIZE);
}
