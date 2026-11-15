import { db, getEinstellung, setEinstellung, neueUid } from './db.js';
import { levelInfo, schwellen } from './xp.js';

export const BEDINGUNGEN = {
  messwerte: 'Messwerte eingetragen',
  trainingstage: 'Trainingstage',
  bestwerte: 'Bestwerte',
  ziele: 'Ziele erreicht',
  level: 'Level erreicht'
};

export const STANDARD_ABZEICHEN = [
  { name: 'Erste Messung', typ: 'messwerte', anzahl: 1 },
  { name: 'Erster Bestwert', typ: 'bestwerte', anzahl: 1 },
  { name: 'Sieben Trainingstage', typ: 'trainingstage', anzahl: 7 }
];

export async function statistik() {
  const log = await db.xpLog.toArray();
  const verdient = log.reduce((s, e) => s + e.punkte, 0);
  const erledigt = await db.erledigt.toArray();
  return {
    messwerte: await db.werte.count(),
    trainingstage: new Set(erledigt.map((e) => e.datum)).size,
    bestwerte: log.filter((e) => e.ref && e.ref.startsWith('bestwert:')).length,
    ziele: (await db.ziele.toArray()).filter((z) => z.erreicht).length,
    level: levelInfo(verdient, await schwellen()).level
  };
}

export function erreicht(a, stat) {
  return (stat[a.typ] ?? 0) >= a.anzahl;
}

export function bedingungText(a) {
  if (a.typ === 'level') return `Level ${a.anzahl}`;
  return `${a.anzahl} ${BEDINGUNGEN[a.typ] || a.typ}`;
}

// Beim allerersten Start Standard-Abzeichen anlegen
export async function ersteinrichtung() {
  if (await getEinstellung('eingerichtet')) return;
  if ((await db.abzeichen.count()) === 0) {
    await db.abzeichen.bulkAdd(STANDARD_ABZEICHEN.map((a) => ({ ...a, uid: neueUid() })));
  }
  await setEinstellung('eingerichtet', true);
}
