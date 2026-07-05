// Fixed archetype order — must match scripts/build-data.mjs.
// Palette validated with the dataviz six-checks script (CVD separation PASS);
// chroma sits below the chart floor by design (naturalistic foliage) and is
// compensated by the labeled legend, popups and filters — identity is never
// color-alone.

export type Shape = "round" | "oval" | "weeping" | "conifer";

export interface Archetype {
  name: string;
  color: [number, number, number];
  shape: Shape;
}

function hex(h: string): [number, number, number] {
  return [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
}

export const ARCHETYPES: Archetype[] = [
  { name: "Eik", color: hex("#1e7a3c"), shape: "round" },
  { name: "Es", color: hex("#7fb45c"), shape: "oval" },
  { name: "Linde", color: hex("#a8a832"), shape: "round" },
  { name: "Els", color: hex("#0f8577"), shape: "oval" },
  { name: "Esdoorn", color: hex("#c25b3f"), shape: "round" },
  { name: "Berk", color: hex("#c0a94e"), shape: "oval" },
  { name: "Wilg", color: hex("#9db98a"), shape: "weeping" },
  { name: "Populier", color: hex("#3f6d2e"), shape: "oval" },
  { name: "Iep", color: hex("#4d9e7d"), shape: "round" },
  { name: "Beuk", color: hex("#8a5a37"), shape: "round" },
  { name: "Plataan", color: hex("#e0a33c"), shape: "round" },
  { name: "Conifeer", color: hex("#0d5c50"), shape: "conifer" },
  { name: "Sierboom", color: hex("#c47b8a"), shape: "round" },
  { name: "Overig", color: hex("#75885f"), shape: "round" },
];

export const MONUMENTAL_COLOR: [number, number, number] = hex("#e6b422");

export const SHAPES: Shape[] = ["round", "oval", "weeping", "conifer"];

export const THIS_YEAR = new Date().getFullYear();
export const HEIGHT_MIN = 3;
export const HEIGHT_MAX = 40;
export const YEAR_MIN = 1750;
