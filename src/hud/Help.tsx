// "Zo werkt het" — controls card, shown once on the first visit and on demand
// via the ? button (H). Touch devices get gestures instead of keys.

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
  const rows: [string, string][] = touch
    ? [
        ["Sleep", "lopen of fietsen — hoe verder, hoe sneller"],
        ["Tik op een boom", "soort, leeftijd en straat"],
        ["Knijp", "in- en uitzoomen"],
        ["Kaartje", "tik voor de grote kaart en spring ergens heen"],
      ]
    : [
        ["← ↑ ↓ → / WASD", "lopen · Shift = sneller"],
        ["F", "fiets pakken of wegzetten"],
        ["Klik of E", "boom bekijken (E = dichtstbijzijnde)"],
        ["/ · M", "zoeken · grote kaart"],
        ["Scroll", "in- en uitzoomen"],
      ];
  return (
    <section className="hud-sheet help-sheet" aria-labelledby="help-title">
      <h2 id="help-title">Zo werkt het</h2>
      <dl>
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <button type="button" className="wl-btn wl-btn-play help-ok" onClick={onClose} autoFocus>
        Oké, op pad!
      </button>
    </section>
  );
}
