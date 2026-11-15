# Reha-App

Reha- und Motivations-App als PWA (Svelte + Dexie/IndexedDB). Alle Daten bleiben lokal auf dem Gerät.

## Entwickeln (kein Hosting nötig)

```bash
npm install
npm run dev
```

Handy im selben WLAN: die angezeigte Netzwerk-Adresse öffnen (z. B. `http://192.168.1.20:5173`).
Installation und Offline-Betrieb als App funktionieren erst über HTTPS (siehe unten).

## Produktiv mit GitHub Pages

1. Neues GitHub-Repo anlegen (privat oder öffentlich), Projekt dorthin pushen (Branch `main`).
2. Im Repo: Settings → Pages → Source: **GitHub Actions**.
3. Der Workflow `.github/workflows/deploy.yml` baut und veröffentlicht die App bei jedem Push.
4. Adresse: `https://<dein-name>.github.io/<repo-name>/`. Dort auf dem Handy öffnen und „Zum Home-Bildschirm" wählen.

Hinweis: GitHub Pages aus einem privaten Repo ist je nach GitHub-Tarif nicht verfügbar. Die Nutzerdaten sind davon unabhängig, sie liegen nie im Repo.

## Aufbau

Navigation: Heute · Kalender · ＋ (Anlegen: Plan, Ziel, Messwert) · Fortschritt · Mehr (Tagebuch, Belohnungen, Daten, Betreuer-Bereich)

Buttons färben sich beim Antippen kurz ein (`gedrueckt` in `src/main.js`, Styles am Ende von `src/app.css`).

**Bedienung**
- Unterseiten haben oben „‹ Zurück“. Zurück geht auch per Browser-Zurück, Android-Zurück, iOS-Wischgeste und Esc (`src/lib/nav.js`).
- Formulare öffnen als Sheet: auf dem Handy von unten, zum Schließen nach unten ziehen; auf dem Laptop als Dialog (`src/lib/Sheet.svelte`).
- Listen: nach links wischen zum Löschen/Ändern, ganz durchwischen löscht. Danach erscheint unten „Rückgängig“. Mit der Maus erscheinen die Knöpfe beim Darüberfahren (`src/lib/SwipeRow.svelte`, `src/lib/toast.js`).
- Laptop (ab 900 px): Seitenleiste statt Tab-Leiste, ab 1100 px zweispaltig. Tasten: ← → wechselt auf „Heute“ den Tag (T = heute), im Kalender wählen Pfeiltasten Tage und Bild ↑/↓ den Monat, Esc geht zurück.

- **Heute:** Tage wechseln (‹ ›), Level, Termine, Plan des Tages zum Abhaken (auch nachträglich, nicht im Voraus), Ruhetag, Aktivitäten, Tagebuch des Tages
- **Kalender:** Monatsansicht mit Status je Tag, Tagesdetails; einzelne Übungen für einen Tag einplanen (zusätzlich zum Wochenplan, abhaken unter „Heute“ mit XP) und Termine eintragen (z. B. Physio, Arzt)
- **Plan:** Pläne mit Zeitraum, Übungen je Wochentag (Sätze, Wdh., Gewicht, XP), Physio-Plan als PDF/Foto. Beim Anhängen einer PDF landen die erkannten Übungen automatisch in der Bibliothek (Filter „Physio“).
- **Übungen:** Suche in eigener Bibliothek (`src/lib/bibliothek.js`, nur Namen), eigene Übungen, Übungen vom Physio
- **Ziele:** mit Messwert (Gewicht aus dem Training, Messwert wie Umfang, eigener Wert wie Minuten spazieren) oder ohne Messwert (z. B. „erster Sprung“). Ziele mit Messwert haken sich automatisch ab.
- **Fortschritt:** Kennzahlen, Trainingstage (16 Wochen), Kraftentwicklung je Übung aus den Trainingssätzen, Bestwerte, Ausgangssituation vs. letzte Messung, Ziele, Abzeichen
- **Messwerte:** Umfang (Wade, Wade angespannt, Oberschenkel unten, Oberschenkel oben, Po; jeweils links und rechts) und weitere Werte. Kraft wird nicht mehr von Hand eingetragen.
- **Betreuer-Bereich:** Passwort, Belohnungen, Level-Stufen, Briefe, Abzeichen, XP-Regeln, Pack-Export

## Training, Videos, PDF-Import

- **Training** (Heute → Übung → „Training“): Sätze mit Gewicht und Wiederholungen abhaken. Vorschlag = letztes Training. Sind alle Sätze abgehakt, ist die Übung erledigt. Schwerer als je zuvor = Bestwert.
- **Videos:** YouTube-Link je Übung, wird in der App abgespielt (youtube-nocookie, lädt erst nach Tippen, braucht Internet).
- **PDF-Import** (Plan → „Übungen aus PDF übernehmen“): liest Name + Link, Sets × Reps und Anmerkungen, auch Seiten ohne Sets × Reps. Läuft lokal mit pdf.js. Vor dem Übernehmen prüfen und Wochentage wählen. Testdatei: `beispiel/beispielplan.pdf`. Eingescannte PDFs (Bilder) funktionieren nicht.

## XP-Regeln (Standard, im Betreuer-Bereich änderbar)

| Aktion | XP |
|---|---|
| Geplante Übung abgehakt | 7 (pro Planeintrag änderbar) |
| Ruhetag laut Plan | so viel wie die letzte Trainingseinheit |
| Aktivität | 10 |
| Neuer Bestwert (Kraft) | 30, höchstens 1× pro Übung, Seite und Woche |
| Ziel erreicht | 50 |
| Messwert, Tagebuch | 0 |

Level: 0 · 50 · 200 · 450 · 800 XP, danach wächst der Abstand je Level um 100 XP (ohne Ende).
Belohnungen einlösen senkt die verfügbaren XP, nicht das Level.

## Datenmodell (src/lib/db.js, Version 5)

`reihen`, `werte`, `tagebuch`, `xpLog` (mit `ref` gegen Doppelvergabe), `einstellungen`,
`uebungen`, `plaene`, `planEintraege`, `erledigt`, `belohnungen`, `einloesungen`, `briefe`, `abzeichen`, `saetze`, `termine`, `ziele`.
Eingeplante Einzelübungen sind `planEintraege` mit `datum` statt `planId`/`wochentag`.

## Backup, Bericht, Pack

- **Backup** (JSON, optional mit Passwort verschlüsselt): alle Daten, lässt sich wieder importieren.
- **PDF-Bericht**: nur zum Zeigen, kein Backup.
- **Pack**: Inhalte aus dem Betreuer-Bereich, Import unter Mehr → Daten. Fortschritt bleibt.

Der Betreuer-Bereich ist ein Spoilerschutz, keine Verschlüsselung: Briefe liegen lesbar im Browserspeicher.

## Nächste Etappen

- Wochenrückblick
- App-PIN mit Verschlüsselung der lokalen Daten
- Kraftwerte direkt beim Abhaken einer Planübung speichern
