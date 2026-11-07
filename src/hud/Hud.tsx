import { useEffect, useState, useSyncExternalStore } from "react";
import type { Game } from "../game/game";
import { controls, hud, type Mode } from "../game/store";
import { FullMap, Minimap } from "./Maps";
import { Help, helpSeen, markHelpSeen } from "./Help";
import { Search } from "./Search";
import { TreeCard } from "./TreeCard";
import { LangSwitch } from "./LangSwitch";
import { useT } from "../lib/i18n";

export function Hud({ game }: { game: Game | null }) {
  const s = useSyncExternalStore(hud.subscribe, hud.get);
  const { mode, night } = useSyncExternalStore(controls.subscribe, controls.get);
  const T = useT();
  const [panel, setPanel] = useState<Panel>(() => (helpSeen() ? null : "help"));
  const toggle = (p: Exclude<Panel, null>) => setPanel((cur) => (cur === p ? null : p));

  // "/" search, M map, H help, Esc closes — not while typing in a field
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (e.key === "/") {
        e.preventDefault();
        setPanel("search");
      } else if (e.code === "KeyM") toggle("map");
      else if (e.code === "KeyH") toggle("help");
      else if (e.key === "Escape") setPanel(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const closeHelp = () => {
    markHelpSeen();
    setPanel(null);
  };

  return (
    <>
      <LocationTag street={s.street} buurt={s.buurt} />
      {s.debug && (
        <div className="hud-panel hud-debug">
          <div className="hud-fps">{s.fps} fps</div>
          <div>
            RD {Math.round(s.x)} / {Math.round(s.y)}
          </div>
          <div>
            chunk {s.chunkX},{s.chunkY} · {s.scale.toFixed(1)} px/m
          </div>
          <div>
            {s.chunksLoaded} chunks · {s.treesDrawn} {T.debugTrees}
          </div>
        </div>
      )}
      {s.loading && <div className="hud-panel hud-status">{T.loadingWorld}</div>}
      {s.error && <div className="hud-panel hud-status hud-error">{T.errorPrefix} {s.error}</div>}

      {game && <Minimap game={game} onOpen={() => setPanel("map")} />}
      <div className="hud-panel hud-mode" role="radiogroup" aria-label={T.modeGroup}>
        <ModeButton mode="walk" current={mode} label={T.walk} icon={WALK} />
        <ModeButton mode="bike" current={mode} label={T.bike} icon={BIKE} />
      </div>
      <div className="hud-buttons">
        <LangSwitch />
        <IconButton label={T.nightBtn} icon={MOON} active={night} onClick={() => controls.set({ night: !night })} />
        <IconButton label={T.searchBtn} icon={SEARCH} active={panel === "search"} onClick={() => toggle("search")} />
        <IconButton label={T.mapBtn} icon={MAP} active={panel === "map"} onClick={() => toggle("map")} />
        <IconButton label={T.helpBtn} icon={HELP} active={panel === "help"} onClick={() => toggle("help")} />
      </div>

      {panel === "search" && game && <Search game={game} onClose={() => setPanel(null)} />}
      {panel !== "search" && <TreeCard />}
      {panel === "map" && game && <FullMap game={game} onClose={() => setPanel(null)} />}
      {panel === "help" && <Help onClose={closeHelp} />}

    </>
  );
}

type Panel = "search" | "map" | "help" | null;

function LocationTag({ street, buurt }: { street: string | null; buurt: string | null }) {
  if (!street && !buurt) return null;
  return (
    <div className="hud-panel hud-place" aria-live="polite">
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d={PIN} />
      </svg>
      <span className="hud-place-street">{street ?? buurt}</span>
      {street && buurt && <span className="hud-place-buurt">{buurt}</span>}
    </div>
  );
}

function IconButton(props: { label: string; icon: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={props.active ? "hud-icon-btn is-active" : "hud-icon-btn"}
      aria-label={props.label}
      aria-pressed={props.active}
      title={props.label}
      onClick={(e) => {
        props.onClick();
        e.currentTarget.blur(); // keep the keyboard for walking
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d={props.icon} />
      </svg>
    </button>
  );
}

const MOON = "M20.3 14.6A8.5 8.5 0 0 1 9.4 3.7 8.5 8.5 0 1 0 20.3 14.6Z";
const PIN = "M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z";
const SEARCH = "M10 3a7 7 0 1 0 4.2 12.6l5.1 5.1 1.4-1.4-5.1-5.1A7 7 0 0 0 10 3Zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z";
const MAP = "m9 3-6 2.3v15.5l6-2.3 6 2.3 6-2.3V3l-6 2.3L9 3Zm1 2.6 4 1.5v11.3l-4-1.5V5.6ZM5 6.7l3-1.1v11.3l-3 1.2V6.7Zm11 .4 3-1.2v11.4l-3 1.1V7.1Z";
const HELP = "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 16a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6Zm1.3-5.2v.7h-2.4v-1c0-1.6 1-2.3 1.8-2.8.6-.4 1-.7 1-1.4 0-.7-.6-1.2-1.6-1.2-1 0-1.7.5-2 1.4L8 7.6C8.6 5.9 10.1 5 12.1 5c2.4 0 4 1.3 4 3.2 0 1.6-1 2.4-1.9 3-.6.4-.9.6-.9 1.6Z";

const WALK =
  "M13.5 5.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM9.8 8.9 7 22h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3A7.3 7.3 0 0 0 19 12v-2a5.4 5.4 0 0 1-4.6-2.6l-1-1.6A2 2 0 0 0 11.7 5c-.3 0-.5 0-.8.1L6 7.2V12h2V8.6l1.8-.7";
const BIKE =
  "M15.5 5.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM5 12a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 8.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Zm5.8-10.4 2.4-2.4.8.8A7 7 0 0 0 19 11V9a5 5 0 0 1-3.6-1.5l-1.9-1.9a2 2 0 0 0-1.4-.6 2 2 0 0 0-1.4.6L7.9 8.4a2 2 0 0 0 0 2.8L11 13.6V19h2v-6.2l-2.2-2.7ZM19 12a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 8.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z";

function ModeButton(props: { mode: Mode; current: Mode; label: string; icon: string }) {
  const active = props.mode === props.current;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      className={active ? "hud-mode-btn is-active" : "hud-mode-btn"}
      onClick={(e) => {
        controls.set({ mode: props.mode });
        e.currentTarget.blur(); // keep arrow keys for walking, not the radio group
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d={props.icon} />
      </svg>
      {props.label}
    </button>
  );
}
