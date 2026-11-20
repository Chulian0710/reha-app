import { db } from './db.js';
import { heute } from './datum.js';
import { regeln, xpVergeben, xpEntfernen } from './xp.js';
import { istAusdauer } from './ausdauer.js';

// Standard-Messstellen für den Umfang, jeweils links und rechts
export const UMFANG_STELLEN = ['Wade', 'Wade angespannt', 'Oberschenkel unten', 'Oberschenkel oben', 'Po'];

// Legt fehlende Umfang-Messreihen an und gibt alle Umfang-Reihen in der Standard-Reihenfolge zurück.
export async function umfangReihen() {
  return db.transaction('rw', db.reihen, async () => {
    const alle = (await db.reihen.toArray()).filter((r) => r.typ === 'umfang');
    for (const name of UMFANG_STELLEN) {
      if (!alle.some((r) => r.name.toLowerCase() === name.toLowerCase())) {
        const id = await db.reihen.add({ name, typ: 'umfang', einheit: 'cm', uebungId: null });
        alle.push({ id, name, typ: 'umfang', einheit: 'cm' });
      }
    }
    const rang = (r) => {
      const i = UMFANG_STELLEN.findIndex((n) => n.toLowerCase() === r.name.toLowerCase());
      return i < 0 ? 99 : i;
    };
    return alle.sort((a, b) => rang(a) - rang(b) || a.name.localeCompare(b.name, 'de'));
  });
}

// Je Übung: schwerster abgehakter Satz { gewicht, wdh, datum } und (Ausdauer) weiteste Strecke an einem Tag { strecke }
export async function bestwerteJeUebung() {
  const fertig = (await db.saetze.toArray()).filter((s) => s.fertig);
  const best = {};
  for (const s of fertig) {
    if (s.gewicht === null || s.gewicht === undefined) continue;
    const b = best[s.uebungId];
    if (!b || b.gewicht === undefined || s.gewicht > b.gewicht || (s.gewicht === b.gewicht && (s.wdh ?? 0) > (b.wdh ?? 0))) {
      best[s.uebungId] = { ...b, gewicht: s.gewicht, wdh: s.wdh, datum: s.datum };
    }
  }
  const strecken = {};
  for (const s of fertig) {
    if (s.strecke === null || s.strecke === undefined) continue;
    const k = `${s.uebungId}|${s.datum}`;
    strecken[k] = (strecken[k] ?? 0) + s.strecke;
  }
  for (const [k, wert] of Object.entries(strecken)) {
    const id = Number(k.split('|')[0]);
    best[id] = { ...best[id], strecke: Math.max(best[id]?.strecke ?? 0, Math.round(wert * 100) / 100) };
  }
  return best;
}

// Aktueller Stand eines Ziels mit Messwert
async function aktuellerWert(z, best, uebung) {
  if (z.quelle === 'uebung') return (istAusdauer(uebung) ? best[z.uebungId]?.strecke : best[z.uebungId]?.gewicht) ?? null;
  if (z.quelle === 'reihe') {
    const werte = (await db.werte.where('reiheId').equals(z.reiheId).toArray()).filter((w) => !z.seite || w.seite === z.seite);
    if (!werte.length) return null;
    werte.sort((a, b) => a.datum.localeCompare(b.datum) || a.id - b.id);
    return werte[werte.length - 1].wert;
  }
  const v = z.verlauf || [];
  return v.length ? v[v.length - 1].wert : null;
}

export function erfuellt(z, aktuell) {
  if (aktuell === null || aktuell === undefined) return false;
  const start = z.start ?? 0;
  return z.ziel >= start ? aktuell >= z.ziel : aktuell <= z.ziel;
}

// Anteil 0…1 zwischen Ausgangswert (leer = 0) und Zielwert
export function anteil(z, aktuell) {
  if (z.art !== 'mess') return z.erreicht ? 1 : 0;
  if (aktuell === null || aktuell === undefined) return 0;
  const start = z.start ?? 0;
  if (z.ziel === start) return erfuellt(z, aktuell) ? 1 : 0;
  return Math.max(0, Math.min(1, (aktuell - start) / (z.ziel - start)));
}

// Alle Ziele mit aktuellem Wert und Anteil. Offene zuerst (nach Frist), dann erreichte (neueste zuerst).
export async function zieleMitStand() {
  const ziele = await db.ziele.toArray();
  const best = await bestwerteJeUebung();
  const uebungen = await db.uebungen.bulkGet(ziele.map((z) => z.uebungId ?? 0));
  const reihen = await db.reihen.bulkGet(ziele.map((z) => z.reiheId ?? 0));
  const liste = [];
  for (const [i, z] of ziele.entries()) {
    const aktuell = z.art === 'mess' ? await aktuellerWert(z, best, uebungen[i]) : null;
    liste.push({ ...z, uebung: uebungen[i], reihe: reihen[i], aktuell, anteil: anteil(z, aktuell) });
  }
  return liste.sort((a, b) => {
    if (!!a.erreicht !== !!b.erreicht) return a.erreicht ? 1 : -1;
    if (a.erreicht) return b.erreicht.localeCompare(a.erreicht);
    return (a.frist || '9999').localeCompare(b.frist || '9999') || a.id - b.id;
  });
}

// Prüft offene Ziele mit Messwert. Erreichte werden mit Datum gespeichert und geben XP.
// Gibt die Titel der neu erreichten Ziele zurück.
export async function zielePruefen(datum = heute()) {
  const offen = (await zieleMitStand()).filter((z) => z.art === 'mess' && !z.erreicht && erfuellt(z, z.aktuell));
  if (!offen.length) return [];
  const r = await regeln();
  for (const z of offen) await zielAbhaken(z, datum, r);
  return offen.map((z) => z.titel);
}

export async function zielAbhaken(z, datum = heute(), r = null) {
  r = r || (await regeln());
  await db.ziele.update(z.id, { erreicht: datum });
  await xpVergeben(`Ziel erreicht: ${z.titel}`, r.zielXp, `ziel:${z.id}`, datum);
}

export async function zielZuruecknehmen(z) {
  await db.ziele.update(z.id, { erreicht: null });
  await xpEntfernen(`ziel:${z.id}`);
}

export const zahlText = (v) => (v === null || v === undefined ? '–' : String(Math.round(v * 10) / 10).replace('.', ','));
