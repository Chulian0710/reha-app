// Kleine, selbst geschriebene Übungsliste (nur Namen, keine Anleitungen).
// Sie ist Teil der App und wird nicht online abgefragt.
// Wie eine Übung ausgeführt wird, zeigt der Physio.

export const KATEGORIEN = { kraft: 'Kraft', ausdauer: 'Ausdauer', mobility: 'Mobility', reha: 'Reha' };

const liste = [
  // Kraft
  ['Kniebeuge', 'kraft', 'Beine'],
  ['Goblet Squat', 'kraft', 'Beine'],
  ['Wandsitz', 'kraft', 'Oberschenkel'],
  ['Ausfallschritt', 'kraft', 'Beine'],
  ['Step-ups', 'kraft', 'Beine'],
  ['Beinpresse', 'kraft', 'Beine'],
  ['Beinstrecker am Gerät', 'kraft', 'Oberschenkel vorne'],
  ['Beinbeuger am Gerät', 'kraft', 'Oberschenkel hinten'],
  ['Wadenheben stehend', 'kraft', 'Wade'],
  ['Wadenheben sitzend', 'kraft', 'Wade'],
  ['Hüftbrücke', 'kraft', 'Gesäß'],
  ['Rumänisches Kreuzheben', 'kraft', 'Oberschenkel hinten'],
  ['Seitliches Beinheben in Seitlage', 'kraft', 'Hüfte'],
  ['Muschel (Clamshell)', 'kraft', 'Hüfte'],
  ['Rudern mit Kurzhantel', 'kraft', 'Rücken'],
  ['Rudern am Kabelzug', 'kraft', 'Rücken'],
  ['Latziehen', 'kraft', 'Rücken'],
  ['Liegestütz', 'kraft', 'Brust'],
  ['Schulterdrücken', 'kraft', 'Schulter'],
  ['Bizepscurls', 'kraft', 'Arme'],
  ['Trizepsdrücken', 'kraft', 'Arme'],
  ['Unterarmstütz (Plank)', 'kraft', 'Rumpf'],
  ['Seitstütz', 'kraft', 'Rumpf'],
  // Ausdauer: Dauer und Strecke statt Sätzen (4. Wert = Einheit der Strecke)
  ['Schwimmen', 'ausdauer', 'Ganzkörper', 'm'],
  ['Radfahren', 'ausdauer', 'Beine', 'km'],
  ['Gehen', 'ausdauer', 'Beine', 'km'],
  ['Joggen', 'ausdauer', 'Beine', 'km'],
  ['Ergometer', 'ausdauer', 'Beine', 'km'],
  // Mobility
  ['Oberschenkel vorne dehnen', 'mobility', 'Oberschenkel vorne'],
  ['Oberschenkel hinten dehnen', 'mobility', 'Oberschenkel hinten'],
  ['Wade dehnen', 'mobility', 'Wade'],
  ['Hüftbeuger dehnen', 'mobility', 'Hüfte'],
  ['Hüftkreisen', 'mobility', 'Hüfte'],
  ['Katze-Kuh', 'mobility', 'Wirbelsäule'],
  ['Brustwirbelsäule rotieren', 'mobility', 'Wirbelsäule'],
  ['Kindeshaltung', 'mobility', 'Rücken'],
  ['Schulterkreisen', 'mobility', 'Schulter'],
  ['Nacken seitlich dehnen', 'mobility', 'Nacken'],
  ['Sprunggelenk kreisen', 'mobility', 'Sprunggelenk'],
  // Reha
  ['Oberschenkel anspannen (isometrisch)', 'reha', 'Oberschenkel'],
  ['Fersengleiten', 'reha', 'Knie'],
  ['Gestrecktes Beinheben', 'reha', 'Oberschenkel'],
  ['Knie strecken im Sitzen', 'reha', 'Knie'],
  ['Fußwippe', 'reha', 'Sprunggelenk'],
  ['Gewichtsverlagerung im Stand', 'reha', 'Beine'],
  ['Einbeinstand', 'reha', 'Gleichgewicht'],
  ['Aufstehen vom Stuhl', 'reha', 'Beine'],
  ['Treppensteigen', 'reha', 'Beine'],
  ['Gehtraining', 'reha', 'Gang'],
  ['Beckenkippen in Rückenlage', 'reha', 'Rücken'],
  ['Pendelübung Schulter', 'reha', 'Schulter'],
  ['Außenrotation mit Theraband', 'reha', 'Schulter']
];

export const BIBLIOTHEK = liste.map(([name, kategorie, bereich, einheit], i) => ({ bibId: i + 1, name, kategorie, bereich, ...(einheit ? { einheit } : {}) }));
