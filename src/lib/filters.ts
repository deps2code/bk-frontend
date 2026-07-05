import { ARCHETYPES, HEIGHT_MAX, HEIGHT_MIN, THIS_YEAR, YEAR_MIN } from "./archetypes";
import type { TreeData } from "./loadTrees";

export interface Filters {
  species: boolean[]; // per archetype
  hMin: number;
  hMax: number;
  yMin: number;
  yMax: number;
  monumental: boolean;
}

export function defaultFilters(): Filters {
  return {
    species: new Array(ARCHETYPES.length).fill(true),
    hMin: HEIGHT_MIN,
    hMax: HEIGHT_MAX,
    yMin: YEAR_MIN,
    yMax: THIS_YEAR,
    monumental: false,
  };
}

export function heightRangeActive(f: Filters): boolean {
  return f.hMin > HEIGHT_MIN || f.hMax < HEIGHT_MAX;
}

/** Year filter only participates when the user narrowed the slider; trees
 *  without a known kiemjaar (year 0) are excluded only in that case. */
export function yearRangeActive(f: Filters): boolean {
  return f.yMin > YEAR_MIN || f.yMax < THIS_YEAR;
}

/** GPU filter ranges — wide open unless the slider is narrowed, so trees with
 *  unknown year (0) stay visible by default. */
export function gpuFilterRange(f: Filters): [number, number][] {
  return [
    heightRangeActive(f) ? [f.hMin, f.hMax] : [0, 255],
    yearRangeActive(f) ? [f.yMin, f.yMax] : [0, 65535],
  ];
}

export function gpuFilterCategories(f: Filters): (number[])[] {
  const species = f.species.flatMap((on, i) => (on ? [i] : []));
  return [species, f.monumental ? [1] : [0, 1]];
}

export function treeMatches(data: TreeData, f: Filters, i: number): boolean {
  if (!f.species[data.archetypes[i]]) return false;
  if (f.monumental && !(data.flags[i] & 1)) return false;
  const h = data.heights[i];
  if (heightRangeActive(f) && (h < f.hMin || h > f.hMax)) return false;
  if (yearRangeActive(f)) {
    const y = data.years[i];
    if (y < f.yMin || y > f.yMax) return false; // y=0 (unknown) drops out
  }
  return true;
}

export function countVisible(data: TreeData, f: Filters): number {
  let c = 0;
  for (let i = 0; i < data.count; i++) if (treeMatches(data, f, i)) c++;
  return c;
}
