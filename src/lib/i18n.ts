// UI language (Dutch / English). The choice is persisted per browser; a first
// visit follows the browser language (Dutch if it lists Dutch, else English).
// React reads it with useT(); game code reads t() each frame (cheap lookup).
// Dataset strings (species, streets, buurten, owners) stay as published.

import { useSyncExternalStore } from "react";
import { createStore } from "../game/store";

export type Lang = "nl" | "en";
export const LANGS: Lang[] = ["nl", "en"];

const nl = {
  you: "Jij",
  canvasLabel: "Bomenkomen speelveld",
  errorPrefix: "Er ging iets mis:",
  loadingWorld: "Groningen laden…",
  debugTrees: "bomen in beeld",

  // welcome
  tagline: (n: number) => `Wandel door Groningen langs alle ${fmt(n, "nl")} bomen`,
  login: "Inloggen",
  createAccount: "Account maken",
  register: "Registreren",
  username: "Gebruikersnaam",
  email: "E-mailadres",
  password: "Wachtwoord",
  accountsSoon: "Accounts komen binnenkort. Speel voorlopig als gast — je wandeling wordt nog niet bewaard.",
  or: "of",
  playGuest: "Speel als gast",
  worldLoading: "Groningen wordt geladen…",
  worldReady: "Groningen staat klaar",
  noAccount: "Nog geen account?",
  haveAccount: "Al een account?",

  // HUD
  modeGroup: "Hoe beweeg je?",
  walk: "Lopen",
  bike: "Fietsen",
  searchBtn: "Zoeken (/)",
  mapBtn: "Kaart (M)",
  helpBtn: "Hulp (H)",
  nightBtn: "Nacht (N)",

  // help
  helpTitle: "Zo werkt het",
  helpTouch: [
    ["Sleep", "lopen of fietsen — hoe verder, hoe sneller"],
    ["Tik op een boom", "soort, leeftijd en straat"],
    ["Knijp", "in- en uitzoomen"],
    ["Kaartje", "tik voor de grote kaart en spring ergens heen"],
    ["Maantje", "dag of nacht"],
  ] as [string, string][],
  helpKeys: [
    ["← ↑ ↓ → / WASD", "lopen · Shift = sneller"],
    ["F", "fiets pakken of wegzetten"],
    ["Klik of E", "boom bekijken (E = dichtstbijzijnde)"],
    ["/ · M", "zoeken · grote kaart"],
    ["N", "dag of nacht"],
    ["Scroll", "in- en uitzoomen"],
  ] as [string, string][],
  helpOk: "Oké, op pad!",

  // maps
  openMap: "Kaart openen (M)",
  mapTitle: "Kaart van Groningen",
  close: "Sluiten",
  mapCanvas: "Kaart: klik om daarheen te springen",
  mapNoCoverage: "Daar is (nog) geen kaart van.",
  mapJump: "Klik om erheen te springen",
  monumentalTree: "monumentale boom",

  // search
  searchLabel: "Zoek een straat of buurt",
  searchPlaceholder: "Straat of buurt…",
  searchFailed: "Zoeken lukt nu niet.",
  searchNone: "Niets gevonden in het gebied met kaart.",
  street: "straat",
  buurt: "buurt",
  trees: (n: number) => `${fmt(n, "nl")} ${n === 1 ? "boom" : "bomen"}`,

  // tree card
  loading: "laden…",
  monumental: "Monumentale boom",
  height: "Hoogte",
  approx: (m: number) => `ca.\u00a0${m}\u00a0m`,
  estimated: "geschat",
  seedYear: "Kiemjaar",
  years: (n: number) => `${n} jaar`,
  unknown: "onbekend",
  group: "Soortgroep",
  streetLabel: "Straat",
  buurtLabel: "Buurt",
  owner: "Eigenaar",
  treeNumber: "Boomnummer",
  /** Dataset owner values shown as-is in Dutch; translated where known. */
  ownerName: (o: string) => o,
  detailsFailed: "Details konden niet geladen worden.",
  archetypes: [
    "Eik", "Es", "Linde", "Els", "Esdoorn", "Berk", "Wilg",
    "Populier", "Iep", "Beuk", "Plataan", "Conifeer", "Sierboom", "Overig",
  ],
};

export type Dict = typeof nl;

const en: Dict = {
  you: "You",
  canvasLabel: "Bomenkomen play area",
  errorPrefix: "Something went wrong:",
  loadingWorld: "Loading Groningen…",
  debugTrees: "trees on screen",

  tagline: (n) => `Walk through Groningen past all ${fmt(n, "en")} trees`,
  login: "Log in",
  createAccount: "Create account",
  register: "Sign up",
  username: "Username",
  email: "Email address",
  password: "Password",
  accountsSoon: "Accounts are coming soon. Play as a guest for now — your walk isn't saved yet.",
  or: "or",
  playGuest: "Play as guest",
  worldLoading: "Loading Groningen…",
  worldReady: "Groningen is ready",
  noAccount: "No account yet?",
  haveAccount: "Already have an account?",

  modeGroup: "How do you get around?",
  walk: "Walk",
  bike: "Cycle",
  searchBtn: "Search (/)",
  mapBtn: "Map (M)",
  helpBtn: "Help (H)",
  nightBtn: "Night (N)",

  helpTitle: "How it works",
  helpTouch: [
    ["Drag", "walk or cycle — the further, the faster"],
    ["Tap a tree", "species, age and street"],
    ["Pinch", "zoom in and out"],
    ["Minimap", "tap for the big map and jump anywhere"],
    ["Moon", "day or night"],
  ],
  helpKeys: [
    ["← ↑ ↓ → / WASD", "walk · Shift = faster"],
    ["F", "get on or off the bike"],
    ["Click or E", "inspect a tree (E = nearest)"],
    ["/ · M", "search · big map"],
    ["N", "day or night"],
    ["Scroll", "zoom in and out"],
  ],
  helpOk: "OK, let's go!",

  openMap: "Open map (M)",
  mapTitle: "Map of Groningen",
  close: "Close",
  mapCanvas: "Map: click to jump there",
  mapNoCoverage: "There's no map of that area (yet).",
  mapJump: "Click to jump there",
  monumentalTree: "monumental tree",

  searchLabel: "Search for a street or neighbourhood",
  searchPlaceholder: "Street or neighbourhood…",
  searchFailed: "Search isn't available right now.",
  searchNone: "Nothing found in the mapped area.",
  street: "street",
  buurt: "neighbourhood",
  trees: (n) => `${fmt(n, "en")} ${n === 1 ? "tree" : "trees"}`,

  loading: "loading…",
  monumental: "Monumental tree",
  height: "Height",
  approx: (m) => `c.\u00a0${m}\u00a0m`,
  estimated: "estimated",
  seedYear: "Year planted",
  years: (n) => `${n} ${n === 1 ? "year" : "years"}`,
  unknown: "unknown",
  group: "Tree group",
  streetLabel: "Street",
  buurtLabel: "Neighbourhood",
  owner: "Owner",
  treeNumber: "Tree number",
  ownerName: (o) => ({ Gemeente: "Municipality", Particulier: "Private" })[o] ?? o,
  detailsFailed: "Details couldn't be loaded.",
  // same order as ARCHETYPES (src/lib/archetypes.ts)
  archetypes: [
    "Oak", "Ash", "Linden", "Alder", "Maple", "Birch", "Willow",
    "Poplar", "Elm", "Beech", "Plane", "Conifer", "Ornamental", "Other",
  ],
};

const DICTS: Record<Lang, Dict> = { nl, en };

function fmt(n: number, lang: Lang): string {
  return n.toLocaleString(lang === "nl" ? "nl-NL" : "en-GB");
}

const LANG_KEY = "bomenkomen.lang";

function initialLang(): Lang {
  try {
    const stored = localStorage.getItem(LANG_KEY);
    if (stored === "nl" || stored === "en") return stored;
  } catch {
    // storage blocked: fall through to the browser language
  }
  const prefs = navigator.languages?.length ? navigator.languages : [navigator.language];
  return prefs.some((l) => l?.toLowerCase().startsWith("nl")) ? "nl" : "en";
}

export const language = createStore<{ lang: Lang }>({ lang: initialLang() });

function applyLang() {
  const { lang } = language.get();
  document.documentElement.lang = lang;
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // storage blocked (private mode): the choice just isn't remembered
  }
}
document.documentElement.lang = language.get().lang;
language.subscribe(applyLang);

/** Current dictionary, outside React (game code). */
export function t(): Dict {
  return DICTS[language.get().lang];
}

/** Current dictionary; re-renders on a language switch. */
export function useT(): Dict {
  const lang = useSyncExternalStore(language.subscribe, () => language.get().lang);
  return DICTS[lang];
}
