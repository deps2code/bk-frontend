// Popup HTML for a clicked tree.

import { THIS_YEAR } from "./archetypes";
import { isHeightEstimated, isMonumental, type TreeData } from "./loadTrees";
import type { Details } from "./details";

const esc = (s: unknown) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function popupHTML(data: TreeData, details: Details | null, i: number): string {
  const rows: string[] = [];

  if (isMonumental(data, i)) {
    rows.push(`<div class="pp-badge">Monumentale boom</div>`);
  }

  if (details) {
    const t = details.t;
    rows.push(`<div class="pp-species">${esc(details.species[t.sp[i]])}</div>`);
    const latin = details.latin[t.la[i]];
    if (latin !== "—") rows.push(`<div class="pp-latin">${esc(latin)}</div>`);
  } else {
    rows.push(`<div class="pp-species">Gegevens laden…</div>`);
  }

  const h = data.heights[i];
  const est = isHeightEstimated(data, i);
  rows.push(`<div class="pp-row">Hoogte: ≈${h} m${est ? " <span class='pp-muted'>(geschat)</span>" : ""}</div>`);

  const y = data.years[i];
  rows.push(
    y > 0
      ? `<div class="pp-row">Kiemjaar: ${y} <span class="pp-muted">(±${THIS_YEAR - y} jaar oud)</span></div>`
      : `<div class="pp-row pp-muted">Kiemjaar onbekend</div>`,
  );

  if (details) {
    const t = details.t;
    const place = [details.streets[t.st[i]], details.buurten[t.bu[i]], details.stadsdelen[t.sd[i]]]
      .filter((s) => s !== "—");
    if (place.length) rows.push(`<div class="pp-row">${esc(place.join(" · "))}</div>`);
    const owner = details.owners[t.ow[i]];
    const id = details.t.id[i];
    rows.push(
      `<div class="pp-row pp-muted">Boomnr ${esc(id)}${owner !== "—" ? ` · ${esc(owner)}` : ""}</div>`,
    );
  }

  return `<div class="pp">${rows.join("")}</div>`;
}
