import { db, getEinstellung } from './db.js';
import { heute } from './datum.js';

// Standardregeln. Im Betreuer-Bereich änderbar (Einstellung 'xpRegeln').
export const STANDARD_REGELN = {
  uebungXp: 7, // pro geplanter Übung, wenn im Plan kein eigener Wert steht
  aktivitaetXp: 10, // „Etwas anderes“ (eigene Aktivität); die festen Aktivitäten haben je einen eigenen Wert
  bestwertXp: 30, // neuer persönlicher Bestwert (Kraft)
  zielXp: 50, // Ziel erreicht
  physioXp: 25, // Physiotherapie besucht, höchstens einmal pro Tag (ref 'physio:<datum>')
  bestwertProWoche: true, // höchstens ein Bestwert-Bonus pro Übung, Seite und Woche
  ruhetagModus: 'letzte', // 'letzte' = so viel wie die letzte Trainingseinheit, 'fest' = ruhetagXp
  ruhetagXp: 7,
  messungXp: 0, // höchstens einmal pro Tag
  tagebuchXp: 0, // höchstens einmal pro Tag
  gelsProLevel: 10, // Gels je Level-Aufstieg, wenn für das Level nichts eigenes eingetragen ist (auch nach der letzten Stufe)
  gelsProAbzeichen: 5 // Vorschlag für neue Abzeichen (jedes Abzeichen hat seinen eigenen Wert)
};

// Aktivitäten auf der ersten Seite, im Betreuer-Bereich änderbar (Einstellung 'aktivitaeten')
export const STANDARD_AKTIVITAETEN = [
  { name: 'Kochen', xp: 10 },
  { name: 'Gemalt oder etwas Kreatives', xp: 10 },
  { name: 'Mittagsschlaf oder Ausruhen', xp: 10 },
  { name: 'Ausflug', xp: 10 },
  { name: 'Frische Luft / Spaziergang', xp: 10 }
];

export async function aktivitaeten() {
  const a = await getEinstellung('aktivitaeten');
  return Array.isArray(a) ? a : STANDARD_AKTIVITAETEN;
}

// XP für einen eingetragenen Ruhetag
export async function ruhetagPunkte(datum, r) {
  if (r.ruhetagModus === 'fest') return r.ruhetagXp;
  return (await letzteTrainingsXp(datum)) ?? r.uebungXp;
}

// Level 1 ab 0 XP, Level 2 ab 50 XP usw. Danach wächst der Abstand je Level um 100 XP.
export const STANDARD_SCHWELLEN = [0, 50, 200, 450, 800];

export async function regeln() {
  return { ...STANDARD_REGELN, ...((await getEinstellung('xpRegeln')) || {}) };
}

export async function schwellen() {
  const s = await getEinstellung('levelSchwellen');
  return Array.isArray(s) && s.length ? s : STANDARD_SCHWELLEN;
}

// Gels je Level (Einstellung 'levelGels', Index 0 = Level 1, das es geschenkt gibt).
// Fehlt ein Wert (z. B. nach der letzten Stufe), gilt gelsProLevel aus den Regeln.
export async function levelGels() {
  const g = await getEinstellung('levelGels');
  return Array.isArray(g) ? g : [];
}

export function gelsFuerLevel(liste, level, r) {
  const v = liste[level - 1];
  return v === undefined || v === null || v === '' ? Number(r.gelsProLevel) || 0 : Number(v) || 0;
}

// XP-Wert, ab dem ein Level beginnt. Über die Liste hinaus geht die Kurve offen weiter.
export function schwelleFuer(liste, level) {
  if (level <= liste.length) return liste[level - 1];
  let wert = liste[liste.length - 1];
  let abstand = liste.length > 1 ? liste[liste.length - 1] - liste[liste.length - 2] : 50;
  for (let l = liste.length + 1; l <= level; l++) {
    abstand += 100;
    wert += abstand;
  }
  return wert;
}

export function levelInfo(xp, liste) {
  let level = 1;
  while (xp >= schwelleFuer(liste, level + 1)) level++;
  const start = schwelleFuer(liste, level);
  const naechster = schwelleFuer(liste, level + 1);
  return { level, start, naechster, fortschritt: (xp - start) / (naechster - start) };
}

// Vergibt XP. Mit ref wird dieselbe Aktion nur einmal gezählt. Gibt false zurück, wenn schon vergeben.
export async function xpVergeben(grund, punkte, ref = null, datum = heute()) {
  if (ref && (await db.xpLog.where('ref').equals(ref).count())) return false;
  await xpEintragen(grund, punkte, datum, ref);
  return true;
}

// Trägt XP ein und gibt die id des Eintrags zurück.
export async function xpEintragen(grund, punkte, datum = heute(), ref = null) {
  const eintrag = { datum, grund, punkte, zeit: Date.now() };
  if (ref) eintrag.ref = ref;
  return db.xpLog.add(eintrag);
}

export async function xpEntfernen(ref) {
  await db.xpLog.where('ref').equals(ref).delete();
}

// Ist der neue Wert höher als alle bisherigen dieser Reihe und Seite?
export async function istBestwert(reiheId, seite, wert) {
  const alle = await db.werte.where('reiheId').equals(reiheId).toArray();
  const gleiche = alle.filter((w) => w.seite === seite);
  if (gleiche.length === 0) return false;
  return wert > Math.max(...gleiche.map((w) => w.wert));
}

// XP der letzten Trainingseinheit vor einem Datum (für Ruhetage). null, wenn es noch keine gab.
export async function letzteTrainingsXp(vorDatum) {
  const eintraege = await db.xpLog.where('ref').startsWith('uebung:').toArray();
  const frueher = eintraege.filter((e) => e.datum < vorDatum);
  if (!frueher.length) return null;
  const letzter = frueher.reduce((m, e) => (e.datum > m ? e.datum : m), '');
  return frueher.filter((e) => e.datum === letzter).reduce((s, e) => s + e.punkte, 0);
}

// Verdiente XP (bestimmen Level, Abzeichen und Briefe) und Gels (zum Einlösen im Shop).
// Gels gibt es für Level-Aufstiege, Abzeichen und als Geschenk (siehe gels.js), nicht direkt für XP.
export async function punktestand() {
  const log = await db.xpLog.toArray();
  const gelLog = await db.gelLog.toArray();
  const einl = await db.einloesungen.toArray();
  const verdient = log.reduce((s, e) => s + e.punkte, 0);
  const gesammelt = gelLog.reduce((s, g) => s + g.gels, 0);
  const ausgegeben = einl.reduce((s, e) => s + e.kosten, 0);
  return { verdient, gels: gesammelt - ausgegeben, gelsGesammelt: gesammelt, gelsAusgegeben: ausgegeben };
}

// Physio-Besuch eintragen (Aktivität auf „Heute“ oder Physio-Termin abhaken). Pro Tag nur einmal.
export async function physioEintragen(datum, r) {
  return xpVergeben('Physiotherapie', r.physioXp, `physio:${datum}`, datum);
}

export async function physioEntfernen(datum) {
  await xpEntfernen(`physio:${datum}`);
}
