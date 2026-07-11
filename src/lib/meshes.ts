// Procedural low-poly tree meshes for SimpleMeshLayer.
//
// Each mesh is a flat-shaded triangle soup in "unit tree" space: the tree
// stands on z=0 and is exactly 1 unit tall, so getScale = [w, w, height]
// yields a tree of `height` meters. Vertex colors: crown = white (multiplied
// by the per-instance color), trunk = brown (tinted dark by the same
// multiply, which reads fine at this scale).
//
// Two detail levels share this contract:
// - buildMeshes(): ~30 tris/tree, drawn for ALL trees (stable layers).
// - buildDetailMeshes(): ~120-200 tris/tree, drawn only for the near-camera
//   subset selected in lod.ts, on top of the base mesh. Both are opaque and
//   same-colored, so the base mesh merging into the detailed silhouette is
//   invisible — no containment guarantee needed.

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

// --- detailed variants (near-camera LOD) ------------------------------

const frac = (x: number) => x - Math.floor(x);
/** Deterministic hash noise in [0, 1). */
const hnoise = (i: number, seed: number) => frac(Math.sin(i * 127.1 + seed * 311.7) * 43758.5453);

/**
 * Per-face brightness for crown faces: darker near the crown bottom (cheap
 * baked ambient occlusion) plus hash noise so lobes read as foliage clumps.
 */
function crownShade(cz: number, zLo: number, zHi: number, seed: number, face: number): V3 {
  const t = Math.max(0, Math.min(1, (cz - zLo) / (zHi - zLo)));
  const k = 0.72 + 0.3 * t + (hnoise(face, seed) - 0.5) * 0.14;
  return [k, k, k];
}

/** Open tapered tube between two points (trunk, branches). */
function addTube(s: SoupBuilder, a: V3, b: V3, r0: number, r1: number, sides: number, color: V3) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz) || 1;
  const d: V3 = [dx / len, dy / len, dz / len];
  const ref: V3 = Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  let ux = d[1] * ref[2] - d[2] * ref[1];
  let uy = d[2] * ref[0] - d[0] * ref[2];
  let uz = d[0] * ref[1] - d[1] * ref[0];
  const ul = Math.hypot(ux, uy, uz) || 1;
  ux /= ul; uy /= ul; uz /= ul;
  const vx = d[1] * uz - d[2] * uy;
  const vy = d[2] * ux - d[0] * uz;
  const vz = d[0] * uy - d[1] * ux;
  const ring = (c: V3, r: number, ang: number): V3 => [
    c[0] + (ux * Math.cos(ang) + vx * Math.sin(ang)) * r,
    c[1] + (uy * Math.cos(ang) + vy * Math.sin(ang)) * r,
    c[2] + (uz * Math.cos(ang) + vz * Math.sin(ang)) * r,
  ];
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * Math.PI * 2;
    const a1 = ((i + 1) / sides) * Math.PI * 2;
    s.tri(ring(a, r0, a0), ring(a, r0, a1), ring(b, r1, a1), color);
    s.tri(ring(a, r0, a0), ring(b, r1, a1), ring(b, r1, a0), color);
  }
}

/** Icosahedral blob with offset center and baked per-face crown shading. */
function addShadedBlob(s: SoupBuilder, rx: number, rz: number, c: V3, seed: number, zLo: number, zHi: number) {
  const verts = ICO_V.map((v, i) => {
    const bump = 0.9 + 0.2 * hnoise(i, seed);
    return [c[0] + v[0] * rx * bump, c[1] + v[1] * rx * bump, c[2] + v[2] * rz * bump] as V3;
  });
  ICO_F.forEach(([a, b, cc], fi) => {
    const cz = (verts[a][2] + verts[b][2] + verts[cc][2]) / 3;
    s.tri(verts[a], verts[b], verts[cc], crownShade(cz, zLo, zHi, seed, fi));
  });
}

/** Conifer tier: open cone with radial bumps and per-face shading. */
function addShadedCone(s: SoupBuilder, r: number, zBase: number, zApex: number, sides: number, seed: number, k0: number) {
  const apex: V3 = [0, 0, zApex];
  const rim = (i: number): V3 => {
    const ang = ((i % sides) / sides) * Math.PI * 2;
    const b = 0.92 + 0.16 * hnoise(i % sides, seed);
    return [r * b * Math.cos(ang), r * b * Math.sin(ang), zBase];
  };
  for (let i = 0; i < sides; i++) {
    const k = k0 + (hnoise(i, seed + 5) - 0.5) * 0.1;
    s.tri(rim(i), rim(i + 1), apex, [k, k, k]);
  }
}

function buildDetailTree(shape: Shape): TreeMesh {
  const s = new SoupBuilder();

  if (shape === "conifer") {
    addTube(s, [0, 0, 0], [0, 0, 0.3], 0.04, 0.016, 7, TRUNK_COLOR);
    // stacked tiers, darker toward the bottom
    addShadedCone(s, 0.36, 0.12, 0.46, 10, 1, 0.74);
    addShadedCone(s, 0.3, 0.34, 0.68, 10, 2, 0.82);
    addShadedCone(s, 0.22, 0.55, 0.86, 10, 3, 0.9);
    addShadedCone(s, 0.13, 0.74, 1.0, 10, 4, 0.98);
    return s.build();
  }

  // tapered trunk + branch stubs reaching into the crown
  addTube(s, [0, 0, 0], [0, 0, 0.55], 0.045, 0.022, 7, TRUNK_COLOR);
  addTube(s, [0, 0, 0.38], [0.16, 0.08, 0.6], 0.016, 0.007, 4, TRUNK_COLOR);
  addTube(s, [0, 0, 0.44], [-0.13, -0.12, 0.64], 0.014, 0.006, 4, TRUNK_COLOR);
  addTube(s, [0, 0, 0.32], [-0.02, 0.15, 0.52], 0.012, 0.006, 4, TRUNK_COLOR);

  switch (shape) {
    case "round":
      addShadedBlob(s, 0.34, 0.32, [0, 0, 0.66], 11, 0.3, 1.0);
      addShadedBlob(s, 0.22, 0.2, [0.18, 0.08, 0.6], 12, 0.3, 1.0);
      addShadedBlob(s, 0.21, 0.19, [-0.16, 0.13, 0.63], 13, 0.3, 1.0);
      addShadedBlob(s, 0.2, 0.18, [-0.04, -0.18, 0.58], 14, 0.3, 1.0);
      addShadedBlob(s, 0.19, 0.17, [0.02, 0.03, 0.84], 15, 0.3, 1.0);
      break;
    case "oval":
      addShadedBlob(s, 0.26, 0.24, [0, 0, 0.5], 21, 0.25, 1.0);
      addShadedBlob(s, 0.28, 0.26, [0.03, -0.02, 0.68], 22, 0.25, 1.0);
      addShadedBlob(s, 0.2, 0.22, [-0.02, 0.02, 0.87], 23, 0.25, 1.0);
      addShadedBlob(s, 0.15, 0.13, [0.16, 0.1, 0.62], 24, 0.25, 1.0);
      break;
    case "weeping": {
      addShadedBlob(s, 0.28, 0.22, [0, 0, 0.66], 31, 0.2, 1.0);
      addShadedBlob(s, 0.18, 0.14, [0, 0, 0.85], 32, 0.2, 1.0);
      // curtain of drooping lobes around the rim
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2 + (hnoise(i, 33) - 0.5) * 0.5;
        const rr = 0.27 + 0.05 * hnoise(i, 34);
        addShadedBlob(
          s, 0.11, 0.2,
          [Math.cos(ang) * rr, Math.sin(ang) * rr, 0.46 - 0.06 * hnoise(i, 35)],
          36 + i, 0.2, 1.0,
        );
      }
      break;
    }
  }
  return s.build();
}

export function buildDetailMeshes(): Record<Shape, TreeMesh> {
  return {
    round: buildDetailTree("round"),
    oval: buildDetailTree("oval"),
    weeping: buildDetailTree("weeping"),
    conifer: buildDetailTree("conifer"),
  };
}
