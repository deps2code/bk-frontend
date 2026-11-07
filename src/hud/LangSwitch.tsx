// NL | EN segmented toggle, top-right on both the welcome screen and the HUD.

import { useSyncExternalStore } from "react";
import { LANGS, language } from "../lib/i18n";

export function LangSwitch({ className = "" }: { className?: string }) {
  const { lang } = useSyncExternalStore(language.subscribe, language.get);
  return (
    <div className={`lang-switch ${className}`} role="radiogroup" aria-label="Taal / Language">
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={l === lang}
          lang={l}
          title={l === "nl" ? "Nederlands" : "English"}
          className={l === lang ? "lang-btn is-active" : "lang-btn"}
          onClick={(e) => {
            language.set({ lang: l });
            e.currentTarget.blur(); // keep the keyboard for walking
          }}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
