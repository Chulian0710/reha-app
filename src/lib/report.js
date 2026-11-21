import { jsPDF } from 'jspdf';
import { db } from './db.js';
import { parse, kurz } from './datum.js';
import { schmerzJeTag, gleitend, trainingsInfo, tagArt, VERGLEICHE, vergleichen, fazit, trend, komma, schnitt, MIN_TAGE } from './schmerz.js';

// PDF-Bericht zum Zeigen (z. B. beim Physio). Das ist KEIN Backup, siehe backup.js.
// tagebuchTexte: Texte zu auffälligen Tagen mitnehmen (standardmäßig nicht, das Tagebuch ist persönlich)
export async function berichtErzeugen({ tagebuchTexte = false } = {}) {
  const reihen = await db.reihen.toArray();
  const doc = new jsPDF();
  let y = 18;

  doc.setFontSize(16);
  doc.text('Reha-Bericht', 14, y);
  y += 7;
  doc.setFontSize(10);
  doc.text(`Erstellt am ${new Date().toLocaleDateString('de-DE')}`, 14, y);
  y += 10;

  y = await schmerzAbschnitt(doc, y, tagebuchTexte);

  for (const r of reihen) {
    const werte = (await db.werte.where('reiheId').equals(r.id).toArray()).sort((a, b) => a.datum.localeCompare(b.datum));
    if (werte.length === 0) continue;

    if (y > 255) { doc.addPage(); y = 18; }
    doc.setFontSize(12);
    doc.text(`${r.name} (${r.einheit || ''})`, 14, y);
    y += 6;
    doc.setFontSize(9);

    const ersterWert = werte[0];
    const letzterWert = werte[werte.length - 1];
    doc.text(`Erster Wert: ${ersterWert.datum}  ${ersterWert.seite !== '-' ? ersterWert.seite + ' ' : ''}${ersterWert.wert}`, 14, y);
    y += 5;
    doc.text(`Letzter Wert: ${letzterWert.datum}  ${letzterWert.seite !== '-' ? letzterWert.seite + ' ' : ''}${letzterWert.wert}`, 14, y);
    y += 6;

    for (const w of werte.slice(-12)) {
      if (y > 280) { doc.addPage(); y = 18; }
      const extra = w.wdh ? `  (${w.saetze || 1} x ${w.wdh} Wdh.)` : '';
      doc.text(`${w.datum}   ${w.seite === '-' ? '' : w.seite + '   '}${w.wert}${extra}`, 18, y);
      y += 4.5;
    }
    y += 6;
  }

  if (reihen.length === 0) {
    doc.setFontSize(9);
    doc.text('Noch keine Messwerte vorhanden.', 14, y);
  }

  doc.save(`reha-bericht-${new Date().toISOString().slice(0, 10)}.pdf`);
}

// Schmerzverlauf aus dem Tagebuch: Kennzahlen, Diagramm, Vergleich nach Tagesart, auffällige Tage
async function schmerzAbschnitt(doc, y, tagebuchTexte) {
  const eintraege = await db.tagebuch.toArray();
  const punkte = schmerzJeTag(eintraege);
  if (!punkte.length) return y;
  const info = await trainingsInfo();
  const neueSeite = (platz) => {
    if (y + platz > 282) { doc.addPage(); y = 18; }
  };

  doc.setFontSize(12);
  doc.text('Schmerzverlauf (Tagebuch, 0-10)', 14, y);
  y += 6;
  doc.setFontSize(9);
  const erst = punkte[0];
  const letzt = punkte[punkte.length - 1];
  const hoechst = punkte.reduce((a, b) => (b.wert > a.wert ? b : a));
  doc.text(`Zeitraum: ${erst.datum} bis ${letzt.datum}, ${punkte.length} Tage mit Schmerzwert`, 14, y);
  y += 5;
  const t = trend(punkte);
  if (t) {
    doc.text(`Durchschnitt erste ${t.k} Tage: ${komma(t.anfang)}   letzte ${t.k} Tage: ${komma(t.zuletzt)}   Veränderung: ${t.diff > 0 ? '+' : ''}${komma(t.diff)}`, 14, y);
    y += 5;
  }
  doc.text(`Durchschnitt gesamt: ${komma(schnitt(punkte.map((p) => p.wert)))}   Höchster Wert: ${hoechst.wert} am ${hoechst.datum}`, 14, y);
  y += 6;

  // Diagramm
  neueSeite(62);
  const X = 24, W = 172, HOCH = 44, oben = y + 2, unten = oben + HOCH;
  const t0 = parse(erst.datum).getTime();
  const t1 = parse(letzt.datum).getTime();
  const px = (datum) => (t1 === t0 ? X + W / 2 : X + ((parse(datum).getTime() - t0) / (t1 - t0)) * W);
  const py = (wert) => unten - (wert / 10) * HOCH;
  doc.setFontSize(7);
  doc.setDrawColor(220);
  doc.setLineWidth(0.2);
  for (const w of [0, 5, 10]) {
    doc.line(X, py(w), X + W, py(w));
    doc.text(String(w), X - 3, py(w) + 1, { align: 'right' });
  }
  doc.setDrawColor(110);
  doc.setLineWidth(0.4);
  for (const d of info.training) if (d >= erst.datum && d <= letzt.datum) doc.line(px(d), unten + 1, px(d), unten + 3);
  const linie = (pts, farbe, gestrichelt) => {
    doc.setDrawColor(...farbe);
    doc.setLineWidth(0.6);
    doc.setLineDashPattern(gestrichelt ? [1.5, 1] : [], 0);
    for (let i = 1; i < pts.length; i++) doc.line(px(pts[i - 1].datum), py(pts[i - 1].wert), px(pts[i].datum), py(pts[i].wert));
    doc.setLineDashPattern([], 0);
  };
  linie(gleitend(punkte), [0, 137, 123], true);
  linie(punkte, [196, 86, 26], false);
  doc.setFillColor(196, 86, 26);
  for (const p of punkte) doc.circle(px(p.datum), py(p.wert), 0.7, 'F');
  doc.setTextColor(100);
  doc.text(kurz(erst.datum), X, unten + 7);
  if (punkte.length > 1) doc.text(kurz(letzt.datum), X + W, unten + 7, { align: 'right' });
  doc.text('Linie: Tageswert   gestrichelt: Durchschnitt 7 Tage   Striche unter der Achse: Trainingstage', X, unten + 11);
  doc.setTextColor(0);
  doc.setDrawColor(0);
  y = unten + 18;

  // Vergleich nach Tagesart
  neueSeite(40);
  doc.setFontSize(10);
  doc.text('Schmerz nach Tagesart', 14, y);
  y += 5;
  doc.setFontSize(9);
  for (const v of VERGLEICHE) {
    neueSeite(16);
    const gruppen = vergleichen(punkte, info, v);
    for (const g of gruppen) {
      doc.text(g.name, 18, y);
      doc.text(g.schnitt === null ? '-' : `Durchschnitt ${komma(g.schnitt)}`, 90, y);
      doc.text(`${g.n} ${g.n === 1 ? 'Tag' : 'Tage'}`, 135, y);
      y += 4.5;
    }
    const f = fazit(gruppen);
    doc.setTextColor(100);
    doc.text(f || `Zu wenig Daten (mindestens ${MIN_TAGE} Tage je Gruppe).`, 18, y);
    doc.setTextColor(0);
    y += 7;
  }

  // Auffällige Tage
  const auffaellig = punkte.filter((p) => p.wert >= 7);
  if (auffaellig.length) {
    neueSeite(14);
    doc.setFontSize(10);
    doc.text('Tage mit starkem Schmerz (7 oder mehr)', 14, y);
    y += 5;
    doc.setFontSize(9);
    for (const p of auffaellig.slice(-20)) {
      neueSeite(6);
      const a = tagArt(p.datum, info);
      const vortag = a.vortagNeu ? 'Vortag: neue Belastung' : a.vortagTraining ? 'Vortag: Training' : 'Vortag: kein Training';
      doc.text(`${p.datum}   ${p.wert}   ${a.training ? 'Trainingstag' : 'kein Training'}, ${vortag}`, 18, y);
      y += 4.5;
      if (tagebuchTexte) {
        const texte = eintraege.filter((e) => e.datum === p.datum && e.text).map((e) => e.text.replace(/\s+/g, ' '));
        for (const zeile of doc.splitTextToSize(texte.join(' / '), 170)) {
          if (!zeile) continue;
          neueSeite(5);
          doc.setTextColor(90);
          doc.text(zeile, 22, y);
          doc.setTextColor(0);
          y += 4;
        }
      }
    }
    y += 4;
  }
  return y + 6;
}
