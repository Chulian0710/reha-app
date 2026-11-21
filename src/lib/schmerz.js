import { db } from './db.js';
import { plusTage } from './datum.js';

// Schmerz aus dem Tagebuch (0 = kein Schmerz … 10 = stärkster vorstellbarer Schmerz).
// Getrennt von Messreihen vom Typ 'schmerz', die gezielt an einer Stelle messen.

export const SCHMERZ_STUFEN = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

// grün (0) bis rot (10), dunkel genug für weiße Schrift
export const schmerzFarbe = (v) => `hsl(${Math.round(145 - v * 14.5)}, 55%, 36%)`;

export const komma = (v) => String(Math.round(v * 10) / 10).replace('.', ',');
const schnitt = (werte) => werte.reduce((s, w) => s + w, 0) / werte.length;

// Ein Wert je Tag. Bei mehreren Einträgen zählt der höchste.
export function schmerzJeTag(eintraege) {
  const m = {};
  for (const e of eintraege) if (typeof e.schmerz === 'number') m[e.datum] = Math.max(m[e.datum] ?? -1, e.schmerz);
  return Object.entries(m)
    .map(([datum, wert]) => ({ datum, wert }))
    .sort((a, b) => a.datum.localeCompare(b.datum));
}

// Gleitender Durchschnitt über die letzten `tage` Kalendertage (nur Tage mit Wert)
export function gleitend(punkte, tage = 7) {
  return punkte.map((p) => {
    const ab = plusTage(p.datum, -(tage - 1));
    const fenster = punkte.filter((q) => q.datum >= ab && q.datum <= p.datum).map((q) => q.wert);
    return { datum: p.datum, wert: Math.round(schnitt(fenster) * 10) / 10 };
  });
}

// Trainingstage und Tage mit neuer Belastung.
// Neue Belastung: eine Übung zum ersten Mal, oder mehr Gewicht, Strecke oder Dauer als je zuvor.
export async function trainingsInfo() {
  const erledigt = await db.erledigt.toArray();
  const saetze = (await db.saetze.toArray()).filter((s) => s.fertig);
  const uebungVon = new Map((await db.planEintraege.toArray()).map((p) => [p.id, p.uebungId]));

  const training = new Set([...erledigt.map((e) => e.datum), ...saetze.map((s) => s.datum)]);

  const jeTag = {};
  const dazu = (datum, e) => (jeTag[datum] ||= []).push(e);
  for (const e of erledigt) {
    const uebungId = uebungVon.get(e.planEintragId);
    if (uebungId != null) dazu(e.datum, { uebungId });
  }
  for (const s of saetze) if (s.uebungId != null) dazu(s.datum, s);

  const FELDER = ['gewicht', 'strecke', 'dauer'];
  const stand = new Map(); // uebungId -> bisherige Höchstwerte
  const neu = new Set();
  for (const datum of Object.keys(jeTag).sort()) {
    // erst gegen den Stand vor dem Tag prüfen, dann den Stand erweitern
    for (const e of jeTag[datum]) {
      const vorher = stand.get(e.uebungId);
      if (!vorher || FELDER.some((f) => typeof e[f] === 'number' && vorher[f] !== undefined && e[f] > vorher[f])) neu.add(datum);
    }
    for (const e of jeTag[datum]) {
      const s = stand.get(e.uebungId) || {};
      for (const f of FELDER) if (typeof e[f] === 'number') s[f] = Math.max(s[f] ?? -Infinity, e[f]);
      stand.set(e.uebungId, s);
    }
  }
  return { training, neu };
}

export function tagArt(datum, info) {
  const vortag = plusTage(datum, -1);
  return { training: info.training.has(datum), vortagTraining: info.training.has(vortag), vortagNeu: info.neu.has(vortag) };
}

export const MIN_TAGE = 3;

export const VERGLEICHE = [
  {
    id: 'training',
    label: 'Training vs. Ruhe',
    gruppen: [
      { name: 'Trainingstag', satz: 'an Trainingstagen', passt: (t) => t.training },
      { name: 'Tag ohne Training', satz: 'an Tagen ohne Training', passt: (t) => !t.training }
    ]
  },
  {
    id: 'danach',
    label: 'Tag nach Training',
    gruppen: [
      { name: 'Tag nach Training', satz: 'am Tag nach dem Training', passt: (t) => !t.training && t.vortagTraining },
      { name: 'Ruhetag', satz: 'an Ruhetagen', passt: (t) => !t.training && !t.vortagTraining }
    ],
    hinweis: 'Ruhetag: an dem Tag und am Vortag kein Training.'
  },
  {
    id: 'belastung',
    label: 'Neue Belastung',
    gruppen: [
      { name: 'Tag nach neuer Belastung', satz: 'am Tag nach neuer Belastung', passt: (t) => t.vortagNeu },
      { name: 'Tag nach gewohntem Training', satz: 'am Tag nach gewohntem Training', passt: (t) => t.vortagTraining && !t.vortagNeu }
    ],
    hinweis: 'Neue Belastung: eine Übung zum ersten Mal oder mehr Gewicht, Strecke oder Dauer als je zuvor.'
  }
];

export function vergleichen(punkte, info, vergleich) {
  return vergleich.gruppen.map((g) => {
    const werte = punkte.filter((p) => g.passt(tagArt(p.datum, info))).map((p) => p.wert);
    return { ...g, n: werte.length, schnitt: werte.length ? schnitt(werte) : null };
  });
}

// Ein beschreibender Satz, nur wenn beide Gruppen genug Tage haben
export function fazit(gruppen) {
  const [a, b] = gruppen;
  if (a.n < MIN_TAGE || b.n < MIN_TAGE) return null;
  const diff = Math.round((a.schnitt - b.schnitt) * 10) / 10;
  const gross = (s) => s[0].toUpperCase() + s.slice(1);
  if (Math.abs(diff) < 0.5) return `${gross(a.satz)} und ${b.satz} ist dein Schmerz im Schnitt etwa gleich.`;
  const punkte = Math.abs(diff) === 1 ? 'Punkt' : 'Punkte';
  return `${gross(a.satz)} liegt dein Schmerz im Schnitt ${komma(Math.abs(diff))} ${punkte} ${diff > 0 ? 'höher' : 'niedriger'} als ${b.satz}.`;
}

// Anfang und Ende eines Zeitraums vergleichen (je bis zu 7 Einträge), ab 6 Tagen mit Wert
export function trend(punkte) {
  if (punkte.length < 6) return null;
  const k = Math.min(7, Math.floor(punkte.length / 2));
  const anfang = schnitt(punkte.slice(0, k).map((p) => p.wert));
  const zuletzt = schnitt(punkte.slice(-k).map((p) => p.wert));
  return { k, anfang, zuletzt, diff: zuletzt - anfang };
}

export { schnitt };
