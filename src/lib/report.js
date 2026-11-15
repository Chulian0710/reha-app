import { jsPDF } from 'jspdf';
import { db } from './db.js';

// PDF-Bericht zum Zeigen (z. B. beim Physio). Das ist KEIN Backup, siehe backup.js.
export async function berichtErzeugen() {
  const reihen = await db.reihen.toArray();
  const doc = new jsPDF();
  let y = 18;

  doc.setFontSize(16);
  doc.text('Reha-Bericht', 14, y);
  y += 7;
  doc.setFontSize(10);
  doc.text(`Erstellt am ${new Date().toLocaleDateString('de-DE')}`, 14, y);
  y += 10;

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
    doc.text('Noch keine Messwerte vorhanden.', 14, y);
  }

  doc.save(`reha-bericht-${new Date().toISOString().slice(0, 10)}.pdf`);
}
