import { getEinstellung, setEinstellung } from './db.js';

// Welche Briefe schon geöffnet wurden (für die Markierung „neu“). Gespeichert werden die uids.
export async function gelesene() {
  return new Set((await getEinstellung('briefeGelesen')) || []);
}

export async function alsGelesen(uid) {
  const liste = (await getEinstellung('briefeGelesen')) || [];
  if (!liste.includes(uid)) await setEinstellung('briefeGelesen', [...liste, uid]);
}
