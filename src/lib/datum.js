// Datumshilfen. Alle Daten werden als 'YYYY-MM-DD' in lokaler Zeit gespeichert.

export const TAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
export const TAGE_LANG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

export function iso(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const t = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${t}`;
}

export function heute() {
  return iso(new Date());
}

export function parse(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// 1 = Montag … 7 = Sonntag
export function wochentag(s) {
  const w = parse(s).getDay();
  return w === 0 ? 7 : w;
}

// ISO-Kalenderwoche als Schlüssel, z. B. '2026-W46'
export function kw(s) {
  const d = parse(s);
  d.setDate(d.getDate() + 4 - wochentag(s));
  const jahr = d.getFullYear();
  const tag = Math.round((d - new Date(jahr, 0, 1)) / 86400000);
  return `${jahr}-W${Math.floor(tag / 7) + 1}`;
}

export function anzeige(s) {
  return parse(s).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'numeric' });
}

export function kurz(s) {
  return parse(s).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}
