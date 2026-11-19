import { db, getEinstellung, setEinstellung, neueUid } from './db.js';
import { levelInfo, schwellen } from './xp.js';

export const BEDINGUNGEN = {
  uebung: 'Eine bestimmte Übung',
  messwerte: 'Messwerte eingetragen',
  trainingstage: 'Trainingstage',
  bestwerte: 'Bestwerte (alle Übungen)',
  ziele: 'Ziele erreicht',
  level: 'Level erreicht'
};

// Bei typ 'uebung': welche Übung (Feld uebung = Name, damit es auch nach einem Pack-Import passt)
// und was zählt (Feld kriterium). anzahl ist dann Anzahl, Kilogramm oder Anzahl Bestwerte.
export const KRITERIEN = {
  anzahl: { label: 'So oft gemacht', feld: 'Wie oft (Tage)' },
  gewicht: { label: 'Gewicht erreicht', feld: 'Gewicht (kg)' },
  bestwert: { label: 'Neuer Bestwert', feld: 'Wie viele Bestwerte' }
};

export const STANDARD_ABZEICHEN = [
  { name: 'Erste Messung', typ: 'messwerte', anzahl: 1, gels: 5 },
  { name: 'Erster Bestwert', typ: 'bestwerte', anzahl: 1, gels: 5 },
  { name: 'Sieben Trainingstage', typ: 'trainingstage', anzahl: 7, gels: 5 }
];

const schluessel = (name) => String(name || '').trim().toLowerCase();

// Je Übungsname: an wie vielen Tagen gemacht, schwerstes Gewicht, wie oft ein neuer Bestwert.
// Ein Bestwert ist ein Tag, an dem der schwerste Satz schwerer war als alles davor (der erste Tag zählt nicht).
async function uebungStatistik() {
  const uebungen = await db.uebungen.toArray();
  const nameVon = new Map(uebungen.map((u) => [u.id, schluessel(u.name)]));
  const uebungVonEintrag = new Map((await db.planEintraege.toArray()).map((e) => [e.id, e.uebungId]));
  const roh = {};
  const zu = (n) => (roh[n] ||= { tage: new Set(), tagMax: {} });

  for (const e of await db.erledigt.toArray()) {
    const n = nameVon.get(uebungVonEintrag.get(e.planEintragId));
    if (n) zu(n).tage.add(e.datum);
  }
  for (const s of await db.saetze.toArray()) {
    if (!s.fertig) continue;
    const n = nameVon.get(s.uebungId);
    if (!n) continue;
    const x = zu(n);
    x.tage.add(s.datum);
    if (s.gewicht !== null && s.gewicht !== undefined) x.tagMax[s.datum] = Math.max(x.tagMax[s.datum] ?? -Infinity, s.gewicht);
  }

  const st = {};
  for (const [n, x] of Object.entries(roh)) {
    let max = null;
    let bestwerte = 0;
    for (const d of Object.keys(x.tagMax).sort()) {
      if (max !== null && x.tagMax[d] > max) bestwerte++;
      max = max === null ? x.tagMax[d] : Math.max(max, x.tagMax[d]);
    }
    st[n] = { anzahl: x.tage.size, gewicht: max ?? 0, bestwert: bestwerte };
  }
  return st;
}

export async function statistik() {
  const log = await db.xpLog.toArray();
  const verdient = log.reduce((s, e) => s + e.punkte, 0);
  const erledigt = await db.erledigt.toArray();
  return {
    messwerte: await db.werte.count(),
    trainingstage: new Set(erledigt.map((e) => e.datum)).size,
    bestwerte: log.filter((e) => e.ref && e.ref.startsWith('bestwert:')).length,
    ziele: (await db.ziele.toArray()).filter((z) => z.erreicht).length,
    level: levelInfo(verdient, await schwellen()).level,
    uebungen: await uebungStatistik()
  };
}

// Aktueller Stand zu einem Abzeichen (Zahl, die mit a.anzahl verglichen wird)
export function abzWert(a, stat) {
  if (a.typ === 'uebung') return stat.uebungen?.[schluessel(a.uebung)]?.[a.kriterium || 'anzahl'] ?? 0;
  return stat[a.typ] ?? 0;
}

export function erreicht(a, stat) {
  return abzWert(a, stat) >= a.anzahl;
}

const kg = (z) => String(z).replace('.', ',');

export function bedingungText(a) {
  if (a.typ === 'level') return `Level ${a.anzahl}`;
  if (a.typ === 'uebung') {
    const k = a.kriterium || 'anzahl';
    if (k === 'gewicht') return `${a.uebung} mit ${kg(a.anzahl)} kg`;
    if (k === 'bestwert') return a.anzahl === 1 ? `Neuer Bestwert bei ${a.uebung}` : `${a.anzahl} Bestwerte bei ${a.uebung}`;
    return a.anzahl === 1 ? `${a.uebung} zum ersten Mal` : `${a.uebung} ${a.anzahl}× gemacht`;
  }
  return `${a.anzahl} ${BEDINGUNGEN[a.typ] || a.typ}`;
}

export function fortschrittText(a, stat) {
  const ist = abzWert(a, stat);
  if (a.typ === 'level') return `Level ${stat.level} von ${a.anzahl}`;
  if (a.typ === 'uebung' && a.kriterium === 'gewicht') return `bisher ${kg(ist)} von ${kg(a.anzahl)} kg`;
  return `${Math.min(ist, a.anzahl)} von ${a.anzahl}`;
}

// Beim allerersten Start Standard-Abzeichen anlegen
export async function ersteinrichtung() {
  if (await getEinstellung('eingerichtet')) return;
  if ((await db.abzeichen.count()) === 0) {
    await db.abzeichen.bulkAdd(STANDARD_ABZEICHEN.map((a) => ({ ...a, uid: neueUid() })));
  }
  await setEinstellung('eingerichtet', true);
}
