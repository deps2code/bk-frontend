// Info card for the selected tree. Numeric facts come with the selection;
// names, street and owner come from the lazily loaded details.json.

import { useEffect, useState, useSyncExternalStore } from "react";
import { selection, type TreeFacts } from "../game/store";
import { ARCHETYPES, THIS_YEAR } from "../lib/archetypes";
import { useT } from "../lib/i18n";
import { getDetails, type Details } from "../lib/details";

export function TreeCard() {
  const { tree } = useSyncExternalStore(selection.subscribe, selection.get);
  const [details, setDetails] = useState<Details | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!tree || details) return;
    getDetails()
      .then(setDetails)
      .catch(() => setFailed(true));
  }, [tree, details]);

  if (!tree) return null;
  return <Card tree={tree} details={details} failed={failed} />;
}

function Card({ tree, details, failed }: { tree: TreeFacts; details: Details | null; failed: boolean }) {
  const arch = ARCHETYPES[tree.archetype];
  const i = tree.index;
  const d = details?.t;
  const species = d ? details!.species[d.sp[i]] : null;
  const latin = d ? details!.latin[d.la[i]] : null;
  const loading = !details && !failed;
  const T = useT();
  const group = T.archetypes[tree.archetype] ?? arch.name;

  return (
    <section className="tree-card" aria-labelledby="tree-card-title" aria-busy={loading}>
      <button type="button" className="tc-close" aria-label={T.close} onClick={() => selection.set({ tree: null })}>
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6Z" />
        </svg>
      </button>
      <header className="tc-head">
        <span className="tc-swatch" style={{ background: `rgb(${arch.color.join(",")})` }} aria-hidden />
        <div>
          <h2 id="tree-card-title" className="tc-title">
            {species && species !== "—" ? species : group}
          </h2>
          {latin && latin !== "—" && <p className="tc-latin">{latin}</p>}
          {loading && <p className="tc-latin">{T.loading}</p>}
        </div>
      </header>

      {tree.monumental && (
        <p className="tc-badge">
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9Z" />
          </svg>
          {T.monumental}
        </p>
      )}

      <dl className="tc-facts">
        <Fact label={T.height}>
          {T.approx(tree.height)}
          {tree.heightEstimated && <span className="tc-tag">{T.estimated}</span>}
        </Fact>
        <Fact label={T.seedYear}>
          {tree.year > 0 ? `${tree.year} · ${T.years(THIS_YEAR - tree.year)}` : T.unknown}
        </Fact>
        <Fact label={T.group}>{group}</Fact>
        {d && (
          <>
            <Fact label={T.streetLabel}>{details!.streets[d.st[i]]}</Fact>
            <Fact label={T.buurtLabel}>{details!.buurten[d.bu[i]]}</Fact>
            <Fact label={T.owner}>{T.ownerName(details!.owners[d.ow[i]])}</Fact>
            <Fact label={T.treeNumber}>{String(d.id[i] || "—")}</Fact>
          </>
        )}
      </dl>
      {failed && <p className="tc-note">{T.detailsFailed}</p>}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="tc-fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
