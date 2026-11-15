import { writable } from 'svelte/store';
import { db } from './db.js';

// Kurze Meldung unten, optional mit „Rückgängig“
export const toast = writable(null);
let timer;

export function zeigeToast(text, rueckgaengig = null) {
  clearTimeout(timer);
  toast.set({ text, rueckgaengig, id: Date.now() });
  timer = setTimeout(() => toast.set(null), rueckgaengig ? 6000 : 3000);
}

// Löscht Einträge ohne Nachfrage (wie in iOS) und bietet „Rückgängig“ an.
// teile: [{ tabelle: 'werte', ids: [1, 2] }]
export async function loeschenMitUndo(text, teile) {
  const tabellen = teile.map((t) => db.table(t.tabelle));
  let gesichert = [];
  await db.transaction('rw', tabellen, async () => {
    gesichert = [];
    for (const t of teile) {
      const eintraege = (await db.table(t.tabelle).bulkGet(t.ids)).filter(Boolean);
      gesichert.push({ tabelle: t.tabelle, eintraege });
      await db.table(t.tabelle).bulkDelete(t.ids);
    }
  });
  zeigeToast(text, async () => {
    await db.transaction('rw', tabellen, async () => {
      for (const g of gesichert) if (g.eintraege.length) await db.table(g.tabelle).bulkPut(g.eintraege);
    });
    toast.set(null);
  });
}
