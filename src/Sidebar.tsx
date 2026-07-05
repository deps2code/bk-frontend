import { useEffect, useRef, useState } from "react";
import { ARCHETYPES, HEIGHT_MAX, HEIGHT_MIN, MONUMENTAL_COLOR, THIS_YEAR, YEAR_MIN } from "./lib/archetypes";
import { defaultFilters, type Filters } from "./lib/filters";
import { getSearch, searchPlaces, type SearchEntry } from "./lib/details";
import type { TreeData } from "./lib/loadTrees";

const fmt = (n: number) => n.toLocaleString("nl-NL");
const rgb = (c: [number, number, number]) => `rgb(${c[0]},${c[1]},${c[2]})`;

interface Props {
  data: TreeData | null;
  filters: Filters;
  setFilters: (f: Filters) => void;
  visible: number;
  onFlyTo: (lon: number, lat: number, zoom: number) => void;
}

export function Sidebar({ data, filters, setFilters, visible, onFlyTo }: Props) {
  const [open, setOpen] = useState(() => window.matchMedia("(min-width: 720px)").matches);

  const isDefault =
    filters.species.every(Boolean) &&
    filters.hMin === HEIGHT_MIN &&
    filters.hMax === HEIGHT_MAX &&
    filters.yMin === YEAR_MIN &&
    filters.yMax === THIS_YEAR &&
    !filters.monumental;

  return (
    <>
      <button className="sb-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? "✕" : "🌳 Filters"}
      </button>
      <aside className={`sidebar${open ? "" : " sidebar-closed"}`}>
        <header>
          <h1>Bomenkomen</h1>
          <p className="sub">Alle gemeentelijke bomen van Groningen in 3D</p>
          {data && (
            <p className="count">
              <strong>{fmt(visible)}</strong> van {fmt(data.count)} bomen zichtbaar
            </p>
          )}
        </header>

        <SearchBox onFlyTo={onFlyTo} />

        <section>
          <div className="sec-head">
            <h2>Soorten</h2>
            <span className="linkish">
              <button onClick={() => setFilters({ ...filters, species: ARCHETYPES.map(() => true) })}>alle</button>
              {" · "}
              <button onClick={() => setFilters({ ...filters, species: ARCHETYPES.map(() => false) })}>geen</button>
            </span>
          </div>
          <ul className="species">
            {ARCHETYPES.map((a, i) => (
              <li key={a.name}>
                <label>
                  <input
                    type="checkbox"
                    checked={filters.species[i]}
                    onChange={() => {
                      const species = filters.species.slice();
                      species[i] = !species[i];
                      setFilters({ ...filters, species });
                    }}
                  />
                  <span className="dot" style={{ background: rgb(a.color) }} />
                  <span className="sp-name">{a.name}</span>
                  {data && <span className="sp-count">{fmt(data.archetypeCounts[i])}</span>}
                </label>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2>
            Hoogte <span className="val">{filters.hMin}–{filters.hMax} m</span>
          </h2>
          <DualRange
            min={HEIGHT_MIN}
            max={HEIGHT_MAX}
            lo={filters.hMin}
            hi={filters.hMax}
            onChange={(hMin, hMax) => setFilters({ ...filters, hMin, hMax })}
          />
        </section>

        <section>
          <h2>
            Kiemjaar <span className="val">{filters.yMin}–{filters.yMax}</span>
          </h2>
          <DualRange
            min={YEAR_MIN}
            max={THIS_YEAR}
            lo={filters.yMin}
            hi={filters.yMax}
            onChange={(yMin, yMax) => setFilters({ ...filters, yMin, yMax })}
          />
          {(filters.yMin > YEAR_MIN || filters.yMax < THIS_YEAR) && (
            <p className="hint">Alleen bomen met een bekend kiemjaar</p>
          )}
        </section>

        <section>
          <label className="mon">
            <input
              type="checkbox"
              checked={filters.monumental}
              onChange={() => setFilters({ ...filters, monumental: !filters.monumental })}
            />
            <span className="dot" style={{ background: rgb(MONUMENTAL_COLOR) }} />
            Alleen monumentale bomen
            {data && <span className="sp-count">{fmt(data.monumentalCount)}</span>}
          </label>
        </section>

        {!isDefault && (
          <button className="reset" onClick={() => setFilters(defaultFilters())}>
            Filters wissen
          </button>
        )}

        <footer>
          Data: gemeente Groningen · kaart © OpenStreetMap
        </footer>
      </aside>
    </>
  );
}

function SearchBox({ onFlyTo }: { onFlyTo: Props["onFlyTo"] }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchEntry[]>([]);
  const [entries, setEntries] = useState<SearchEntry[] | null>(null);
  const requested = useRef(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const ensureEntries = () => {
    if (!requested.current) {
      requested.current = true;
      void getSearch().then(setEntries);
    }
  };

  useEffect(() => {
    setResults(entries ? searchPlaces(entries, q) : []);
  }, [q, entries]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setResults([]);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div className="search" ref={boxRef}>
      <input
        type="search"
        placeholder="Zoek straat of buurt…"
        value={q}
        onFocus={ensureEntries}
        onChange={(e) => {
          ensureEntries();
          setQ(e.target.value);
        }}
      />
      {results.length > 0 && (
        <ul className="results">
          {results.map((r) => (
            <li key={`${r.t}:${r.n}`}>
              <button
                onClick={() => {
                  onFlyTo(r.lon, r.lat, r.t === "s" ? 16.6 : 14.8);
                  setQ("");
                  setResults([]);
                }}
              >
                <span>{r.n}</span>
                <span className="res-meta">
                  {r.t === "s" ? "straat" : "buurt"} · {fmt(r.c)} bomen
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DualRange({
  min,
  max,
  lo,
  hi,
  onChange,
}: {
  min: number;
  max: number;
  lo: number;
  hi: number;
  onChange: (lo: number, hi: number) => void;
}) {
  const pct = (v: number) => ((v - min) / (max - min)) * 100;
  return (
    <div className="dr">
      <div className="dr-track" />
      <div className="dr-fill" style={{ left: `${pct(lo)}%`, right: `${100 - pct(hi)}%` }} />
      <input
        type="range"
        min={min}
        max={max}
        value={lo}
        onChange={(e) => onChange(Math.min(+e.target.value, hi), hi)}
        aria-label="minimum"
      />
      <input
        type="range"
        min={min}
        max={max}
        value={hi}
        onChange={(e) => onChange(lo, Math.max(+e.target.value, lo))}
        aria-label="maximum"
      />
    </div>
  );
}
