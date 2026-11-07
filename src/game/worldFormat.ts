// Decoder for public/world/c_<cx>_<cy>.bin — format documented in
// scripts/build-world.mjs. Kind enums mirror that script (order = draw order).

export const GROUND_KINDS = ["farmland", "industrial", "grass", "wood", "pitch", "sand", "water", "paved"] as const;
export const LINE_KINDS = ["major", "medium", "minor", "service", "foot", "cycle", "rail", "water"] as const;
export const BUILDING_KINDS = ["generic", "house", "apartments", "commercial", "religious", "industrial", "public", "small"] as const;
export const LABEL_KINDS = ["square", "park", "water", "neighbourhood", "quarter"] as const;
export const NO_NAME = 0xffff;

export interface LineGroup {
  kind: number;
  /** Stroke width in meters. */
  width: number;
  bridge: boolean;
  path: Path2D;
}

export interface Building {
  kind: number;
  /** Meters. */
  height: number;
  /** Rings in chunk-local meters, flat [x0, y0, x1, y1, …]; first is the outer. */
  rings: Float32Array[];
  path: Path2D;
}

export interface Label {
  kind: number;
  name: string;
  /** World position, RD meters. */
  x: number;
  y: number;
}

export interface Chunk {
  cx: number;
  cy: number;
  /** World origin (south-west corner), RD meters. */
  ox: number;
  oy: number;
  /** One combined path per ground kind (index = kind), chunk-local meters, even-odd fill. */
  ground: (Path2D | null)[];
  /** Lines grouped by kind/width/bridge, in draw order. */
  lines: LineGroup[];
  buildings: Building[];
  labels: Label[];
  /** Line name ids present in this chunk, for "where am I" lookups. */
  streetNames: { nameId: number; pts: Float32Array }[];
}

export function decodeChunk(buf: ArrayBuffer, cx: number, cy: number, chunkSize: number, names: string[]): Chunk {
  const dv = new DataView(buf);
  let off = 0;
  const version = dv.getUint8(off);
  if (version !== 1) throw new Error(`chunk ${cx},${cy}: unknown version ${version}`);
  off += 2;
  const nGround = dv.getUint16(off, true);
  const nLines = dv.getUint16(off + 2, true);
  const nBuildings = dv.getUint16(off + 4, true);
  const nLabels = dv.getUint16(off + 6, true);
  off += 8;

  const readPts = (): Float32Array => {
    const n = dv.getUint16(off, true);
    off += 2;
    const pts = new Float32Array(n * 2);
    for (let i = 0; i < n * 2; i++, off += 2) pts[i] = dv.getInt16(off, true) / 10;
    return pts;
  };

  const ground: (Path2D | null)[] = GROUND_KINDS.map(() => null);
  for (let i = 0; i < nGround; i++) {
    const kind = dv.getUint8(off);
    const nRings = dv.getUint8(off + 1);
    off += 2;
    const path = (ground[kind] ??= new Path2D());
    for (let r = 0; r < nRings; r++) addRing(path, readPts());
  }

  const groups = new Map<string, LineGroup>();
  const streetNames: Chunk["streetNames"] = [];
  for (let i = 0; i < nLines; i++) {
    const kind = dv.getUint8(off);
    const bridge = (dv.getUint8(off + 1) & 1) !== 0;
    const width = dv.getUint16(off + 2, true) / 10;
    const nameId = dv.getUint16(off + 4, true);
    off += 6;
    const pts = readPts();
    const key = `${bridge ? 1 : 0}|${kind}|${width}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { kind, width, bridge, path: new Path2D() }));
    g.path.moveTo(pts[0], pts[1]);
    for (let p = 2; p < pts.length; p += 2) g.path.lineTo(pts[p], pts[p + 1]);
    if (nameId !== NO_NAME) streetNames.push({ nameId, pts });
  }
  // non-bridges first, then by kind (draw order), wider first within a kind
  const lines = [...groups.values()].sort(
    (a, b) => Number(a.bridge) - Number(b.bridge) || a.kind - b.kind || b.width - a.width,
  );

  const buildings: Building[] = [];
  for (let i = 0; i < nBuildings; i++) {
    const kind = dv.getUint8(off);
    const nRings = dv.getUint8(off + 1);
    const height = dv.getUint16(off + 2, true) / 10;
    off += 4;
    const rings: Float32Array[] = [];
    const path = new Path2D();
    for (let r = 0; r < nRings; r++) {
      const pts = readPts();
      rings.push(pts);
      addRing(path, pts);
    }
    buildings.push({ kind, height, rings, path });
  }

  const ox = cx * chunkSize;
  const oy = cy * chunkSize;
  const labels: Label[] = [];
  for (let i = 0; i < nLabels; i++, off += 7) {
    labels.push({
      kind: dv.getUint8(off),
      name: names[dv.getUint16(off + 1, true)] ?? "",
      x: ox + dv.getInt16(off + 3, true) / 10,
      y: oy + dv.getInt16(off + 5, true) / 10,
    });
  }

  return { cx, cy, ox, oy, ground, lines, buildings, labels, streetNames };
}

function addRing(path: Path2D, pts: Float32Array) {
  path.moveTo(pts[0], pts[1]);
  for (let p = 2; p < pts.length; p += 2) path.lineTo(pts[p], pts[p + 1]);
  path.closePath();
}
