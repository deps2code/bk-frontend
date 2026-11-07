// Welcome screen shown over the (already loading) world. Accounts need a
// backend that doesn't exist yet, so login/signup are UI only: submitting
// says so and points to guest play.

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { hud } from "../game/store";
import { useT } from "../lib/i18n";
import { LangSwitch } from "./LangSwitch";

type Mode = "login" | "signup";

export function Welcome({ onPlay }: { onPlay: () => void }) {
  const [mode, setMode] = useState<Mode>("login");
  const [notice, setNotice] = useState(false);
  const loading = useSyncExternalStore(hud.subscribe, () => hud.get().loading);
  const playRef = useRef<HTMLButtonElement>(null);
  const T = useT();

  useEffect(() => playRef.current?.focus(), []);

  const switchMode = (m: Mode) => {
    setMode(m);
    setNotice(false);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setNotice(true);
  };

  const login = mode === "login";

  return (
    <div className="welcome" role="dialog" aria-modal="true" aria-labelledby="wl-title">
      <LangSwitch className="lang-switch-welcome" />
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
          <p className="wl-tagline">{T.tagline(124990)}</p>

          <h2 className="wl-heading">{login ? T.login : T.createAccount}</h2>
          <form className="wl-form" onSubmit={submit}>
            <Field icon="user" label={T.username} name="username" autoComplete="username" />
            {!login && <Field icon="mail" label={T.email} name="email" type="email" autoComplete="email" />}
            <Field
              icon="lock"
              label={T.password}
              name="password"
              type="password"
              autoComplete={login ? "current-password" : "new-password"}
            />
            <button type="submit" className="wl-btn wl-btn-wood">
              {login ? T.login : T.register}
            </button>
          </form>
          {notice && (
            <p className="wl-notice" role="status">
              {T.accountsSoon}
            </p>
          )}

          <div className="wl-or">
            <span>{T.or}</span>
          </div>

          <button ref={playRef} type="button" className="wl-btn wl-btn-play" onClick={onPlay}>
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
            </svg>
            {T.playGuest}
          </button>
          <p className="wl-load" aria-live="polite">
            {loading ? T.worldLoading : T.worldReady}
          </p>

          <p className="wl-switch">
            {login ? T.noAccount : T.haveAccount}{" "}
            <button type="button" className="wl-link" onClick={() => switchMode(login ? "signup" : "login")}>
              {login ? T.register : T.login}
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
