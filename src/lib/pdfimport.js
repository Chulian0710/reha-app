import { seitenLesen, planAuswerten } from './pdfparse.js';
import { db } from './db.js';

// Liest den Plan im Browser aus. pdf.js wird erst hier geladen, damit die App sonst klein bleibt.
// Es wird nichts hochgeladen: die PDF wird nur auf dem Gerät gelesen.
export async function pdfAuslesen(quelle) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { default: workerUrl } = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  let daten;
  if (typeof quelle === 'string') daten = new Uint8Array(await (await fetch(quelle)).arrayBuffer());
  else daten = new Uint8Array(await quelle.arrayBuffer());

  return planAuswerten(await seitenLesen(pdfjs, daten));
}

// Nimmt gefundene Übungen in die eigene Bibliothek auf (quelle 'physio').
// Vorhandene Übungen gleichen Namens bekommen nur fehlende Angaben (Video, Vorgabe, Anmerkung) ergänzt.
// Gibt die Anzahl neuer und ergänzter Übungen zurück.
export async function inBibliothek(gefunden) {
  const alle = await db.uebungen.toArray();
  let neu = 0;
  let ergaenzt = 0;
  for (const z of gefunden) {
    const name = (z.name || '').trim();
    if (!name) continue;
    const extra = { video: z.video || null, vorgabe: (z.vorgabe || '').trim() || null, notiz: (z.notiz || '').trim() || null };
    const vorhanden = alle.find((u) => u.name.toLowerCase() === name.toLowerCase());
    if (vorhanden) {
      const fehlt = Object.fromEntries(Object.entries(extra).filter(([k, v]) => v && !vorhanden[k]));
      if (Object.keys(fehlt).length) {
        await db.uebungen.update(vorhanden.id, fehlt);
        Object.assign(vorhanden, fehlt);
        ergaenzt++;
      }
    } else {
      const u = { name, kategorie: 'reha', bereich: '', quelle: 'physio', ...extra };
      u.id = await db.uebungen.add(u);
      alle.push(u);
      neu++;
    }
  }
  return { neu, ergaenzt };
}
