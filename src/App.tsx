import { useEffect, useRef, useState } from "react";
import { startGame, type Game } from "./game/game";
import { Hud } from "./hud/Hud";
import { getDetails } from "./lib/details";
import { Welcome } from "./hud/Welcome";

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The world starts loading behind the welcome screen; controls stay off
  // until the player chooses to play.
  useEffect(() => {
    try {
      const g = startGame(canvasRef.current!, { controls: false });
      setGame(g);
      return () => {
        g.destroy();
        setGame(null);
      };
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const play = () => {
    // warm the tree-details cache (3 MB) while the player looks around
    if ("requestIdleCallback" in window) requestIdleCallback(() => void getDetails().catch(() => {}));
    game?.setControlsEnabled(true);
    setPlaying(true);
    canvasRef.current?.focus();
  };

  return (
    <div className="game">
      <canvas ref={canvasRef} tabIndex={-1} aria-label="Bomenkomen speelveld" />
      {error ? (
        <div className="hud-panel hud-status hud-error">Er ging iets mis: {error}</div>
      ) : playing ? (
        <Hud game={game} />
      ) : (
        <Welcome onPlay={play} />
      )}
    </div>
  );
}
