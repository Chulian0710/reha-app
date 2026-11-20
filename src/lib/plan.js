import { db } from './db.js';
import { wochentag } from './datum.js';
import { istAusdauer, streckeEinheit, ausdauerText } from './ausdauer.js';

// Der Plan, der an einem Datum gilt: der zuletzt begonnene, dessen Zeitraum das Datum enthält.
export function planAusListe(plaene, datum) {
  const passend = plaene.filter((p) => p.start <= datum && (!p.ende || p.ende >= datum));
  passend.sort((a, b) => b.start.localeCompare(a.start));
  return passend[0] || null;
}

export async function planFuer(datum) {
  return planAusListe(await db.plaene.toArray(), datum);
}

// Übungen eines Tages mit Status: aus dem Wochenplan plus im Kalender eingeplante Zusatzübungen.
// Ein Plantag ohne Übungen ist ein Ruhetag. Eine eingeplante Zusatzübung macht daraus einen Trainingstag.
// Planübungen, die auf einen anderen Tag verschoben wurden, fehlen hier und stehen in „weg“ (mit Zieltag in datum).
// Ein Tag, dessen Übungen alle verschoben wurden, ist kein Ruhetag.
export async function tagesplan(datum) {
  const plan = await planFuer(datum);
  const wt = wochentag(datum);
  const weg = await db.planEintraege.where('vonDatum').equals(datum).toArray();
  const wegIds = new Set(weg.map((e) => e.vonEintragId));
  const ausPlan = plan
    ? (await db.planEintraege.where('planId').equals(plan.id).toArray()).filter((e) => e.wochentag === wt && !wegIds.has(e.id))
    : [];
  const extra = (await db.planEintraege.where('datum').equals(datum).toArray()).map((e) => ({ ...e, extra: true }));
  const eintraege = [...ausPlan, ...extra];
  const uebungen = await db.uebungen.bulkGet([...eintraege, ...weg].map((e) => e.uebungId));
  const erledigt = await db.erledigt.where('datum').equals(datum).toArray();
  const fertig = new Set(erledigt.map((e) => e.planEintragId));
  const liste = eintraege.map((e, i) => ({ ...e, uebung: uebungen[i], erledigt: fertig.has(e.id) }));
  const wegListe = weg.map((e, i) => ({ ...e, uebung: uebungen[eintraege.length + i] })).sort((a, b) => a.datum.localeCompare(b.datum));
  const termine = await termineAm(datum);
  return { plan, eintraege: liste, weg: wegListe, ruhetag: !!plan && liste.length === 0 && wegListe.length === 0, termine };
}

// Felder, die eine verschobene Planübung als Kopie mitnimmt
const VORGABE_FELDER = ['uebungId', 'saetze', 'wdh', 'gewicht', 'dauer', 'strecke', 'xp', 'vorgabe', 'notiz'];

// Verschiebt Übungen (aus tagesplan(von).eintraege) einmalig auf den Tag nach. Erledigte bleiben, wo sie sind.
// - Planübung: Kopie am Zieltag mit vonDatum/vonEintragId, damit entfällt sie am Ausgangstag.
// - Eingeplante Übung oder Kopie: wandert einfach mit. Kommt eine Kopie an ihren ursprünglichen Tag zurück,
//   wird sie gelöscht und die Planübung gilt dort wieder.
// Schon begonnene Sätze ziehen mit um. Gibt die Anzahl und eine Funktion zum Rückgängigmachen zurück.
export async function verschieben(eintraege, von, nach) {
  const liste = von === nach ? [] : eintraege.filter((e) => !e.erledigt);
  const neueIds = [];
  const alteEintraege = [];
  const alteSaetze = [];
  await db.transaction('rw', db.plaene, db.planEintraege, db.saetze, async () => {
    for (const e of liste) {
      const saetze = await db.saetze.where('[datum+planEintragId]').equals([von, e.id]).toArray();
      alteSaetze.push(...saetze);
      let zielId = e.id;
      if (!e.datum) {
        const kopie = { planId: null, wochentag: null, datum: nach, vonDatum: von, vonEintragId: e.id };
        for (const f of VORGABE_FELDER) kopie[f] = e[f] ?? null;
        zielId = await db.planEintraege.add(kopie);
        neueIds.push(zielId);
      } else {
        const alt = await db.planEintraege.get(e.id);
        alteEintraege.push(alt);
        const original = alt.vonEintragId && alt.vonDatum === nach ? await db.planEintraege.get(alt.vonEintragId) : null;
        const plan = original ? await planFuer(nach) : null;
        if (original && plan && original.planId === plan.id && original.wochentag === wochentag(nach)) {
          await db.planEintraege.delete(e.id);
          zielId = original.id;
        } else if (alt.vonDatum === nach) {
          // Original gibt es dort nicht mehr: bleibt eine gewöhnliche eingeplante Übung
          await db.planEintraege.update(e.id, { datum: nach, vonDatum: null, vonEintragId: null });
        } else {
          await db.planEintraege.update(e.id, { datum: nach });
        }
      }
      for (const s of saetze) await db.saetze.update(s.id, { datum: nach, planEintragId: zielId });
    }
  });
  async function rueckgaengig() {
    await db.transaction('rw', db.planEintraege, db.saetze, async () => {
      await db.planEintraege.bulkDelete(neueIds);
      await db.planEintraege.bulkPut(alteEintraege);
      await db.saetze.bulkPut(alteSaetze);
    });
  }
  return { anzahl: liste.length, rueckgaengig };
}

export async function termineAm(datum) {
  const t = await db.termine.where('datum').equals(datum).toArray();
  return t.sort((a, b) => (a.zeit || '99').localeCompare(b.zeit || '99'));
}

export function eintragText(e) {
  if (istAusdauer(e.uebung)) return e.vorgabe || ausdauerText(e, streckeEinheit(e.uebung)) || 'ohne feste Vorgabe';
  let t = e.vorgabe || (e.saetze || e.wdh ? `${e.saetze || 1} × ${e.wdh || '?'}` : 'ohne feste Vorgabe');
  if (e.gewicht) t += ` · ${String(e.gewicht).replace('.', ',')} kg`;
  return t;
}
