import { useEffect, useRef, useState } from "react";
import { startGame } from "./game/game";
import { Hud } from "./hud/Hud";

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const game = startGame(canvasRef.current!);
      return () => game.destroy();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  return (
    <div className="game">
      <canvas ref={canvasRef} aria-label="Bomenkomen speelveld" />
      {error ? <div className="hud-panel hud-debug">Er ging iets mis: {error}</div> : <Hud />}
    </div>
  );
}
