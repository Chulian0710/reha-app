<script>
  import { onMount, onDestroy } from 'svelte';
  import { liveQuery } from 'dexie';
  import { db, setEinstellung, neueUid } from '../lib/db.js';
  import { regeln, schwellen, STANDARD_SCHWELLEN, aktivitaeten as aktivitaetenLaden, STANDARD_AKTIVITAETEN, STANDARD_REGELN } from '../lib/xp.js';
  import { BEDINGUNGEN, bedingungText } from '../lib/abzeichen.js';
  import { entsperrt, hatPasswort, passwortSetzen, passwortPruefen, zuruecksetzen, packHerunterladen } from '../lib/betreuer.js';
  import { gehe } from '../lib/nav.js';

  // Beim Verlassen des Bereichs wieder sperren
  onDestroy(() => entsperrt.set(false));

  let hat = null;
  onMount(async () => (hat = await hatPasswort()));

  // --- Passwort ---
  let pw = '';
  let pw2 = '';
  let fehler = '';

  async function festlegen() {
    fehler = '';
    if (pw.length < 4) return (fehler = 'Bitte mindestens 4 Zeichen.');
    if (pw !== pw2) return (fehler = 'Die Passwörter stimmen nicht überein.');
    await passwortSetzen(pw);
    hat = true;
    pw = pw2 = '';
    entsperrt.set(true);
    await laden();
  }

  async function anmelden() {
    fehler = '';
    if (await passwortPruefen(pw)) {
      pw = '';
      entsperrt.set(true);
      await laden();
    } else {
      fehler = 'Passwort falsch.';
    }
  }

  async function vergessen() {
    if (!confirm('Passwort zurücksetzen? Dabei werden alle Briefe gelöscht, damit nichts verraten wird. Belohnungen, Abzeichen und Fortschritt bleiben.')) return;
    await zuruecksetzen();
    hat = false;
  }

  function sperren() {
    entsperrt.set(false);
    gehe('mehr');
  }

  // --- Inhalte ---
  const belohnungen = liveQuery(() => db.belohnungen.toArray());
  const briefe = liveQuery(() => db.briefe.toArray());
  const abzeichen = liveQuery(() => db.abzeichen.toArray());

  let stufen = [];
  let r = null;
  let meldung = '';

  let akt = [];

  async function laden() {
    stufen = [...(await schwellen())];
    r = { ...(await regeln()) };
    akt = (await aktivitaetenLaden()).map((a) => ({ ...a }));
  }

  // Belohnungen
  let bel = { id: null, name: '', kosten: '' };
  function belBearbeiten(b) { bel = { id: b.id, name: b.name, kosten: b.kosten }; }
  async function belSpeichern() {
    const kosten = Number(bel.kosten);
    if (!bel.name.trim() || !(kosten > 0)) return;
    if (bel.id) await db.belohnungen.update(bel.id, { name: bel.name.trim(), kosten });
    else await db.belohnungen.add({ uid: neueUid(), name: bel.name.trim(), kosten });
    bel = { id: null, name: '', kosten: '' };
  }
  async function belLoeschen(b) {
    if (confirm(`„${b.name}“ löschen?`)) await db.belohnungen.delete(b.id);
  }

  // Level
  async function stufenSpeichern() {
    const werte = stufen.map(Number);
    if (werte[0] !== 0) return (meldung = 'Level 1 muss bei 0 XP beginnen.');
    for (let i = 1; i < werte.length; i++) {
      if (!(werte[i] > werte[i - 1])) return (meldung = `Level ${i + 1} muss mehr XP brauchen als Level ${i}.`);
    }
    await setEinstellung('levelSchwellen', werte);
    meldung = 'Level-Stufen gespeichert.';
  }
  function stufeDazu() {
    const n = stufen.length;
    const abstand = n > 1 ? Number(stufen[n - 1]) - Number(stufen[n - 2]) + 100 : 50;
    stufen = [...stufen, Number(stufen[n - 1]) + abstand];
  }
  function stufeWeg() {
    if (stufen.length > 2) stufen = stufen.slice(0, -1);
  }

  // Briefe
  let brief = null; // { id, titel, text, level }
  function briefNeu() { brief = { id: null, titel: '', text: '', level: 2 }; }
  function briefBearbeiten(b) { brief = { id: b.id, titel: b.titel, text: b.text, level: b.level }; }
  async function briefSpeichern() {
    const level = Number(brief.level);
    if (!brief.text.trim() || !(level >= 1)) return;
    const daten = { titel: brief.titel.trim(), text: brief.text, level };
    if (brief.id) await db.briefe.update(brief.id, daten);
    else await db.briefe.add({ uid: neueUid(), ...daten });
    brief = null;
  }
  async function briefLoeschen(b) {
    if (confirm(`Brief „${b.titel || 'ohne Titel'}“ löschen?`)) await db.briefe.delete(b.id);
  }

  // Abzeichen
  let abz = { name: '', typ: 'trainingstage', anzahl: 5 };
  async function abzSpeichern() {
    const anzahl = Number(abz.anzahl);
    if (!abz.name.trim() || !(anzahl >= 1)) return;
    await db.abzeichen.add({ uid: neueUid(), name: abz.name.trim(), typ: abz.typ, anzahl });
    abz = { name: '', typ: 'trainingstage', anzahl: 5 };
  }
  async function abzLoeschen(a) {
    if (confirm(`Abzeichen „${a.name}“ löschen?`)) await db.abzeichen.delete(a.id);
  }

  // Pack (immer verschlüsselt)
  let packPw = '';
  let packPw2 = '';
  let packMeldung = '';
  async function packExport() {
    packMeldung = '';
    try {
      await packHerunterladen(packPw);
      packPw = packPw2 = '';
      packMeldung = 'Pack exportiert. Nach dem Import auf dem anderen Handy die Datei dort und hier löschen.';
    } catch (e) {
      packMeldung = e.message;
    }
  }

  // XP-Regeln und Aktivitäten
  const xpZahl = (v) => Math.max(0, Math.round(Number(String(v ?? '').replace(',', '.')) || 0));
  let xpMeldung = '';
  async function regelnSpeichern() {
    await setEinstellung('xpRegeln', {
      uebungXp: xpZahl(r.uebungXp),
      aktivitaetXp: xpZahl(r.aktivitaetXp),
      bestwertXp: xpZahl(r.bestwertXp),
      zielXp: xpZahl(r.zielXp),
      bestwertProWoche: !!r.bestwertProWoche,
      ruhetagModus: r.ruhetagModus === 'fest' ? 'fest' : 'letzte',
      ruhetagXp: xpZahl(r.ruhetagXp),
      messungXp: xpZahl(r.messungXp),
      tagebuchXp: xpZahl(r.tagebuchXp)
    });
    await setEinstellung(
      'aktivitaeten',
      akt.filter((a) => String(a.name).trim()).map((a) => ({ name: String(a.name).trim(), xp: xpZahl(a.xp) }))
    );
    r = { ...(await regeln()) };
    akt = (await aktivitaetenLaden()).map((a) => ({ ...a }));
    xpMeldung = 'XP-Regeln gespeichert. Sie gelten ab jetzt, bereits vergebene XP bleiben.';
  }
  function aktDazu() {
    akt = [...akt, { name: '', xp: r.aktivitaetXp }];
  }
  function aktWeg(i) {
    akt = akt.filter((_, j) => j !== i);
  }
  function aktHoch(i) {
    if (i === 0) return;
    const n = [...akt];
    [n[i - 1], n[i]] = [n[i], n[i - 1]];
    akt = n;
  }
  function standardWiederherstellen() {
    r = { ...STANDARD_REGELN };
    akt = STANDARD_AKTIVITAETEN.map((a) => ({ ...a }));
    xpMeldung = 'Standardwerte eingesetzt. Zum Übernehmen „Speichern“ tippen.';
  }
</script>

<h1>Betreuer-Bereich</h1>

{#if hat === null}
  <p class="muted">Lädt …</p>
{:else if !hat}
  <div class="card">
    <p style="margin-top: 0">Lege ein Passwort fest. Damit sieht niemand versehentlich die Briefe, bevor sie freigeschaltet sind.</p>
    <label for="pw">Passwort</label>
    <input id="pw" type="password" bind:value={pw} autocomplete="new-password" />
    <label for="pw2">Passwort wiederholen</label>
    <input id="pw2" type="password" bind:value={pw2} autocomplete="new-password" />
    {#if fehler}<p class="fehler">{fehler}</p>{/if}
    <div style="margin-top: 12px"><button on:click={festlegen}>Passwort festlegen</button></div>
  </div>
  <p class="muted">Das Passwort schützt vor versehentlichem Spoilern. Gegen gezieltes Suchen im Browserspeicher schützt es nicht.</p>
{:else if !$entsperrt}
  <div class="card">
    <label for="pwl">Passwort</label>
    <input id="pwl" type="password" bind:value={pw} autocomplete="current-password" on:keydown={(e) => e.key === 'Enter' && anmelden()} />
    {#if fehler}<p class="fehler">{fehler}</p>{/if}
    <div style="margin-top: 12px"><button on:click={anmelden}>Öffnen</button></div>
  </div>
  <button class="link" on:click={vergessen}>Passwort vergessen?</button>
{:else if r}
  <div class="row" style="justify-content: flex-end; margin-top: -8px">
    <button class="sek" on:click={sperren}>Sperren</button>
  </div>
  {#if meldung}<p class="hinweis">{meldung}</p>{/if}

  <h2>Belohnungen</h2>
  <div class="card">
    {#each $belohnungen || [] as b (b.id)}
      <div class="zeile">
        <span class="zeile-text">{b.name}<br /><span class="muted">{b.kosten} XP</span></span>
        <span class="row" style="flex-wrap: nowrap; gap: 6px">
          <button class="sek klein" on:click={() => belBearbeiten(b)}>Bearbeiten</button>
          <button class="sek klein" aria-label="Löschen" on:click={() => belLoeschen(b)}>✕</button>
        </span>
      </div>
    {/each}
    <strong style="display: block; margin-top: 12px">{bel.id ? 'Belohnung bearbeiten' : 'Neue Belohnung'}</strong>
    <label for="bname">Name (z. B. „Gemeinsamer Kinobesuch“)</label>
    <input id="bname" bind:value={bel.name} />
    <label for="bkosten">Preis (XP)</label>
    <input id="bkosten" inputmode="numeric" bind:value={bel.kosten} />
    <div class="row" style="margin-top: 10px">
      <button on:click={belSpeichern}>Speichern</button>
      {#if bel.id}<button class="sek" on:click={() => (bel = { id: null, name: '', kosten: '' })}>Abbrechen</button>{/if}
    </div>
  </div>

  <h2>Level-Stufen</h2>
  <div class="card">
    <p class="muted" style="margin-top: 0">Ab wie vielen gesammelten XP ein Level beginnt. Nach der letzten Stufe geht es automatisch weiter, mit wachsendem Abstand.</p>
    <div class="stufen">
      {#each stufen as s, i}
        <div>
          <label for="st{i}">Level {i + 1}</label>
          <input id="st{i}" inputmode="numeric" bind:value={stufen[i]} disabled={i === 0} />
        </div>
      {/each}
    </div>
    <div class="row" style="margin-top: 12px">
      <button on:click={stufenSpeichern}>Speichern</button>
      <button class="sek" on:click={stufeDazu}>Level dazu</button>
      <button class="sek" on:click={stufeWeg} disabled={stufen.length <= 2}>Letztes weg</button>
      <button class="link" on:click={() => (stufen = [...STANDARD_SCHWELLEN])}>Standard</button>
    </div>
  </div>

  <h2>Briefe</h2>
  <div class="card">
    {#each ($briefe || []).slice().sort((a, b) => a.level - b.level) as b (b.id)}
      <div class="zeile">
        <span class="zeile-text">{b.titel || 'Ohne Titel'}<br /><span class="muted">öffnet bei Level {b.level}</span></span>
        <span class="row" style="flex-wrap: nowrap; gap: 6px">
          <button class="sek klein" on:click={() => briefBearbeiten(b)}>Bearbeiten</button>
          <button class="sek klein" aria-label="Löschen" on:click={() => briefLoeschen(b)}>✕</button>
        </span>
      </div>
    {/each}
    {#if brief}
      <div style="margin-top: 12px">
        <label for="btitel">Titel (sieht sie erst nach dem Öffnen)</label>
        <input id="btitel" bind:value={brief.titel} />
        <label for="btext">Text</label>
        <textarea id="btext" bind:value={brief.text} style="min-height: 180px"></textarea>
        <label for="blevel">Öffnet bei Level</label>
        <input id="blevel" inputmode="numeric" bind:value={brief.level} />
        <p class="hinweis">Bis dahin sieht sie nur: „Verschlossener Brief, öffnet bei Level {brief.level}“.</p>
        <div class="row">
          <button on:click={briefSpeichern}>Speichern</button>
          <button class="sek" on:click={() => (brief = null)}>Abbrechen</button>
        </div>
      </div>
    {:else}
      <div style="margin-top: 10px"><button class="sek" on:click={briefNeu}>Neuen Brief schreiben</button></div>
    {/if}
  </div>

  <h2>Abzeichen</h2>
  <div class="card">
    {#each $abzeichen || [] as a (a.id)}
      <div class="zeile">
        <span class="zeile-text">{a.name}<br /><span class="muted">bei {bedingungText(a)}</span></span>
        <button class="sek klein" aria-label="Löschen" on:click={() => abzLoeschen(a)}>✕</button>
      </div>
    {/each}
    <strong style="display: block; margin-top: 12px">Neues Abzeichen</strong>
    <label for="aname">Name</label>
    <input id="aname" bind:value={abz.name} />
    <div class="row" style="flex-wrap: nowrap">
      <div style="flex: 2; min-width: 0">
        <label for="atyp">Bedingung</label>
        <select id="atyp" bind:value={abz.typ}>
          {#each Object.entries(BEDINGUNGEN) as [id, label]}<option value={id}>{label}</option>{/each}
        </select>
      </div>
      <div style="flex: 1; min-width: 0"><label for="aanz">Anzahl</label><input id="aanz" inputmode="numeric" bind:value={abz.anzahl} /></div>
    </div>
    <div style="margin-top: 10px"><button on:click={abzSpeichern}>Hinzufügen</button></div>
  </div>

  <h2>XP-Regeln</h2>
  <div class="card">
    <p class="muted" style="margin-top: 0">So viele XP gibt es für jede Tätigkeit. Änderungen gelten ab jetzt, bereits vergebene XP bleiben.</p>
    <div class="xp-regeln">
      <label for="rue">Übung abgehakt<span class="muted">Standard, wenn im Plan nichts anderes steht</span></label>
      <input id="rue" inputmode="numeric" bind:value={r.uebungXp} />

      <label for="rbw">Neuer Bestwert<span class="muted">schwerster Satz einer Übung</span></label>
      <input id="rbw" inputmode="numeric" bind:value={r.bestwertXp} />

      <label for="rzi">Ziel erreicht</label>
      <input id="rzi" inputmode="numeric" bind:value={r.zielXp} />

      <label for="rme">Messung eingetragen<span class="muted">höchstens einmal pro Tag</span></label>
      <input id="rme" inputmode="numeric" bind:value={r.messungXp} />

      <label for="rtb">Tagebuch geschrieben<span class="muted">höchstens einmal pro Tag</span></label>
      <input id="rtb" inputmode="numeric" bind:value={r.tagebuchXp} />

      <label for="rak">Eigene Aktivität<span class="muted">„Etwas anderes“ auf der ersten Seite</span></label>
      <input id="rak" inputmode="numeric" bind:value={r.aktivitaetXp} />
    </div>

    <span class="feldname">Ruhetag</span>
    <div class="chips" role="group" aria-label="XP für Ruhetage">
      <button class="chip" class:an={r.ruhetagModus !== 'fest'} aria-pressed={r.ruhetagModus !== 'fest'} on:click={() => (r.ruhetagModus = 'letzte')}>Wie letzte Trainingseinheit</button>
      <button class="chip" class:an={r.ruhetagModus === 'fest'} aria-pressed={r.ruhetagModus === 'fest'} on:click={() => (r.ruhetagModus = 'fest')}>Fester Wert</button>
    </div>
    {#if r.ruhetagModus === 'fest'}
      <div class="xp-regeln" style="margin-top: 8px">
        <label for="rrt">XP pro Ruhetag</label>
        <input id="rrt" inputmode="numeric" bind:value={r.ruhetagXp} />
      </div>
    {:else}
      <p class="muted" style="margin: 6px 0 0">Ein Ruhetag gibt so viele XP wie das letzte Training. Gab es noch keins, den Standardwert für eine Übung.</p>
    {/if}

    <div class="zeile" style="border: none; margin-top: 6px">
      <input id="rpw" type="checkbox" bind:checked={r.bestwertProWoche} />
      <label for="rpw" class="zeile-text">Höchstens ein Bestwert-Bonus pro Übung und Woche</label>
    </div>
  </div>

  <h2>Aktivitäten</h2>
  <div class="card">
    <p class="muted" style="margin-top: 0">Diese Aktivitäten stehen auf der ersten Seite zum Eintragen.</p>
    {#each akt as a, i}
      <div class="akt-zeile">
        <input aria-label="Name der Aktivität {i + 1}" bind:value={a.name} placeholder="Name" />
        <input aria-label="XP für {a.name || 'Aktivität ' + (i + 1)}" inputmode="numeric" bind:value={a.xp} class="akt-xp" />
        <span class="muted">XP</span>
        <button class="sek klein" aria-label="Nach oben" disabled={i === 0} on:click={() => aktHoch(i)}>↑</button>
        <button class="sek klein gefahr" aria-label="Entfernen" on:click={() => aktWeg(i)}>✕</button>
      </div>
    {/each}
    <button class="link" style="margin-top: 10px" on:click={aktDazu}>+ Aktivität hinzufügen</button>
  </div>

  <div class="row" style="margin-bottom: 8px">
    <button on:click={regelnSpeichern}>XP-Regeln speichern</button>
    <button class="sek" on:click={standardWiederherstellen}>Standardwerte</button>
  </div>
  {#if xpMeldung}<p class="hinweis">{xpMeldung}</p>{/if}

  <h2>Pack</h2>
  <div class="card">
    <p class="muted" style="margin-top: 0">Exportiert Belohnungen, Briefe, Abzeichen, Level, XP-Regeln und Aktivitäten als verschlüsselte Datei. Auf dem anderen Handy unter Mehr → Daten importieren, dort wird das Passwort abgefragt. Der Fortschritt dort bleibt erhalten.</p>
    <label for="packpw">Passwort für den Pack (mindestens 4 Zeichen)</label>
    <input id="packpw" type="password" autocomplete="new-password" bind:value={packPw} />
    <label for="packpw2">Passwort wiederholen</label>
    <input id="packpw2" type="password" autocomplete="new-password" bind:value={packPw2} />
    <p class="muted">Am einfachsten dasselbe wie dein Betreuer-Passwort. Ohne dieses Passwort lässt sich der Pack nicht öffnen.</p>
    {#if packPw2 && packPw !== packPw2}<p class="fehler">Die Passwörter stimmen nicht überein.</p>{/if}
    <button on:click={packExport} disabled={packPw.length < 4 || packPw !== packPw2}>Pack exportieren</button>
    {#if packMeldung}<p class="hinweis">{packMeldung}</p>{/if}
  </div>
{/if}
