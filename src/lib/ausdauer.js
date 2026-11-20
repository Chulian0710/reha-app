import { BIBLIOTHEK } from './bibliothek.js';

// Ausdauer-Übungen werden nicht mit Gewicht × Wiederholungen erfasst, sondern mit Dauer (Minuten) und Strecke.
// Die Strecke hat je Übung eine Einheit: Schwimmen in Metern, sonst Kilometer (Feld einheit an der Übung).

export const EINHEITEN = { km: 'Kilometer', m: 'Meter' };

export function istAusdauer(uebung) {
  return uebung?.kategorie === 'ausdauer';
}

export function streckeEinheit(uebung) {
  if (uebung?.einheit) return uebung.einheit;
  const name = String(uebung?.name || '').trim().toLowerCase();
  return BIBLIOTHEK.find((b) => b.name.toLowerCase() === name)?.einheit || 'km';
}

export const zahl1 = (v) => String(Math.round(v * 100) / 100).replace('.', ',');

// „30 min · 12,5 km“ – leere Werte fallen weg
export function ausdauerText(w, einheit) {
  const teile = [];
  if (w.dauer !== null && w.dauer !== undefined && w.dauer !== '') teile.push(`${zahl1(Number(w.dauer))} min`);
  if (w.strecke !== null && w.strecke !== undefined && w.strecke !== '') teile.push(`${zahl1(Number(w.strecke))} ${einheit}`);
  return teile.join(' · ');
}
