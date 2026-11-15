import { db, TABELLEN, setEinstellung } from './db.js';

const FORMAT = 'reha-app-backup';
const VERSION = 1;

function toB64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function fromB64(s) {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function schluesselAus(passwort, salt) {
  const roh = await crypto.subtle.importKey('raw', new TextEncoder().encode(passwort), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' },
    roh,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

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

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await schluesselAus(passwort, salt);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(klartext));
  return JSON.stringify({
    format: FORMAT,
    version: VERSION,
    verschluesselt: true,
    salt: toB64(salt),
    iv: toB64(iv),
    daten: toB64(cipher)
  });
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
      const key = await schluesselAus(passwort, fromB64(obj.salt));
      const klar = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(obj.iv) }, key, fromB64(obj.daten));
      obj = JSON.parse(new TextDecoder().decode(klar));
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
