import { useSyncExternalStore } from "react";
import { hud } from "../game/store";

export function Hud() {
  const s = useSyncExternalStore(hud.subscribe, hud.get);
  return (
    <>
      <div className="hud-panel hud-debug">
        <div className="hud-fps">{s.fps} fps</div>
        <div>
          RD {Math.round(s.x)} / {Math.round(s.y)}
        </div>
        <div>
          chunk {s.chunkX},{s.chunkY} · {s.scale.toFixed(1)} px/m
        </div>
        <div>
          {s.chunksLoaded} chunks · {s.treesDrawn} bomen in beeld
        </div>
      </div>
      {s.loading && <div className="hud-panel hud-status">Groningen laden…</div>}
      {s.error && <div className="hud-panel hud-status hud-error">Er ging iets mis: {s.error}</div>}
      <div className="hud-panel hud-hint">
        <kbd>←</kbd>
        <kbd>↑</kbd>
        <kbd>↓</kbd>
        <kbd>→</kbd> of <kbd>WASD</kbd> lopen · <kbd>Shift</kbd> rennen · scroll zoomen · <kbd>G</kbd> raster
      </div>
    </>
  );
}
