// "Zo werkt het" — controls card, shown once on the first visit and on demand
// via the ? button (H). Touch devices get gestures instead of keys.

import { useT } from "../lib/i18n";

const SEEN_KEY = "bomenkomen.help-seen";

export function helpSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function markHelpSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // storage blocked: the card simply shows again next visit
  }
}

export function Help({ onClose }: { onClose: () => void }) {
  const touch = window.matchMedia("(pointer: coarse)").matches;
  const T = useT();
  const rows = touch ? T.helpTouch : T.helpKeys;
  return (
    <section className="hud-sheet help-sheet" aria-labelledby="help-title">
      <h2 id="help-title">{T.helpTitle}</h2>
      <dl>
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <button type="button" className="wl-btn wl-btn-play help-ok" onClick={onClose} autoFocus>
        {T.helpOk}
      </button>
    </section>
  );
}
