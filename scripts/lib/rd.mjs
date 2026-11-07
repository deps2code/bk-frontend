// WGS84 <-> RD New (EPSG:28992) via the approximation polynomials of
// Schreutelkamp & Strang van Hees (Geodesia 2001). Accurate to well under a
// meter across the Netherlands — measured against the tree dataset's own
// X/Y_COORDINAAT by build-world.mjs.

const X0 = 155000, Y0 = 463000, PHI0 = 52.1551744, LAM0 = 5.38720621;

// [p, q, coefficient] for dPhi^p * dLam^q
const R = [[0, 1, 190094.945], [1, 1, -11832.228], [2, 1, -114.221], [0, 3, -32.391], [1, 0, -0.705],
  [3, 1, -2.34], [1, 3, -0.608], [0, 2, -0.008], [2, 3, 0.148]];
const S = [[1, 0, 309056.544], [0, 2, 3638.893], [2, 0, 73.077], [1, 2, -157.984], [3, 0, 59.788],
  [0, 1, 0.433], [2, 2, -6.439], [1, 1, -0.032], [0, 4, 0.092], [1, 4, -0.054]];
// [p, q, coefficient] for dX^p * dY^q
const K = [[0, 1, 3235.65389], [2, 0, -32.58297], [0, 2, -0.2475], [2, 1, -0.84978], [0, 3, -0.0655],
  [2, 2, -0.01709], [1, 0, -0.00738], [4, 0, 0.0053], [2, 3, -0.00039], [4, 1, 0.00033], [1, 1, -0.00012]];
const L = [[1, 0, 5260.52916], [1, 1, 105.94684], [1, 2, 2.45656], [3, 0, -0.81885], [1, 3, 0.05594],
  [3, 1, -0.05607], [0, 1, 0.01199], [3, 2, -0.00256], [1, 4, 0.00128], [0, 2, 0.00022], [2, 0, -0.00022],
  [5, 0, 0.00026]];

const poly = (terms, a, b) => terms.reduce((s, [p, q, c]) => s + c * a ** p * b ** q, 0);

/** WGS84 lon/lat (degrees) -> RD [x, y] meters. */
export function toRD(lon, lat) {
  const dPhi = 0.36 * (lat - PHI0);
  const dLam = 0.36 * (lon - LAM0);
  return [X0 + poly(R, dPhi, dLam), Y0 + poly(S, dPhi, dLam)];
}

/** RD x/y meters -> WGS84 [lon, lat] degrees. */
export function fromRD(x, y) {
  const dX = (x - X0) * 1e-5;
  const dY = (y - Y0) * 1e-5;
  return [LAM0 + poly(L, dX, dY) / 3600, PHI0 + poly(K, dX, dY) / 3600];
}
