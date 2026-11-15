import { writable } from 'svelte/store';
import { db, getEinstellung, setEinstellung, neueUid } from './db.js';
import { regeln, schwellen } from './xp.js';
import { textHerunterladen } from './datei.js';

// Nur im Arbeitsspeicher: nach Neuladen der App oder Verlassen des Bereichs wieder gesperrt.
export const entsperrt = writable(false);

const PACK_FORMAT = 'reha-app-pack';

function b64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function vonB64(s) {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function ableiten(passwort, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(passwort), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' }, key, 256);
  return b64(bits);
}

export async function hatPasswort() {
  return !!(await getEinstellung('betreuerPasswort'));
}

// Gespeichert wird nur ein Hash, nicht das Passwort.
export async function passwortSetzen(passwort) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  await setEinstellung('betreuerPasswort', { salt: b64(salt), hash: await ableiten(passwort, salt) });
}

export async function passwortPruefen(passwort) {
  const p = await getEinstellung('betreuerPasswort');
  if (!p) return false;
  return (await ableiten(passwort, vonB64(p.salt))) === p.hash;
}

// Passwort vergessen: Passwort und alle Briefe werden gelöscht, damit nichts verraten wird.
export async function zuruecksetzen() {
  await db.briefe.clear();
  await db.einstellungen.delete('betreuerPasswort');
  entsperrt.set(false);
}

function ohneId(liste) {
  return liste.map(({ id, ...rest }) => rest);
}

export async function packErzeugen() {
  return JSON.stringify({
    format: PACK_FORMAT,
    version: 1,
    erstellt: new Date().toISOString(),
    belohnungen: ohneId(await db.belohnungen.toArray()),
    briefe: ohneId(await db.briefe.toArray()),
    abzeichen: ohneId(await db.abzeichen.toArray()),
    levelSchwellen: await schwellen(),
    xpRegeln: await regeln()
  });
}

export async function packHerunterladen() {
  textHerunterladen(await packErzeugen(), `reha-pack-${new Date().toISOString().slice(0, 10)}.json`);
}

// Ersetzt Belohnungen, Briefe, Abzeichen, Level und XP-Regeln. Fortschritt (XP, Einlösungen) bleibt.
export async function packImportieren(text) {
  let p;
  try {
    p = JSON.parse(text);
  } catch {
    throw new Error('Die Datei ist kein gültiges Pack.');
  }
  if (p.format !== PACK_FORMAT) throw new Error('Das ist keine Pack-Datei dieser App.');

  await db.transaction('rw', db.belohnungen, db.briefe, db.abzeichen, db.einstellungen, async () => {
    for (const [tabelle, liste] of [['belohnungen', p.belohnungen], ['briefe', p.briefe], ['abzeichen', p.abzeichen]]) {
      await db.table(tabelle).clear();
      if (Array.isArray(liste) && liste.length) {
        await db.table(tabelle).bulkAdd(liste.map(({ id, ...r }) => ({ ...r, uid: r.uid || neueUid() })));
      }
    }
    if (Array.isArray(p.levelSchwellen) && p.levelSchwellen.length) {
      await db.einstellungen.put({ key: 'levelSchwellen', value: p.levelSchwellen.map(Number).sort((a, b) => a - b) });
    }
    if (p.xpRegeln && typeof p.xpRegeln === 'object') {
      await db.einstellungen.put({ key: 'xpRegeln', value: p.xpRegeln });
    }
  });
}
