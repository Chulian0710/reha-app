// Liest Trainingspläne aus PDFs mit dieser Tabelle:
//   Spalte 1: Übungsname mit Hyperlink (YouTube)
//   Spalte 2: Sets x Reps (fehlt auf manchen Seiten, z. B. der letzten)
//   Spalte 3: Anmerkungen
// Eine Zeile beginnt bei einem Link. Alles rechts davon bis zur nächsten Zeile gehört dazu.
// Das Ergebnis ist nur ein Vorschlag und wird vor dem Übernehmen geprüft.

const SXR = /(\d+)\s*[x×X*]\s*(\d+(?:[.,]\d+)?)(?:\s*(?:-|–|bis)\s*\d+(?:[.,]\d+)?)?(?:\s*(?:Wdh\.?|Wiederholungen|Sek\.?|Sekunden|sek|sec|s|Min\.?|min|Minuten|m)\b)?(?:\s*(?:pro|je)\s+Seite)?/;

// Holt Text und Links aller Seiten. pdfjs wird übergeben, damit das auch im Test (Node) läuft.
export async function seitenLesen(pdfjs, daten) {
  const task = pdfjs.getDocument({ data: daten, isEvalSupported: false });
  const doc = await task.promise;
  const seiten = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const tc = await page.getTextContent();
    const items = tc.items
      .filter((it) => it.str && it.str.trim())
      .map((it) => ({
        text: it.str,
        x: it.transform[4],
        y: it.transform[5],
        w: it.width,
        h: it.height || Math.abs(it.transform[3]) || 10
      }));
    const links = (await page.getAnnotations())
      .filter((a) => a.subtype === 'Link' && a.url)
      .map((a) => ({
        url: a.url,
        x1: Math.min(a.rect[0], a.rect[2]),
        y1: Math.min(a.rect[1], a.rect[3]),
        x2: Math.max(a.rect[0], a.rect[2]),
        y2: Math.max(a.rect[1], a.rect[3])
      }));
    seiten.push({ nr: n, items, links });
  }
  await task.destroy();
  return seiten;
}

const mitteY = (it) => it.y + it.h * 0.35;
const mitteX = (it) => it.x + it.w / 2;

// Text in Lesereihenfolge: Zeilen von oben nach unten, in der Zeile von links nach rechts
function lesetext(items) {
  const sortiert = items.slice().sort((a, b) => b.y - a.y || a.x - b.x);
  const zeilen = [];
  for (const it of sortiert) {
    const z = zeilen.find((z) => Math.abs(z.y - it.y) < Math.max(2, it.h * 0.4));
    if (z) z.items.push(it);
    else zeilen.push({ y: it.y, items: [it] });
  }
  return zeilen
    .map((z) =>
      z.items
        .sort((a, b) => a.x - b.x)
        .reduce((t, it, i, arr) => {
          if (i === 0) return it.text;
          const vorher = arr[i - 1];
          const luecke = it.x - (vorher.x + vorher.w);
          return t + (luecke > 1.5 && !t.endsWith(' ') && !it.text.startsWith(' ') ? ' ' : '') + it.text;
        }, '')
    )
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Mehrere Links mit gleicher URL direkt untereinander (umgebrochener Name) zusammenfassen
function linksZusammen(links) {
  const sortiert = links.slice().sort((a, b) => b.y2 - a.y2 || a.x1 - b.x1);
  const ergebnis = [];
  for (const l of sortiert) {
    const letzter = ergebnis[ergebnis.length - 1];
    const hoehe = l.y2 - l.y1 || 12;
    if (letzter && letzter.url === l.url && letzter.y1 - l.y2 < hoehe * 1.2) {
      letzter.x1 = Math.min(letzter.x1, l.x1);
      letzter.x2 = Math.max(letzter.x2, l.x2);
      letzter.y1 = Math.min(letzter.y1, l.y1);
    } else {
      ergebnis.push({ ...l });
    }
  }
  return ergebnis;
}

export function sxrLesen(text) {
  const m = text.match(SXR);
  if (!m) return null;
  return {
    vorgabe: m[0].trim().replace(/\s*[x×X*]\s*/, ' × '),
    saetze: Number(m[1]),
    wdh: Number(m[2].replace(',', '.')),
    rest: (text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim()
  };
}

export function seiteAuswerten(seite) {
  const links = linksZusammen(seite.links);
  const zeilen = [];
  links.forEach((l, i) => {
    const hoehe = l.y2 - l.y1 || 12;
    const imLink = seite.items.filter((it) => mitteX(it) >= l.x1 - 1 && mitteX(it) <= l.x2 + 1 && mitteY(it) >= l.y1 - 1 && mitteY(it) <= l.y2 + 1);
    const oben = l.y2 + hoehe * 0.3;
    const unten = i + 1 < links.length ? links[i + 1].y2 + hoehe * 0.3 : l.y1 - hoehe * 4;
    const rechts = seite.items.filter((it) => !imLink.includes(it) && it.x >= l.x2 - 1 && mitteY(it) <= oben && mitteY(it) > unten);

    const rest = lesetext(rechts);
    const sxr = sxrLesen(rest);
    zeilen.push({
      seite: seite.nr,
      name: lesetext(imLink) || 'Unbenannte Übung',
      video: l.url,
      vorgabe: sxr ? sxr.vorgabe : null,
      saetze: sxr ? sxr.saetze : null,
      wdh: sxr ? sxr.wdh : null,
      notiz: sxr ? sxr.rest : rest
    });
  });
  return zeilen;
}

export function planAuswerten(seiten) {
  return seiten.flatMap(seiteAuswerten);
}
