// Procedural low-poly tree meshes for SimpleMeshLayer.
//
// Each mesh is a flat-shaded triangle soup in "unit tree" space: the tree
// stands on z=0 and is exactly 1 unit tall, so getScale = [w, w, height]
// yields a tree of `height` meters. Vertex colors: crown = white (multiplied
// by the per-instance color), trunk = brown (tinted dark by the same
// multiply, which reads fine at this scale).

import type { Shape } from "./archetypes";

export interface TreeMesh {
  attributes: {
    positions: { size: 3; value: Float32Array };
    normals: { size: 3; value: Float32Array };
    colors: { size: 3; value: Float32Array };
  };
}

type V3 = [number, number, number];

const TRUNK_COLOR: V3 = [0.45, 0.36, 0.28];
const CROWN_COLOR: V3 = [1, 1, 1];

class SoupBuilder {
  positions: number[] = [];
  normals: number[] = [];
  colors: number[] = [];

  tri(a: V3, b: V3, c: V3, color: V3) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    for (const p of [a, b, c]) {
      this.positions.push(p[0], p[1], p[2]);
      this.normals.push(nx, ny, nz);
      this.colors.push(color[0], color[1], color[2]);
    }
  }

  build(): TreeMesh {
    return {
      attributes: {
        positions: { size: 3, value: Float32Array.from(this.positions) },
        normals: { size: 3, value: Float32Array.from(this.normals) },
        colors: { size: 3, value: Float32Array.from(this.colors) },
      },
    };
  }
}

// --- primitives -------------------------------------------------------

/** n-sided open prism (trunk). */
function addPrism(s: SoupBuilder, r: number, z0: number, z1: number, sides: number, color: V3) {
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * Math.PI * 2;
    const a1 = ((i + 1) / sides) * Math.PI * 2;
    const p00: V3 = [r * Math.cos(a0), r * Math.sin(a0), z0];
    const p10: V3 = [r * Math.cos(a1), r * Math.sin(a1), z0];
    const p01: V3 = [r * Math.cos(a0), r * Math.sin(a0), z1];
    const p11: V3 = [r * Math.cos(a1), r * Math.sin(a1), z1];
    s.tri(p00, p10, p11, color);
    s.tri(p00, p11, p01, color);
  }
}

/** n-sided open cone (conifer tier). */
function addCone(s: SoupBuilder, r: number, zBase: number, zApex: number, sides: number, color: V3) {
  const apex: V3 = [0, 0, zApex];
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * Math.PI * 2;
    const a1 = ((i + 1) / sides) * Math.PI * 2;
    const p0: V3 = [r * Math.cos(a0), r * Math.sin(a0), zBase];
    const p1: V3 = [r * Math.cos(a1), r * Math.sin(a1), zBase];
    s.tri(p0, p1, apex, color);
  }
}

// Icosahedron (12 verts, 20 faces) — the crown blob.
const T = (1 + Math.sqrt(5)) / 2;
const ICO_V: V3[] = (
  [
    [-1, T, 0], [1, T, 0], [-1, -T, 0], [1, -T, 0],
    [0, -1, T], [0, 1, T], [0, -1, -T], [0, 1, -T],
    [T, 0, -1], [T, 0, 1], [-T, 0, -1], [-T, 0, 1],
  ] as V3[]
).map((v) => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l] as V3;
});
const ICO_F = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
  [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
  [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
];

/** Slightly irregular icosahedral blob: radii (rx, rz), center height cz. */
function addBlob(s: SoupBuilder, rx: number, rz: number, cz: number, seed: number, color: V3) {
  const verts = ICO_V.map((v, i) => {
    // deterministic per-vertex bump for an organic silhouette
    const k = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
    const bump = 0.86 + 0.28 * (k - Math.floor(k));
    return [v[0] * rx * bump, v[1] * rx * bump, cz + v[2] * rz * bump] as V3;
  });
  for (const [a, b, c] of ICO_F) s.tri(verts[a], verts[b], verts[c], color);
}

// --- tree archetypes --------------------------------------------------

function buildTree(shape: Shape): TreeMesh {
  const s = new SoupBuilder();
  addPrism(s, 0.028, 0, 0.5, 6, TRUNK_COLOR);
  switch (shape) {
    case "round":
      addBlob(s, 0.33, 0.33, 0.67, 1, CROWN_COLOR);
      break;
    case "oval":
      addBlob(s, 0.24, 0.36, 0.62, 2, CROWN_COLOR);
      break;
    case "weeping":
      addBlob(s, 0.42, 0.28, 0.58, 3, CROWN_COLOR);
      break;
    case "conifer":
      addCone(s, 0.3, 0.16, 0.66, 7, CROWN_COLOR);
      addCone(s, 0.22, 0.5, 1.0, 7, CROWN_COLOR);
      break;
  }
  return s.build();
}

export function buildMeshes(): Record<Shape, TreeMesh> {
  return {
    round: buildTree("round"),
    oval: buildTree("oval"),
    weeping: buildTree("weeping"),
    conifer: buildTree("conifer"),
  };
}
