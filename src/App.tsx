import { useEffect, useRef, useState } from "react";
import { startGame, type Game } from "./game/game";
import { Hud } from "./hud/Hud";
import { Welcome } from "./hud/Welcome";

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The world starts loading behind the welcome screen; controls stay off
  // until the player chooses to play.
  useEffect(() => {
    try {
      const game = startGame(canvasRef.current!, { controls: false });
      gameRef.current = game;
      return () => {
        game.destroy();
        gameRef.current = null;
      };
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const play = () => {
    gameRef.current?.setControlsEnabled(true);
    setPlaying(true);
    canvasRef.current?.focus();
  };

  return (
    <div className="game">
      <canvas ref={canvasRef} tabIndex={-1} aria-label="Bomenkomen speelveld" />
      {error ? (
        <div className="hud-panel hud-status hud-error">Er ging iets mis: {error}</div>
      ) : playing ? (
        <Hud />
      ) : (
        <Welcome onPlay={play} />
      )}
    </div>
  );
}
