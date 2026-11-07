// Welcome screen shown over the (already loading) world. Accounts need a
// backend that doesn't exist yet, so login/signup are UI only: submitting
// says so and points to guest play.

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { hud } from "../game/store";

type Mode = "login" | "signup";

export function Welcome({ onPlay }: { onPlay: () => void }) {
  const [mode, setMode] = useState<Mode>("login");
  const [notice, setNotice] = useState<string | null>(null);
  const loading = useSyncExternalStore(hud.subscribe, () => hud.get().loading);
  const playRef = useRef<HTMLButtonElement>(null);

  useEffect(() => playRef.current?.focus(), []);

  const switchMode = (m: Mode) => {
    setMode(m);
    setNotice(null);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setNotice("Accounts komen binnenkort. Speel voorlopig als gast — je wandeling wordt nog niet bewaard.");
  };

  const login = mode === "login";

  return (
    <div className="welcome" role="dialog" aria-modal="true" aria-labelledby="wl-title">
      <div className="wl-board">
        <div className="wl-plank" aria-hidden />
        <Leaf className="wl-leaf wl-leaf-1" />
        <Leaf className="wl-leaf wl-leaf-2" />
        <Leaf className="wl-leaf wl-leaf-3" />
        <h1 id="wl-title" className="wl-title">
          <span className="wl-title-top">Bomen</span>
          <span className="wl-title-bottom">komen</span>
        </h1>

        <div className="wl-scroll">
          <p className="wl-tagline">Wandel door Groningen langs alle 124.990 bomen</p>

          <h2 className="wl-heading">{login ? "Inloggen" : "Account maken"}</h2>
          <form className="wl-form" onSubmit={submit}>
            <Field icon="user" label="Gebruikersnaam" name="username" autoComplete="username" />
            {!login && <Field icon="mail" label="E-mailadres" name="email" type="email" autoComplete="email" />}
            <Field
              icon="lock"
              label="Wachtwoord"
              name="password"
              type="password"
              autoComplete={login ? "current-password" : "new-password"}
            />
            <button type="submit" className="wl-btn wl-btn-wood">
              {login ? "Inloggen" : "Registreren"}
            </button>
          </form>
          {notice && (
            <p className="wl-notice" role="status">
              {notice}
            </p>
          )}

          <div className="wl-or">
            <span>of</span>
          </div>

          <button ref={playRef} type="button" className="wl-btn wl-btn-play" onClick={onPlay}>
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
            </svg>
            Speel als gast
          </button>
          <p className="wl-load" aria-live="polite">
            {loading ? "Groningen wordt geladen…" : "Groningen staat klaar"}
          </p>

          <p className="wl-switch">
            {login ? "Nog geen account?" : "Al een account?"}{" "}
            <button type="button" className="wl-link" onClick={() => switchMode(login ? "signup" : "login")}>
              {login ? "Registreren" : "Inloggen"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

const ICONS = {
  user: "M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0 2c-4.4 0-8 2.4-8 5.4V21h16v-1.6c0-3-3.6-5.4-8-5.4Z",
  lock: "M7 10V7.5a5 5 0 0 1 10 0V10h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h1Zm2 0h6V7.5a3 3 0 0 0-6 0V10Zm3 4a1.5 1.5 0 0 0-.75 2.8V18h1.5v-1.2A1.5 1.5 0 0 0 12 14Z",
  mail: "M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm1.4 2L12 12.2 19.6 7H4.4ZM20 8.9l-7.4 5a1 1 0 0 1-1.2 0L4 8.9V17h16V8.9Z",
};

function Field(props: {
  icon: keyof typeof ICONS;
  label: string;
  name: string;
  type?: string;
  autoComplete: string;
}) {
  return (
    <label className="wl-field">
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d={ICONS[props.icon]} />
      </svg>
      <span className="wl-sr">{props.label}</span>
      <input name={props.name} type={props.type ?? "text"} placeholder={props.label} autoComplete={props.autoComplete} />
    </label>
  );
}

function Leaf({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 64 40" aria-hidden>
      <path d="M2 20C14 4 40 0 62 20 40 40 14 36 2 20Z" />
      <path d="M2 20h56" className="wl-leaf-vein" />
    </svg>
  );
}
