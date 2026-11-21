<script>
  import { liveQuery } from 'dexie';
  import { db } from '../lib/db.js';
  import { backupHerunterladen, backupWiederherstellen } from '../lib/backup.js';
  import { berichtErzeugen } from '../lib/report.js';
  import { packImportieren, packPruefen } from '../lib/betreuer.js';

  let mitTagebuch = false;
  let packInput;
  let packMeldung = '';
  let packText = null; // gewählte Datei, wartet auf Passwort
  let packPasswort = '';
  async function packLaden(ev) {
    const datei = ev.target.files[0];
    ev.target.value = '';
    packMeldung = '';
    packText = null;
    packPasswort = '';
    if (!datei) return;
    try {
      const text = await datei.text();
      const { verschluesselt } = packPruefen(text);
      if (verschluesselt) packText = text;
      else await packEinspielen(text, '');
    } catch (e) {
      packMeldung = e.message;
    }
  }
  async function packEinspielen(text, pw) {
    if (!confirm('Shop-Belohnungen, Briefe, Abzeichen und Level-Stufen werden durch das Pack ersetzt. Deine XP, Gels und Einträge bleiben. Fortfahren?')) return;
    try {
      await packImportieren(text, pw);
      packText = null;
      packPasswort = '';
      packMeldung = 'Pack wurde importiert. Die Datei kannst du jetzt in der Dateien-App löschen.';
    } catch (e) {
      packMeldung = e.message;
    }
  }

  const letztes = liveQuery(() => db.einstellungen.get('letztesBackup'));

  let passwort = '';
  let meldung = '';
  let dateiInput;

  $: tage = $letztes ? Math.floor((Date.now() - new Date($letztes.value).getTime()) / 86400000) : null;

  async function sichern() {
    meldung = '';
    await backupHerunterladen(passwort || null);
    meldung = 'Backup wurde gespeichert.';
  }

  async function laden(ev) {
    const datei = ev.target.files[0];
    if (!datei) return;
    if (!confirm('Alle aktuellen Daten in der App werden durch das Backup ersetzt. Fortfahren?')) {
      ev.target.value = '';
      return;
    }
    try {
      await backupWiederherstellen(await datei.text(), passwort || null);
      meldung = 'Backup wurde wiederhergestellt.';
    } catch (e) {
      meldung = e.message;
    }
    ev.target.value = '';
  }
</script>

<h1>Daten</h1>

<div class="hinweis">
  Alle Daten bleiben auf diesem Gerät. Es gibt keinen Server und keinen Account.
  Wenn du die Browserdaten löschst oder das Gerät verlierst, sind sie weg, außer du hast ein Backup.
</div>

<h2>Backup</h2>
<div class="card">
  {#if tage === null}
    <p class="muted">Noch kein Backup erstellt.</p>
  {:else}
    <p class="muted">Letztes Backup: vor {tage} {tage === 1 ? 'Tag' : 'Tagen'}.</p>
  {/if}

  <label for="pw">Passwort (optional, verschlüsselt die Datei)</label>
  <input id="pw" type="password" bind:value={passwort} autocomplete="new-password" />
  <p class="muted">Passwort vergessen heißt: Backup nicht mehr lesbar. Es gibt keine Wiederherstellung.</p>

  <div class="row">
    <button on:click={sichern}>Backup speichern</button>
    <button class="sek" on:click={() => dateiInput.click()}>Backup laden</button>
  </div>
  <input bind:this={dateiInput} type="file" accept="application/json,.json" on:change={laden} style="display: none" />
  {#if meldung}<p class="hinweis">{meldung}</p>{/if}
</div>

<h2>Bericht</h2>
<div class="card">
  <p class="muted">Ein PDF mit Schmerzverlauf und Messwerten, z. B. zum Zeigen beim Physio. Das ist kein Backup und lässt sich nicht wieder importieren.</p>
  <label class="row" style="gap: 10px; flex-wrap: nowrap; color: var(--text); font-size: 0.95rem; margin: 0 0 12px">
    <input type="checkbox" bind:checked={mitTagebuch} />
    Tagebuchtexte zu Tagen mit starkem Schmerz mitnehmen
  </label>
  <button on:click={() => berichtErzeugen({ tagebuchTexte: mitTagebuch })}>PDF-Bericht erstellen</button>
</div>

<h2>Pack importieren</h2>
<div class="card">
  <p class="muted" style="margin-top: 0">Ein Pack enthält Shop-Belohnungen, Briefe, Abzeichen und Level-Stufen aus dem Betreuer-Bereich, z. B. von einem anderen Gerät.</p>
  <button class="sek" on:click={() => packInput.click()}>Pack-Datei wählen</button>
  <input bind:this={packInput} type="file" accept="application/json,.json" on:change={packLaden} style="display: none" />
  {#if packText}
    <label for="packpw">Pack-Passwort</label>
    <input id="packpw" type="password" autocomplete="off" bind:value={packPasswort} on:keydown={(e) => e.key === 'Enter' && packPasswort && packEinspielen(packText, packPasswort)} />
    <div class="row" style="margin-top: 10px">
      <button on:click={() => packEinspielen(packText, packPasswort)} disabled={!packPasswort}>Importieren</button>
      <button class="sek" on:click={() => { packText = null; packPasswort = ''; packMeldung = ''; }}>Abbrechen</button>
    </div>
  {/if}
  {#if packMeldung}<p class="hinweis">{packMeldung}</p>{/if}
</div>

<h2>Übungsbibliothek</h2>
<div class="card">
  <p class="muted" style="margin: 0">Die Bibliothek ist eine kleine, eigene Liste mit Übungsnamen. Sie ist in der App gespeichert, Suchen werden nicht online abgefragt.</p>
</div>
