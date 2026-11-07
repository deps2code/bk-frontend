// Street / neighbourhood search (search.json) with teleport. Only places
// inside the built map region are offered.

import { useEffect, useMemo, useRef, useState } from "react";
import type { Game } from "../game/game";
import { useT } from "../lib/i18n";
import { getSearch, searchPlaces, type SearchEntry } from "../lib/details";

export function Search({ game, onClose }: { game: Game; onClose: () => void }) {
  const [entries, setEntries] = useState<SearchEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const T = useT();

  useEffect(() => {
    input.current?.focus();
    getSearch()
      .then((all) => setEntries(all.filter((e) => game.covers(e.x, e.y))))
      .catch(() => setFailed(true));
  }, [game]);

  const results = useMemo(() => (entries ? searchPlaces(entries, q, 8) : []), [entries, q]);
  useEffect(() => setActive(0), [q]);

  const go = (e: SearchEntry) => {
    game.teleport(e.x, e.y);
    onClose();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") setActive((a) => Math.min(results.length - 1, a + 1));
    else if (e.key === "ArrowUp") setActive((a) => Math.max(0, a - 1));
    else if (e.key === "Enter" && results[active]) go(results[active]);
    else if (e.key === "Escape") onClose();
    else return;
    e.preventDefault();
  };

  return (
    <section className="hud-sheet search-sheet" role="search">
      <label className="search-field">
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M10 3a7 7 0 1 0 4.2 12.6l5.1 5.1 1.4-1.4-5.1-5.1A7 7 0 0 0 10 3Zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z" />
        </svg>
        <span className="wl-sr">{T.searchLabel}</span>
        <input
          ref={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          placeholder={T.searchPlaceholder}
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls="search-results"
        />
      </label>
      {failed && <p className="search-note">{T.searchFailed}</p>}
      {!failed && q.trim().length >= 2 && entries && results.length === 0 && (
        <p className="search-note">{T.searchNone}</p>
      )}
      {results.length > 0 && (
        <ul id="search-results" className="search-results" role="listbox">
          {results.map((e, k) => (
            <li key={`${e.t}:${e.n}`} role="option" aria-selected={k === active}>
              <button type="button" className={k === active ? "is-active" : ""} onClick={() => go(e)} onMouseEnter={() => setActive(k)}>
                <span className="search-name">{e.n}</span>
                <span className="search-meta">
                  {e.t === "s" ? T.street : T.buurt} · {T.trees(e.c)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
