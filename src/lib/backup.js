import { db, TABELLEN, setEinstellung } from './db.js';
import { verschluesseln, entschluesseln } from './krypto.js';

const FORMAT = 'reha-app-backup';
const VERSION = 1;

export async function alleDaten() {
  const daten = {};
  for (const t of TABELLEN) daten[t] = await db.table(t).toArray();
  return daten;
}

// Erzeugt den Inhalt der Backup-Datei (JSON-Text). Mit Passwort wird AES-GCM-verschlüsselt.
export async function backupErzeugen(passwort) {
  const daten = await alleDaten();
  const klartext = JSON.stringify({ format: FORMAT, version: VERSION, erstellt: new Date().toISOString(), daten });
  if (!passwort) return klartext;

  return JSON.stringify({ format: FORMAT, version: VERSION, verschluesselt: true, ...(await verschluesseln(klartext, passwort)) });
}

export async function backupHerunterladen(passwort) {
  const text = await backupErzeugen(passwort);
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reha-backup-${new Date().toISOString().slice(0, 10)}${passwort ? '-verschluesselt' : ''}.json`;
  a.click();
  URL.revokeObjectURL(url);
  await setEinstellung('letztesBackup', new Date().toISOString());
}

// Ersetzt ALLE lokalen Daten durch den Inhalt der Backup-Datei.
export async function backupWiederherstellen(dateiText, passwort) {
  let obj = JSON.parse(dateiText);
  if (obj.format !== FORMAT) throw new Error('Das ist keine Backup-Datei dieser App.');

  if (obj.verschluesselt) {
    if (!passwort) throw new Error('Passwort fehlt.');
    try {
      obj = JSON.parse(await entschluesseln(obj, passwort));
    } catch {
      throw new Error('Passwort falsch oder Datei beschädigt.');
    }
  }

  await db.transaction('rw', TABELLEN.map((t) => db.table(t)), async () => {
    for (const t of TABELLEN) {
      await db.table(t).clear();
      if (obj.daten[t]?.length) await db.table(t).bulkAdd(obj.daten[t]);
    }
  });
}
