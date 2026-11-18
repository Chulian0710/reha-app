// Verschlüsselung für Backup und Pack: AES-GCM 256, Schlüssel aus dem Passwort per PBKDF2 (SHA-256).
// Läuft vollständig im Browser, das Passwort verlässt das Gerät nie.

const ITERATIONEN = 250000;

function zuB64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function vonB64(s) {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function schluessel(passwort, salt) {
  const roh = await crypto.subtle.importKey('raw', new TextEncoder().encode(passwort), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITERATIONEN, hash: 'SHA-256' }, roh, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt'
  ]);
}

// Gibt { salt, iv, daten } als Base64 zurück
export async function verschluesseln(klartext, passwort) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await schluessel(passwort, salt), new TextEncoder().encode(klartext));
  return { salt: zuB64(salt), iv: zuB64(iv), daten: zuB64(cipher) };
}

// Wirft einen Fehler bei falschem Passwort oder beschädigter Datei
export async function entschluesseln({ salt, iv, daten }, passwort) {
  const klar = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: vonB64(iv) }, await schluessel(passwort, vonB64(salt)), vonB64(daten));
  return new TextDecoder().decode(klar);
}
