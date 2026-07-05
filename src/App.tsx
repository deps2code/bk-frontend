import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type maplibregl from "maplibre-gl";
import { MapView } from "./MapView";
import { Sidebar } from "./Sidebar";
import { loadTrees, type TreeData } from "./lib/loadTrees";
import { countVisible, defaultFilters, type Filters } from "./lib/filters";
import { getDetails } from "./lib/details";
import { readHash, updateHash } from "./lib/urlState";

export default function App() {
  const [data, setData] = useState<TreeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(() => readHash().filters ?? defaultFilters());
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    loadTrees(`${import.meta.env.BASE_URL}data/trees.bin`)
      .then((d) => {
        setData(d);
        // warm the popup-details cache once the map is idle
        if ("requestIdleCallback" in window) requestIdleCallback(() => void getDetails());
        else setTimeout(() => void getDetails(), 4000);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    updateHash({ filters });
  }, [filters]);

  const visible = useMemo(() => (data ? countVisible(data, filters) : 0), [data, filters]);

  const flyTo = useCallback((lon: number, lat: number, zoom: number) => {
    mapRef.current?.flyTo({ center: [lon, lat], zoom, duration: 1800 });
  }, []);

  return (
    <div className="app">
      <MapView data={data} filters={filters} onMapReady={(m) => (mapRef.current = m)} />
      <Sidebar data={data} filters={filters} setFilters={setFilters} visible={visible} onFlyTo={flyTo} />
      {!data && !error && (
        <div className="overlay-msg">
          <div className="spinner" aria-hidden />
          124.990 bomen laden…
        </div>
      )}
      {error && <div className="overlay-msg overlay-error">Er ging iets mis: {error}</div>}
    </div>
  );
}
