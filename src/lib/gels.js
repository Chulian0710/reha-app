import { db, heute } from './db.js';
import { regeln, levelGels, gelsFuerLevel } from './xp.js';
import { statistik, erreicht } from './abzeichen.js';

// Gels gibt es für jeden Level-Aufstieg (Wert je Level im Betreuer-Bereich), für jedes erreichte Abzeichen und als Geschenk vom Betreuer.
// Jede Gutschrift steht mit ref im gelLog und wird nur einmal vergeben: Fällt das Level wieder
// (z. B. Übung zurückgenommen) und wird erneut erreicht, gibt es keine zweiten Gels.
// Gutschriften mit 0 Gels werden trotzdem eingetragen, damit sie nicht immer wieder neu auftauchen.
async function vergeben() {
  const r = await regeln();
  const proLevel = await levelGels();
  const stat = await statistik();
  const vorhanden = new Set((await db.gelLog.toArray()).map((g) => g.ref).filter(Boolean));
  const datum = heute();
  const neu = [];

  for (let l = 2; l <= stat.level; l++) {
    const ref = `level:${l}`;
    if (!vorhanden.has(ref)) neu.push({ datum, gels: gelsFuerLevel(proLevel, l, r), grund: `Level ${l} erreicht`, art: 'level', ref, level: l });
  }
  for (const a of await db.abzeichen.toArray()) {
    const ref = `abzeichen:${a.uid}`;
    if (vorhanden.has(ref) || !erreicht(a, stat)) continue;
    neu.push({ datum, gels: Number(a.gels ?? r.gelsProAbzeichen) || 0, grund: `Abzeichen: ${a.name}`, art: 'abzeichen', ref, name: a.name });
  }
  if (neu.length) await db.gelLog.bulkAdd(neu);
  return { neu, stat };
}

// Nacheinander ausführen, damit nichts doppelt gutgeschrieben wird
let kette = Promise.resolve();
export function gelsVergeben() {
  const p = kette.then(vergeben);
  kette = p.catch(() => {});
  return p;
}

export async function gelsSchenken(gels, grund) {
  await db.gelLog.add({ datum: heute(), gels, grund, art: 'geschenk' });
}
