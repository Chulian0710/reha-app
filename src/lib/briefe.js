import { db, getEinstellung, setEinstellung } from './db.js';
import { punktestand, schwellen, levelInfo } from './xp.js';

// Welche Briefe schon geöffnet wurden. Gespeichert werden die uids.
export async function gelesene() {
  return new Set((await getEinstellung('briefeGelesen')) || []);
}

export async function alsGelesen(uid) {
  const liste = (await getEinstellung('briefeGelesen')) || [];
  if (!liste.includes(uid)) await setEinstellung('briefeGelesen', [...liste, uid]);
}

// Ungeöffnete Briefe stehen auf „Heute“, geöffnete unter Mehr → Briefe.
export async function briefStand() {
  const level = levelInfo((await punktestand()).verdient, await schwellen()).level;
  const gelesen = await gelesene();
  const alle = (await db.briefe.toArray()).sort((a, b) => a.level - b.level || a.id - b.id);
  const frei = alle.filter((b) => level >= b.level);
  const zu = alle.filter((b) => level < b.level);
  return {
    level,
    ungeoeffnet: frei.filter((b) => !gelesen.has(b.uid)),
    geoeffnet: frei.filter((b) => gelesen.has(b.uid)).reverse(), // neuestes Level zuerst
    verschlossen: zu.length,
    naechstesLevel: zu[0]?.level ?? null
  };
}
