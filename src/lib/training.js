import { db } from './db.js';
import { kw } from './datum.js';
import { xpVergeben, xpEntfernen } from './xp.js';

export const zahl = (v) => (v === '' || v === null || v === undefined ? null : Number(String(v).replace(',', '.')));

// Planübung als erledigt markieren und XP vergeben
export async function abhaken(e, datum, r) {
  try {
    await db.erledigt.add({ datum, planEintragId: e.id });
  } catch {
    return false; // schon erledigt
  }
  await xpVergeben(`Übung: ${e.uebung?.name ?? 'Übung'}`, e.xp ?? r.uebungXp, `uebung:${datum}:${e.id}`, datum);
  return true;
}

export async function zuruecknehmen(e, datum) {
  await db.erledigt.where('[datum+planEintragId]').equals([datum, e.id]).delete();
  await xpEntfernen(`uebung:${datum}:${e.id}`);
}

// Vorschlag für die Sätze: wie beim letzten Training dieser Übung, sonst aus dem Plan
export async function vorschlagSaetze(e, datum) {
  const vorher = (await db.saetze.where('uebungId').equals(e.uebungId).toArray()).filter((s) => s.datum < datum);
  if (vorher.length) {
    const letzter = vorher.reduce((m, s) => (s.datum > m ? s.datum : m), '');
    return vorher
      .filter((s) => s.datum === letzter)
      .sort((a, b) => a.nr - b.nr)
      .map((s) => ({ gewicht: s.gewicht, wdh: s.wdh }));
  }
  return Array.from({ length: e.saetze || 1 }, () => ({ gewicht: e.gewicht ?? null, wdh: e.wdh ?? null }));
}

// Neuer Bestwert, wenn das Gewicht höher ist als jeder bisher erledigte Satz dieser Übung
export async function istSatzBestwert(uebungId, satzId, gewicht) {
  if (gewicht === null || Number.isNaN(gewicht)) return false;
  const andere = (await db.saetze.where('uebungId').equals(uebungId).toArray()).filter(
    (s) => s.id !== satzId && s.fertig && s.gewicht !== null
  );
  if (!andere.length) return false;
  return gewicht > Math.max(...andere.map((s) => s.gewicht));
}

export async function satzBestwertXp(uebung, satzId, datum, r) {
  const ref = r.bestwertProWoche ? `bestwert:uebung:${uebung.id}:${kw(datum)}` : `bestwert:satz:${satzId}`;
  return xpVergeben(`Neuer Bestwert: ${uebung.name}`, r.bestwertXp, ref, datum);
}

export function satzText(s) {
  const g = s.gewicht !== null && s.gewicht !== undefined ? `${String(s.gewicht).replace('.', ',')} kg × ` : '';
  return `${g}${s.wdh ?? '?'}`;
}
