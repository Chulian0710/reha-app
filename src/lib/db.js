import Dexie from 'dexie';
export { heute } from './datum.js';

// Alles liegt lokal in IndexedDB auf dem Gerät. Es gibt keinen Server.
export const db = new Dexie('reha-app');

db.version(1).stores({
  reihen: '++id, name, typ',
  werte: '++id, reiheId, datum, seite',
  tagebuch: '++id, datum',
  xpLog: '++id, datum, grund',
  einstellungen: 'key'
});

db.version(2).stores({
  // Messreihen: typ 'umfang' | 'kraft' | 'beweglichkeit' | 'schmerz' | 'frei'; bei Kraft optional uebungId
  reihen: '++id, name, typ, uebungId',
  // Messwerte. seite: 'L' | 'R' | '-'; Kraft zusätzlich wdh und saetze
  werte: '++id, reiheId, datum, seite',
  tagebuch: '++id, datum',
  // Punktelog. ref verhindert doppelte Vergabe (z. B. 'uebung:2026-11-15:4', 'ruhetag:2026-11-15')
  xpLog: '++id, datum, grund, ref',
  einstellungen: 'key',
  // gespeicherte Übungen: kategorie 'kraft' | 'ausdauer' | 'mobility' | 'reha'; quelle 'bibliothek' | 'eigen'
  uebungen: '++id, name, kategorie',
  // Trainingspläne mit Zeitraum, optional angehängte Datei (als Data-URL)
  plaene: '++id, start',
  // Übung an einem Wochentag (1 = Mo … 7 = So) mit Sätzen, Wdh, Gewicht, XP
  planEintraege: '++id, planId, wochentag, uebungId',
  // abgehakte Planübungen
  erledigt: '++id, datum, planEintragId, &[datum+planEintragId]',
  // Inhalte aus dem Betreuer-Bereich (uid bleibt bei Pack-Import gleich)
  belohnungen: '++id, &uid',
  einloesungen: '++id, belohnungUid, datum',
  briefe: '++id, &uid, level',
  abzeichen: '++id, &uid'
});

// Version 3: einzelne Trainingssätze. Übungen haben zusätzlich das (nicht indizierte) Feld video.
db.version(3).stores({
  saetze: '++id, datum, planEintragId, uebungId, [datum+planEintragId]'
});

// Version 4: Einplanen im Kalender.
// planEintraege mit datum (statt planId/wochentag) sind einmalige Zusatzübungen an genau diesem Tag.
// termine: freie Einträge wie Physio oder Arzt (datum, zeit optional 'HH:MM', titel, notiz)
db.version(4).stores({
  planEintraege: '++id, planId, wochentag, uebungId, datum',
  termine: '++id, datum'
});

// Version 5: Ziele.
// art 'mess' (mit Zielwert) | 'frei' (ohne Messwert, z. B. „erster Sprung“)
// quelle bei 'mess': 'uebung' (schwerster Satz aus dem Training) | 'reihe' (Messwert, mit seite) | 'manuell' (verlauf [{ datum, wert }])
// erreicht: Datum oder null
db.version(5).stores({
  ziele: '++id, erreicht'
});

// Version 6: Gels (Belohnungswährung) und Wünsche.
// (gelBonus wurde in Version 7 durch gelLog ersetzt)
// Belohnungen und Einlösungen kosten Gels. einloesungen.erhalten: Datum, an dem der Betreuer die Belohnung übergeben hat.
// wuensche: name, notiz, datum, status 'offen' | 'abgelehnt', antwort
db.version(6).stores({
  gelBonus: '++id, datum',
  wuensche: '++id, status'
});

// Version 7: Gels haben nichts mehr mit XP zu tun. Alle Gel-Gutschriften liegen in gelLog:
// { datum, gels, grund, art 'level' | 'abzeichen' | 'geschenk', ref } – ref ('level:3', 'abzeichen:<uid>') verhindert doppelte Vergabe.
db.version(7)
  .stores({ gelLog: '++id, datum, ref', gelBonus: null })
  .upgrade(async (tx) => {
    const alt = await tx.table('gelBonus').toArray();
    if (alt.length) await tx.table('gelLog').bulkAdd(alt.map(({ id, ...g }) => ({ ...g, art: 'geschenk' })));
  });

// Version 8: Verschieben im Kalender.
// Eine Planübung, die nur in einer Woche auf einen anderen Tag wandert, bekommt dort eine Kopie
// (datum = Zieltag) mit vonDatum (ursprünglicher Tag) und vonEintragId (Planeintrag). Am ursprünglichen Tag entfällt sie dann.
db.version(8).stores({
  planEintraege: '++id, planId, wochentag, uebungId, datum, vonDatum'
});

export const TABELLEN = [
  'gelLog', 'wuensche',
  'saetze', 'termine', 'ziele',
  'reihen', 'werte', 'tagebuch', 'xpLog', 'einstellungen',
  'uebungen', 'plaene', 'planEintraege', 'erledigt',
  'belohnungen', 'einloesungen', 'briefe', 'abzeichen'
];

export function neueUid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// Bittet den Browser, die Daten nicht automatisch zu löschen.
export async function bitteUmDauerhaftenSpeicher() {
  try {
    if (navigator.storage && navigator.storage.persist) await navigator.storage.persist();
  } catch {
    // nicht kritisch
  }
}

export async function setEinstellung(key, value) {
  await db.einstellungen.put({ key, value });
}

export async function getEinstellung(key) {
  const e = await db.einstellungen.get(key);
  return e ? e.value : undefined;
}
