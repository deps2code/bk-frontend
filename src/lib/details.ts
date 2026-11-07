// Lazy-loaded popup details and search index (string-table encoded).

export interface Details {
  species: string[];
  latin: string[];
  streets: string[];
  buurten: string[];
  stadsdelen: string[];
  owners: string[];
  t: {
    id: (string | number)[];
    sp: number[];
    la: number[];
    st: number[];
    bu: number[];
    sd: number[];
    ow: number[];
  };
}

export interface SearchEntry {
  n: string;
  t: "s" | "b"; // straat | buurt
  /** RD New centroid, meters. */
  x: number;
  y: number;
  c: number;
}

const base = import.meta.env.BASE_URL;

let detailsPromise: Promise<Details> | null = null;
let detailsLoaded: Details | null = null;

/** The details if they have finished loading, without triggering a load. */
export function peekDetails(): Details | null {
  return detailsLoaded;
}

export function getDetails(): Promise<Details> {
  detailsPromise ??= fetch(`${base}data/details.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`details.json: ${r.status}`);
      return r.json() as Promise<Details>;
    })
    .then((d) => (detailsLoaded = d))
    .catch((e) => {
      detailsPromise = null; // allow a retry on the next request
      throw e;
    });
  return detailsPromise;
}

let searchPromise: Promise<SearchEntry[]> | null = null;
export function getSearch(): Promise<SearchEntry[]> {
  searchPromise ??= fetch(`${base}data/search.json`).then((r) => r.json());
  return searchPromise;
}

export function searchPlaces(entries: SearchEntry[], query: string, limit = 8): SearchEntry[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const starts: SearchEntry[] = [];
  const contains: SearchEntry[] = [];
  for (const e of entries) {
    const n = e.n.toLowerCase();
    if (n.startsWith(q)) starts.push(e);
    else if (n.includes(q)) contains.push(e);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}
