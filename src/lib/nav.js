import { writable, get } from 'svelte/store';

// Navigation wie in einer App: Tabs sind Wurzeln, Unterseiten liegen auf einem Stapel.
// Offene Sheets (Pop-ups) liegen darüber. „Zurück“ schließt zuerst das oberste Sheet, dann die Unterseite.
// Damit auch die Zurück-Geste bzw. der Zurück-Knopf des Browsers funktioniert, liegt genau dann ein
// zusätzlicher Eintrag im Browser-Verlauf, wenn es etwas zum Zurückgehen gibt.

export const TABS = ['heute', 'kalender', 'anlegen', 'fortschritt', 'mehr'];

export const TITEL = {
  heute: 'Heute',
  kalender: 'Kalender',
  anlegen: 'Anlegen',
  fortschritt: 'Fortschritt',
  mehr: 'Mehr',
  plan: 'Plan',
  ziele: 'Ziele',
  messwerte: 'Messwerte',
  uebungen: 'Übungen',
  pdfimport: 'PDF-Import',
  tagebuch: 'Tagebuch',
  shop: 'Shop',
  daten: 'Daten',
  betreuer: 'Betreuer'
};

export const ansicht = writable({ seite: 'heute', params: {} });
export const verlauf = writable([]); // frühere Seiten { seite, params, scroll }

const sheets = []; // offene Sheets, oberstes zuletzt
let wache = false; // liegt unser Zusatzeintrag im Browser-Verlauf?
let ignorieren = 0;

const hatZurueck = () => sheets.length > 0 || get(verlauf).length > 0;

function abgleichen() {
  if (typeof history === 'undefined') return;
  if (hatZurueck() && !wache) {
    history.pushState({ reha: true }, '');
    wache = true;
  } else if (!hatZurueck() && wache) {
    wache = false;
    ignorieren++;
    history.back();
  }
  document.documentElement.classList.toggle('sheet-offen', sheets.length > 0);
}

function nachOben(y = 0) {
  setTimeout(() => window.scrollTo(0, y), y ? 60 : 0);
}

export function gehe(seite, params = {}) {
  while (sheets.length) sheets.pop().schliessen();
  const jetzt = get(ansicht);
  let stapel = get(verlauf);
  if (TABS.includes(seite)) stapel = [];
  else {
    const i = stapel.findIndex((s) => s.seite === seite);
    if (i >= 0) stapel = stapel.slice(0, i);
    else if (jetzt.seite !== seite) stapel = [...stapel, { ...jetzt, scroll: window.scrollY }];
  }
  verlauf.set(stapel);
  ansicht.set({ seite, params });
  nachOben();
  abgleichen();
}

function zurueckIntern() {
  if (sheets.length) {
    sheets.pop().schliessen();
    return;
  }
  const stapel = get(verlauf);
  if (!stapel.length) return;
  const ziel = stapel[stapel.length - 1];
  verlauf.set(stapel.slice(0, -1));
  ansicht.set({ seite: ziel.seite, params: ziel.params });
  nachOben(ziel.scroll || 0);
}

export function zurueck() {
  zurueckIntern();
  abgleichen();
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    wache = false;
    if (ignorieren) {
      ignorieren--;
      return;
    }
    zurueckIntern();
    abgleichen();
  });
}

// --- Sheets ---
export function sheetAuf(schliessen) {
  const e = { schliessen };
  sheets.push(e);
  abgleichen();
  return e;
}

export function sheetZu(e) {
  const i = sheets.indexOf(e);
  if (i < 0) return;
  sheets.splice(i, 1);
  abgleichen();
}

export const istOberstesSheet = (e) => sheets[sheets.length - 1] === e;
export const sheetOffen = () => sheets.length > 0;
