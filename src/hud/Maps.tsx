// Minimap (bottom-right, tap to open) and the full map overlay (click to
// teleport). The game paints both canvases every frame; React only owns the
// elements and turns clicks into teleports.

import { useEffect, useRef, useState } from "react";
import type { Game } from "../game/game";

export function Minimap({ game, onOpen }: { game: Game; onOpen: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    game.setMinimapCanvas(ref.current);
    return () => game.setMinimapCanvas(null);
  }, [game]);
  return (
    <button type="button" className="hud-minimap" aria-label="Kaart openen (M)" title="Kaart openen (M)" onClick={onOpen}>
      <canvas ref={ref} aria-hidden />
    </button>
  );
}

export function FullMap({ game, onClose }: { game: Game; onClose: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    game.setMapCanvas(ref.current);
    return () => game.setMapCanvas(null);
  }, [game]);

  const jump = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const p = game.mapToWorld(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    if (!p) return;
    if (!game.covers(p.x, p.y)) return setNote("Daar is (nog) geen kaart van.");
    game.teleport(p.x, p.y);
    onClose();
  };

  return (
    <div className="hud-overlay" onClick={onClose}>
      <section className="hud-sheet map-sheet" aria-labelledby="map-title" onClick={(e) => e.stopPropagation()}>
        <header className="sheet-head">
          <h2 id="map-title">Kaart van Groningen</h2>
          <button type="button" className="tc-close" aria-label="Sluiten" onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6Z" />
            </svg>
          </button>
        </header>
        <canvas ref={ref} className="map-canvas" onClick={jump} aria-label="Kaart: klik om daarheen te springen" />
        <p className="sheet-foot">
          {note ?? (
            <>
              Klik om erheen te springen · <span className="gold-dot" aria-hidden /> monumentale boom
            </>
          )}
        </p>
      </section>
    </div>
  );
}
