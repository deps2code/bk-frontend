// deck.gl layer factory: dots at low zoom, instanced 3D trees at high zoom.
//
// Layers use virtual data ({length}) + accessors over the typed arrays. The
// data object identities are stable (created once in loadTrees), so deck
// generates attributes exactly once; filter changes only touch uniforms and
// the category bitmask via DataFilterExtension.

import { ScatterplotLayer } from "@deck.gl/layers";
import { SimpleMeshLayer } from "@deck.gl/mesh-layers";
import { DataFilterExtension } from "@deck.gl/extensions";
import type { Layer, PickingInfo } from "@deck.gl/core";
import { ARCHETYPES, MONUMENTAL_COLOR, SHAPES } from "./archetypes";
import { jitter, type TreeData } from "./loadTrees";
import type { TreeMesh } from "./meshes";
import type { Shape } from "./archetypes";
import type { DetailSelection } from "./lod";
import { gpuFilterCategories, gpuFilterRange, type Filters } from "./filters";

const DOT_FADE_START = 13.8;
const DOT_FADE_END = 15.0;
const MESH_MIN_ZOOM = 13.4;

export interface TreeMeshes {
  base: Record<Shape, TreeMesh>;
  detail: Record<Shape, TreeMesh>;
}

/** Map a deck picking result back to the global tree index (-1 if not a tree). */
export function pickedGlobalIndex(data: TreeData, info: PickingInfo | null): number {
  if (!info || info.index < 0 || !info.layer) return -1;
  const id = info.layer.id;
  if (id === "tree-dots") return info.index;
  if (id.startsWith("trees-hi-")) return -1; // not pickable; defensive
  if (id.startsWith("trees-")) return data.shapeIndices[id.slice(6) as Shape][info.index];
  return -1;
}

/** Accessors shared by the base and detail mesh layers; `idx` maps the layer's local index to the global tree index. */
function meshAccessors(data: TreeData, idx: Uint32Array, colorOf: (g: number) => [number, number, number]) {
  return {
    getPosition: (_: unknown, { index, target }: any) => {
      const g = idx[index];
      target[0] = data.lon[g];
      target[1] = data.lat[g];
      target[2] = 0;
      return target;
    },
    getColor: (_: unknown, { index }: any) => colorOf(idx[index]),
    getOrientation: (_: unknown, { index, target }: any) => {
      target[0] = 0;
      target[1] = jitter(idx[index], 1) * 360; // yaw
      target[2] = 0;
      return target;
    },
    getScale: (_: unknown, { index, target }: any) => {
      const g = idx[index];
      const h = data.heights[g];
      const w = h * (0.82 + 0.36 * jitter(g, 2));
      target[0] = w;
      target[1] = w;
      target[2] = h * (0.92 + 0.16 * jitter(g, 3));
      return target;
    },
    getFilterValue: (_: unknown, { index, target }: any) => {
      const g = idx[index];
      target[0] = data.heights[g];
      target[1] = data.years[g];
      return target;
    },
    getFilterCategory: (_: unknown, { index, target }: any) => {
      const g = idx[index];
      target[0] = data.archetypes[g];
      target[1] = data.flags[g] & 1;
      return target;
    },
  };
}

export function buildTreeLayers(
  data: TreeData,
  filters: Filters,
  zoom: number,
  meshes: TreeMeshes,
  detail: DetailSelection | null,
  beforeId?: string,
): Layer[] {
  const ext = new DataFilterExtension({ filterSize: 2, categorySize: 2 });
  const filterProps = {
    extensions: [ext],
    filterRange: gpuFilterRange(filters),
    filterCategories: gpuFilterCategories(filters),
    ...(beforeId ? { beforeId } : {}),
  };

  const colorOf = (g: number): [number, number, number] =>
    data.flags[g] & 1 ? MONUMENTAL_COLOR : ARCHETYPES[data.archetypes[g]].color;

  const layers: Layer[] = [];

  // --- dots (whole-city species map) ---
  const dotOpacity = Math.min(1, Math.max(0, (DOT_FADE_END - zoom) / (DOT_FADE_END - DOT_FADE_START)));
  if (dotOpacity > 0) {
    layers.push(
      new ScatterplotLayer({
        id: "tree-dots",
        data: data.dotsData,
        pickable: true,
        opacity: dotOpacity * 0.85,
        radiusUnits: "meters",
        radiusMinPixels: 1.3,
        radiusMaxPixels: 20,
        stroked: false,
        getPosition: (_: unknown, { index, target }: any) => {
          target[0] = data.lon[index];
          target[1] = data.lat[index];
          target[2] = 0;
          return target;
        },
        getRadius: (_: unknown, { index }: any) => data.heights[index] * 0.32,
        getFillColor: (_: unknown, { index }: any) => colorOf(index),
        getFilterValue: (_: unknown, { index, target }: any) => {
          target[0] = data.heights[index];
          target[1] = data.years[index];
          return target;
        },
        getFilterCategory: (_: unknown, { index, target }: any) => {
          target[0] = data.archetypes[index];
          target[1] = data.flags[index] & 1;
          return target;
        },
        ...filterProps,
      } as any),
    );
  }

  // --- instanced 3D trees, one layer per crown shape ---
  if (zoom >= MESH_MIN_ZOOM) {
    for (const shape of SHAPES) {
      const idx = data.shapeIndices[shape];
      if (idx.length === 0) continue;
      layers.push(
        new SimpleMeshLayer({
          id: `trees-${shape}`,
          data: data.shapeData[shape],
          mesh: meshes.base[shape] as any,
          pickable: true,
          ...meshAccessors(data, idx, colorOf),
          ...filterProps,
        } as any),
      );
    }

    // --- detailed meshes over the near-camera subset (lod.ts) ---
    // Drawn on top of the base mesh of the same tree; not pickable — picking
    // and hover keep going through the base layers, which cover every tree.
    if (detail) {
      for (const shape of SHAPES) {
        const idx = detail.indices[shape];
        if (idx.length === 0) continue;
        layers.push(
          new SimpleMeshLayer({
            id: `trees-hi-${shape}`,
            data: detail.data[shape],
            mesh: meshes.detail[shape] as any,
            pickable: false,
            ...meshAccessors(data, idx, colorOf),
            ...filterProps,
          } as any),
        );
      }
    }
  }

  return layers;
}
