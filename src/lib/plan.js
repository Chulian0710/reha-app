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
export async function tagesplan(datum) {
  const plan = await planFuer(datum);
  const wt = wochentag(datum);
  const ausPlan = plan ? (await db.planEintraege.where('planId').equals(plan.id).toArray()).filter((e) => e.wochentag === wt) : [];
  const extra = (await db.planEintraege.where('datum').equals(datum).toArray()).map((e) => ({ ...e, extra: true }));
  const eintraege = [...ausPlan, ...extra];
  const uebungen = await db.uebungen.bulkGet(eintraege.map((e) => e.uebungId));
  const erledigt = await db.erledigt.where('datum').equals(datum).toArray();
  const fertig = new Set(erledigt.map((e) => e.planEintragId));
  const liste = eintraege.map((e, i) => ({ ...e, uebung: uebungen[i], erledigt: fertig.has(e.id) }));
  const termine = await termineAm(datum);
  return { plan, eintraege: liste, ruhetag: !!plan && liste.length === 0, termine };
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
