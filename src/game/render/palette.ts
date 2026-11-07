// Map colours. Index = kind enum from worldFormat.ts.

export const BASE_GROUND = "#e7dfc8";

export const GROUND_COLORS = [
  "#dfe2b4", // farmland
  "#dcd6cb", // industrial
  "#b5d68a", // grass
  "#8dbb6e", // wood
  "#a5d38c", // pitch
  "#efdfae", // sand
  "#86c5e3", // water
  "#d8d1c2", // paved
];

export const LINE_COLORS = [
  "#fbf8f1", // major
  "#fbf8f1", // medium
  "#f6f2e9", // minor
  "#f1ece1", // service
  "#e2d9c4", // foot
  "#cf8466", // cycle — Dutch red asphalt
  "#8e877c", // rail
  "#86c5e3", // water
];

/** Outline drawn under car roads (kinds major..service). */
export const ROAD_CASING = "#cbbfa6";
export const BRIDGE_CASING = "#9b8f7a";

export const BUILDING_FILL = [
  "#d9cfc0", // generic
  "#e2c3a8", // house
  "#d6cdbf", // apartments
  "#d8d3c9", // commercial
  "#cbb89f", // religious
  "#cfccc4", // industrial
  "#dccdb5", // public
  "#d6d0c4", // small
];
export const BUILDING_STROKE = "rgba(90, 75, 55, 0.55)";
