// MapLibre basemap + interleaved deck.gl overlay with the tree layers.

import { useCallback, useEffect, useMemo, useRef } from "react";
import maplibregl from "maplibre-gl";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { buildTreeLayers, pickedGlobalIndex } from "./lib/layers";
import { buildDetailMeshes, buildMeshes } from "./lib/meshes";
import { DETAIL_MIN_ZOOM, selectDetail, type DetailSelection } from "./lib/lod";
import type { TreeData } from "./lib/loadTrees";
import type { Filters } from "./lib/filters";
import { getDetails, type Details } from "./lib/details";
import { popupHTML } from "./lib/popup";
import { readHash, updateHash, type Camera } from "./lib/urlState";

const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
// Grote Markt, tilted view
const DEFAULT_CAMERA: Camera = { lon: 6.5673, lat: 53.2187, zoom: 15.4, pitch: 52, bearing: -17 };

interface Props {
  data: TreeData | null;
  filters: Filters;
  onMapReady: (map: maplibregl.Map) => void;
}

export function MapView({ data, filters, onMapReady }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const detailsRef = useRef<Details | null>(null);
  const labelLayerRef = useRef<string | undefined>(undefined);
  const detailRef = useRef<DetailSelection | null>(null);
  const meshes = useMemo(() => ({ base: buildMeshes(), detail: buildDetailMeshes() }), []);

  const dataRef = useRef(data);
  dataRef.current = data;
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const clickTree = useCallback((i: number) => {
    const map = mapRef.current;
    const d = dataRef.current;
    if (!map || !d) return;
    popupRef.current?.remove();
    const popup = new maplibregl.Popup({ offset: 12, maxWidth: "300px" })
      .setLngLat([d.lon[i], d.lat[i]])
      .setHTML(popupHTML(d, detailsRef.current, i))
      .addTo(map);
    popupRef.current = popup;
    if (!detailsRef.current) {
      void getDetails().then((det) => {
        detailsRef.current = det;
        if (popupRef.current === popup && popup.isOpen()) popup.setHTML(popupHTML(d, det, i));
      });
    }
  }, []);

  const refresh = useCallback(() => {
    const map = mapRef.current;
    const d = dataRef.current;
    if (!map || !d || !overlayRef.current) return;
    overlayRef.current.setProps({
      layers: buildTreeLayers(d, filtersRef.current, map.getZoom(), meshes, detailRef.current, labelLayerRef.current),
    });
  }, [meshes]);

  // Reselect which trees get the detailed mesh — on moveend/data only, never per frame.
  const updateDetail = useCallback(() => {
    const map = mapRef.current;
    const d = dataRef.current;
    if (!map || !d || map.getZoom() < DETAIL_MIN_ZOOM) {
      detailRef.current = null;
      return;
    }
    const b = map.getBounds();
    const c = map.getCenter();
    detailRef.current = selectDetail(d, {
      west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth(),
      clon: c.lng, clat: c.lat,
    });
  }, []);

  useEffect(() => {
    const cam = readHash().camera ?? DEFAULT_CAMERA;
    updateHash({ camera: cam }); // seed so a filter change never writes a camera-less hash
    const map = new maplibregl.Map({
      container: containerRef.current!,
      style: STYLE_URL,
      center: [cam.lon, cam.lat],
      zoom: cam.zoom,
      pitch: cam.pitch,
      bearing: cam.bearing,
      maxPitch: 70,
      maxBounds: [[6.25, 52.98], [7.0, 53.45]],
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");

    const overlay = new MapboxOverlay({
      interleaved: true,
      onHover: (info) => {
        map.getCanvas().style.cursor = info.picked ? "pointer" : "";
      },
    });
    map.addControl(overlay);
    overlayRef.current = overlay;
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__overlay = overlay;

    map.on("style.load", () => {
      const style = map.getStyle();
      const srcId = Object.keys(style.sources).find((id) => style.sources[id].type === "vector");
      labelLayerRef.current = style.layers.find((l) => l.type === "symbol")?.id;
      if (srcId && !map.getLayer("3d-buildings")) {
        // Fixed sun (anchor: map) so wall shading doesn't rotate with the camera.
        map.setLight({ anchor: "map", position: [1.3, 210, 35], intensity: 0.35 });
        // OpenMapTiles ships render_height: 0 when OSM has no height data —
        // extruding that literally makes the building invisible. Give those a
        // per-building pseudo-random 5-9 m instead of a uniform default.
        const rawHeight: unknown = ["coalesce", ["get", "render_height"], 0];
        const heightExpr: unknown = [
          "case",
          ["<=", rawHeight, 1],
          ["+", 5, ["%", ["to-number", ["id"]], 5]],
          rawHeight,
        ];
        // Muted Groningen facade palette (brick, sand, plaster), hashed off the
        // feature id — quiet variation, trees stay the only saturated color.
        const colorExpr: unknown = [
          "match",
          ["%", ["to-number", ["id"]], 6],
          0, "#d8cfc2",
          1, "#cfc6bb",
          2, "#d3c2b4",
          3, "#c8bfb6",
          4, "#dcd5c9",
          5, "#c4b6a8",
          "#d0c8bd",
        ];
        map.addLayer(
          {
            id: "3d-buildings",
            type: "fill-extrusion",
            source: srcId,
            "source-layer": "building",
            minzoom: 13.4,
            paint: {
              "fill-extrusion-color": colorExpr as any,
              "fill-extrusion-height": heightExpr as any,
              "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
              "fill-extrusion-vertical-gradient": true,
            },
          },
          labelLayerRef.current,
        );
      }
      refresh();
    });

    // deck's own gesture-based click path is unreliable in interleaved mode;
    // route clicks through maplibre and pick manually.
    map.on("click", (e) => {
      const d = dataRef.current;
      if (!d) return;
      const info = overlay.pickObject({ x: e.point.x, y: e.point.y, radius: 4 });
      const g = pickedGlobalIndex(d, info);
      if (g >= 0) clickTree(g);
    });

    map.on("move", refresh);
    map.on("moveend", () => {
      updateDetail();
      refresh();
      const c = map.getCenter();
      updateHash({
        camera: { lon: c.lng, lat: c.lat, zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() },
      });
    });

    onMapReady(map);
    return () => {
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    updateDetail(); // data just arrived (or map recreated) — seed the detail set
    refresh();
  }, [data, updateDetail, refresh]);
  useEffect(refresh, [filters, refresh]);

  return <div ref={containerRef} className="map" />;
}
