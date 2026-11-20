<script>
  import { onMount, onDestroy } from 'svelte';
  import { liveQuery } from 'dexie';
  import { db, setEinstellung, neueUid, heute } from '../lib/db.js';
  import { kurz } from '../lib/datum.js';
  import Gel from '../lib/Gel.svelte';
  import Medaille from '../lib/Medaille.svelte';
  import { regeln, schwellen, levelGels, gelsFuerLevel, STANDARD_SCHWELLEN, aktivitaeten as aktivitaetenLaden, STANDARD_AKTIVITAETEN, STANDARD_REGELN } from '../lib/xp.js';
  import { BEDINGUNGEN, KRITERIEN, kriterienFuer, bedingungText } from '../lib/abzeichen.js';
  import { streckeEinheit } from '../lib/ausdauer.js';
  import { BIBLIOTHEK, KATEGORIEN } from '../lib/bibliothek.js';
  import { gelsSchenken } from '../lib/gels.js';
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
  const wuensche = liveQuery(() => db.wuensche.where('status').equals('offen').toArray());
  const offeneEinl = liveQuery(async () => (await db.einloesungen.toArray()).filter((e) => !e.erhalten).sort((a, b) => a.id - b.id));
  const geschenke = liveQuery(async () => (await db.gelLog.toArray()).filter((g) => g.art === 'geschenk').sort((a, b) => b.id - a.id).slice(0, 5));

  // Alle Übungen für Abzeichen: gespeicherte und die aus der Bibliothek, je Name nur einmal, nach Art gruppiert
  const uebungsGruppen = liveQuery(async () => {
    const gesehen = new Set();
    const alle = [];
    for (const u of [...(await db.uebungen.toArray()), ...BIBLIOTHEK]) {
      const k = u.name.trim().toLowerCase();
      if (gesehen.has(k)) continue;
      gesehen.add(k);
      alle.push({ name: u.name.trim(), kategorie: KATEGORIEN[u.kategorie] ? u.kategorie : 'reha', einheit: streckeEinheit(u) });
    }
    return {
      info: Object.fromEntries(alle.map((u) => [u.name, u])),
      gruppen: Object.entries(KATEGORIEN).map(([id, label]) => ({
        label,
        namen: alle.filter((u) => u.kategorie === id).map((u) => u.name).sort((a, b) => a.localeCompare(b, 'de'))
      }))
    };
  });
  // Gewählte Übung beim Abzeichen: Ausdauer? Dann passen andere Kriterien (Strecke, Dauer statt Gewicht).
  $: abzUebung = abz.typ === 'uebung' && abz.uebung ? $uebungsGruppen?.info[abz.uebung] : null;
  $: abzAusdauer = abzUebung ? abzUebung.kategorie === 'ausdauer' : !!abz.einheit;
  $: abzEinheit = abzUebung?.einheit || abz.einheit || 'km';
  $: abzKriterien = kriterienFuer(abzAusdauer);
  // erst zurücksetzen, wenn die Übung bekannt ist (sonst ginge beim Bearbeiten das Kriterium verloren)
  $: if (abz.typ === 'uebung' && abzUebung && !abzKriterien.some(([id]) => id === abz.kriterium)) abz.kriterium = 'anzahl';

  let stufen = [];
  let stufenGels = []; // Gels je Level, Index wie stufen (Level 1 hat keine)
  let r = null;
  let meldung = '';

  let akt = [];

  async function laden() {
    r = { ...(await regeln()) };
    stufen = [...(await schwellen())];
    const lg = await levelGels();
    stufenGels = stufen.map((_, i) => (i === 0 ? 0 : gelsFuerLevel(lg, i + 1, r)));
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

  async function uebergeben(e) {
    await db.einloesungen.update(e.id, { erhalten: heute() });
  }

  // Wünsche: Preis festlegen und in den Shop stellen, oder ablehnen
  let wPreis = {};
  let wAntwort = {};
  async function wunschFreigeben(x) {
    const kosten = Math.round(Number(String(wPreis[x.id] ?? '').replace(',', '.')));
    if (!(kosten > 0)) return alert('Bitte einen Preis in Gels eingeben.');
    await db.transaction('rw', db.belohnungen, db.wuensche, async () => {
      await db.belohnungen.add({ uid: neueUid(), name: x.name, kosten, gewuenscht: true });
      await db.wuensche.delete(x.id);
    });
  }
  async function wunschAblehnen(x) {
    await db.wuensche.update(x.id, { status: 'abgelehnt', antwort: (wAntwort[x.id] || '').trim() });
  }

  // Gels: Regeln (eigener Speichern-Knopf) und schenken
  let gelMeldung = '';
  async function gelRegelnSpeichern() {
    await setEinstellung('xpRegeln', { ...(await regeln()), gelsProAbzeichen: xpZahl(r.gelsProAbzeichen) });
    gelMeldung = 'Gespeichert. Gilt als Vorschlag für neue Abzeichen.';
  }
  let gs = { gels: '', grund: '' };
  async function schenken() {
    const gels = Math.round(Number(String(gs.gels).replace(',', '.')));
    if (!(gels > 0)) return;
    await gelsSchenken(gels, gs.grund.trim());
    gs = { gels: '', grund: '' };
  }
  async function geschenkWeg(g) {
    if (confirm(`Geschenk über ${g.gels} Gels zurücknehmen?`)) await db.gelLog.delete(g.id);
  }

  // Level
  async function stufenSpeichern() {
    const werte = stufen.map(Number);
    if (werte[0] !== 0) return (meldung = 'Level 1 muss bei 0 XP beginnen.');
    for (let i = 1; i < werte.length; i++) {
      if (!(werte[i] > werte[i - 1])) return (meldung = `Level ${i + 1} muss mehr XP brauchen als Level ${i}.`);
    }
    await setEinstellung('levelSchwellen', werte);
    await setEinstellung('levelGels', stufenGels.map((g, i) => (i === 0 ? 0 : xpZahl(g))));
    await setEinstellung('xpRegeln', { ...(await regeln()), gelsProLevel: xpZahl(r.gelsProLevel) });
    meldung = 'Level-Stufen und Gels gespeichert. Bereits vergebene Gels bleiben, wie sie sind.';
  }
  function stufeDazu() {
    const n = stufen.length;
    const abstand = n > 1 ? Number(stufen[n - 1]) - Number(stufen[n - 2]) + 100 : 50;
    stufen = [...stufen, Number(stufen[n - 1]) + abstand];
    stufenGels = [...stufenGels, n > 1 ? stufenGels[n - 1] : r.gelsProLevel];
  }
  function stufeWeg() {
    if (stufen.length <= 2) return;
    stufen = stufen.slice(0, -1);
    stufenGels = stufenGels.slice(0, -1);
  }
  function stufenStandard() {
    stufen = [...STANDARD_SCHWELLEN];
    stufenGels = STANDARD_SCHWELLEN.map((_, i) => (i === 0 ? 0 : STANDARD_REGELN.gelsProLevel));
    r.gelsProLevel = STANDARD_REGELN.gelsProLevel;
  }
  // Was nach der letzten Stufe kommt (zur Anzeige)
  $: naechsteStufe = stufen.length ? (() => {
    const n = stufen.length;
    const abstand = (n > 1 ? Number(stufen[n - 1]) - Number(stufen[n - 2]) : 50) + 100;
    return Number(stufen[n - 1]) + abstand;
  })() : 0;

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
  const abzLeer = () => ({ name: '', typ: 'uebung', uebung: '', kriterium: 'anzahl', anzahl: 1, gels: '' });
  let abz = abzLeer();
  let abzFehler = '';
  let abzForm;
  function abzBearbeiten(a) {
    abzFehler = '';
    abz = { id: a.id, uid: a.uid, name: a.name, typ: a.typ, uebung: a.uebung || '', kriterium: a.kriterium || 'anzahl', einheit: a.einheit, anzahl: a.anzahl, gels: a.gels ?? '' };
    abzForm?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  $: abzVorschau = abz.typ === 'uebung' && !abz.uebung ? '' : bedingungText({ ...abz, einheit: abzEinheit, anzahl: Number(String(abz.anzahl).replace(',', '.')) || 0 });
  async function abzSpeichern() {
    abzFehler = '';
    const anzahl = Number(String(abz.anzahl).replace(',', '.'));
    if (abz.typ === 'uebung' && !abz.uebung) return (abzFehler = 'Bitte eine Übung wählen.');
    if (!(anzahl > 0)) return (abzFehler = 'Bitte eine Zahl größer als 0 eingeben.');
    const gels = String(abz.gels).trim() === '' ? xpZahl(r.gelsProAbzeichen) : xpZahl(abz.gels);
    const daten = { uid: abz.uid || neueUid(), name: abz.name.trim() || abzVorschau, typ: abz.typ, anzahl, gels };
    if (abz.typ === 'uebung') Object.assign(daten, { uebung: abz.uebung, kriterium: abz.kriterium, ...(abzAusdauer ? { einheit: abzEinheit } : {}) });
    // put ersetzt das ganze Abzeichen (alte Felder wie uebung fallen weg); die uid bleibt, damit es keine zweiten Gels gibt
    if (abz.id) await db.abzeichen.put({ id: abz.id, ...daten });
    else await db.abzeichen.add(daten);
    abz = abzLeer();
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
      physioXp: xpZahl(r.physioXp),
      bestwertProWoche: !!r.bestwertProWoche,
      ruhetagModus: r.ruhetagModus === 'fest' ? 'fest' : 'letzte',
      ruhetagXp: xpZahl(r.ruhetagXp),
      messungXp: xpZahl(r.messungXp),
      tagebuchXp: xpZahl(r.tagebuchXp),
      gelsProLevel: xpZahl(r.gelsProLevel),
      gelsProAbzeichen: xpZahl(r.gelsProAbzeichen)
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

  {#if $wuensche?.length}
    <h2>Wünsche</h2>
    <div class="card">
      <p class="muted" style="margin-top: 0">Leg einen Preis in Gels fest, dann steht der Wunsch im Shop. Oder lehne ihn ab, gern mit einem kurzen Satz.</p>
      {#each $wuensche as x (x.id)}
        <div class="wunsch">
          <strong>{x.name}</strong>
          <span class="muted">gewünscht am {kurz(x.datum)}</span>
          {#if x.notiz}<p style="margin: 4px 0 0; white-space: pre-line">{x.notiz}</p>{/if}
          <div class="wunsch-felder">
            <div>
              <label for="wp{x.id}">Preis (Gels)</label>
              <input id="wp{x.id}" inputmode="numeric" bind:value={wPreis[x.id]} />
            </div>
            <div>
              <label for="wa{x.id}">Antwort bei Ablehnung (optional)</label>
              <input id="wa{x.id}" bind:value={wAntwort[x.id]} />
            </div>
          </div>
          <div class="row" style="margin-top: 10px">
            <button on:click={() => wunschFreigeben(x)}>In den Shop</button>
            <button class="sek gefahr" on:click={() => wunschAblehnen(x)}>Ablehnen</button>
          </div>
        </div>
      {/each}
    </div>
  {/if}

  {#if $offeneEinl?.length}
    <h2>Eingelöst, noch zu übergeben</h2>
    <div class="card">
      {#each $offeneEinl as e (e.id)}
        <div class="zeile">
          <span class="zeile-text">{e.name}<br /><span class="muted">eingelöst am {kurz(e.datum)} · {e.kosten} Gels</span></span>
          <button class="sek klein" on:click={() => uebergeben(e)}>Übergeben</button>
        </div>
      {/each}
    </div>
  {/if}

  <h2>Shop</h2>
  <div class="card">
    {#each $belohnungen || [] as b (b.id)}
      <div class="zeile">
        <span class="zeile-text">{b.name}<br /><span class="muted gel-preis"><Gel groesse={14} /> {b.kosten} Gels{b.gewuenscht ? ' · gewünscht' : ''}</span></span>
        <span class="row" style="flex-wrap: nowrap; gap: 6px">
          <button class="sek klein" on:click={() => belBearbeiten(b)}>Bearbeiten</button>
          <button class="sek klein" aria-label="Löschen" on:click={() => belLoeschen(b)}>✕</button>
        </span>
      </div>
    {/each}
    <strong style="display: block; margin-top: 12px">{bel.id ? 'Belohnung bearbeiten' : 'Neue Belohnung'}</strong>
    <label for="bname">Name (z. B. „Gemeinsamer Kinobesuch“)</label>
    <input id="bname" bind:value={bel.name} />
    <label for="bkosten">Preis (Gels)</label>
    <input id="bkosten" inputmode="numeric" bind:value={bel.kosten} />
    <div class="row" style="margin-top: 10px">
      <button on:click={belSpeichern}>Speichern</button>
      {#if bel.id}<button class="sek" on:click={() => (bel = { id: null, name: '', kosten: '' })}>Abbrechen</button>{/if}
    </div>
  </div>

  <h2>Gels</h2>
  <div class="card">
    <p class="muted" style="margin-top: 0">Gels gibt es nur für Level-Aufstiege (je Level unter Level-Stufen), Abzeichen (je Abzeichen) und als Geschenk von dir. Jede Gutschrift gibt es einmal, auch wenn ein Level später erneut erreicht wird.</p>
    <div class="xp-regeln">
      <label for="gab">Pro Abzeichen<span class="muted">Vorschlag für neue Abzeichen, jedes hat seinen eigenen Wert</span></label>
      <input id="gab" inputmode="numeric" bind:value={r.gelsProAbzeichen} />
    </div>
    <div style="margin-top: 10px"><button class="sek" on:click={gelRegelnSpeichern}>Speichern</button></div>
    {#if gelMeldung}<p class="hinweis">{gelMeldung}</p>{/if}

    <strong style="display: block; margin-top: 18px">Gels schenken</strong>
    <p class="muted" style="margin: 4px 0 0">Für etwas Besonderes, z. B. einen schweren Tag gut überstanden. XP und Level ändern sich dadurch nicht.</p>
    <div class="row" style="flex-wrap: nowrap; align-items: flex-end">
      <div style="flex: 1; min-width: 0"><label for="gsg">Gels</label><input id="gsg" inputmode="numeric" bind:value={gs.gels} /></div>
      <div style="flex: 3; min-width: 0"><label for="gsr">Wofür (sieht sie im Shop)</label><input id="gsr" bind:value={gs.grund} /></div>
    </div>
    <div style="margin-top: 10px"><button on:click={schenken}>Schenken</button></div>
    {#each $geschenke || [] as g (g.id)}
      <div class="zeile">
        <span class="zeile-text">+{g.gels} Gels{g.grund ? ` · ${g.grund}` : ''}<br /><span class="muted">{kurz(g.datum)}</span></span>
        <button class="sek klein" aria-label="Zurücknehmen" on:click={() => geschenkWeg(g)}>✕</button>
      </div>
    {/each}
  </div>

  <h2>Level-Stufen</h2>
  <div class="card">
    <p class="muted" style="margin-top: 0">Ab wie vielen gesammelten XP ein Level beginnt und wie viele Gels es beim Erreichen gibt. Nach der letzten Stufe geht es automatisch weiter, mit wachsendem Abstand.</p>
    <div class="stufen-tabelle">
      <span class="muted">Level</span><span class="muted">ab XP</span><span class="muted">Gels</span>
      {#each stufen as s, i}
        <strong>{i + 1}</strong>
        <input aria-label="XP für Level {i + 1}" inputmode="numeric" bind:value={stufen[i]} disabled={i === 0} />
        {#if i === 0}
          <span class="muted stufe-start">Start</span>
        {:else}
          <input aria-label="Gels für Level {i + 1}" inputmode="numeric" bind:value={stufenGels[i]} class="stufe-gels" />
        {/if}
      {/each}
      <strong class="muted">{stufen.length + 1}+</strong>
      <span class="muted stufe-weiter">ab {naechsteStufe} XP, automatisch</span>
      <input aria-label="Gels für jedes weitere Level" inputmode="numeric" bind:value={r.gelsProLevel} class="stufe-gels" />
    </div>
    <div class="row" style="margin-top: 12px">
      <button on:click={stufenSpeichern}>Speichern</button>
      <button class="sek" on:click={stufeDazu}>Level dazu</button>
      <button class="sek" on:click={stufeWeg} disabled={stufen.length <= 2}>Letztes weg</button>
      <button class="link" on:click={stufenStandard}>Standard</button>
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
      <div class="zeile" class:in-bearbeitung={abz.id === a.id}>
        <Medaille groesse={30} />
        <span class="zeile-text">{a.name}<br /><span class="muted">bei {bedingungText(a)} · {a.gels ?? r.gelsProAbzeichen} Gels</span></span>
        <span class="row" style="flex-wrap: nowrap; gap: 6px">
          <button class="sek klein" on:click={() => abzBearbeiten(a)}>Bearbeiten</button>
          <button class="sek klein" aria-label="Löschen" on:click={() => abzLoeschen(a)}>✕</button>
        </span>
      </div>
    {/each}
    <strong style="display: block; margin-top: 12px" bind:this={abzForm}>{abz.id ? `„${abz.name}“ bearbeiten` : 'Neues Abzeichen'}</strong>
    <label for="atyp">Bedingung</label>
    <select id="atyp" bind:value={abz.typ}>
      {#each Object.entries(BEDINGUNGEN) as [id, label]}<option value={id}>{label}</option>{/each}
    </select>
    {#if abz.typ === 'uebung'}
      <label for="aueb">Übung</label>
      <select id="aueb" bind:value={abz.uebung}>
        <option value="" disabled>Übung wählen …</option>
        {#each $uebungsGruppen?.gruppen || [] as g}
          {#if g.namen.length}
            <optgroup label={g.label}>
              {#each g.namen as n}<option value={n}>{n}</option>{/each}
            </optgroup>
          {/if}
        {/each}
      </select>
      <label for="akrit">Was zählt</label>
      <select id="akrit" bind:value={abz.kriterium}>
        {#each abzKriterien as [id, k]}<option value={id}>{k.label}</option>{/each}
      </select>
    {/if}
    <div class="row" style="flex-wrap: nowrap">
      <div style="flex: 2; min-width: 0">
        <label for="aanz">{abz.typ === 'uebung' ? KRITERIEN[abz.kriterium].feld(abzEinheit) : abz.typ === 'level' ? 'Level' : 'Anzahl'}</label>
        <input id="aanz" inputmode="decimal" bind:value={abz.anzahl} />
      </div>
      <div style="flex: 1; min-width: 0">
        <label for="agels">Gels</label>
        <input id="agels" inputmode="numeric" bind:value={abz.gels} placeholder={String(r.gelsProAbzeichen)} />
      </div>
    </div>
    <label for="aname">Name (optional)</label>
    <input id="aname" bind:value={abz.name} placeholder={abzVorschau || 'z. B. Wasserratte'} />
    {#if abzVorschau}<p class="muted" style="margin: 6px 0 0">Erreicht bei: {abzVorschau}</p>{/if}
    {#if abz.id}<p class="hinweis">Wurde das Abzeichen schon erreicht, bleiben die dafür vergebenen Gels unverändert.</p>{/if}
    {#if abzFehler}<p class="fehler">{abzFehler}</p>{/if}
    <div class="row" style="margin-top: 10px">
      <button on:click={abzSpeichern}>{abz.id ? 'Speichern' : 'Hinzufügen'}</button>
      {#if abz.id}<button class="sek" on:click={() => (abz = abzLeer())}>Abbrechen</button>{/if}
    </div>
  </div>

  <h2>XP-Regeln</h2>
  <div class="card">
    <p class="muted" style="margin-top: 0">So viele XP gibt es für jede Tätigkeit. Änderungen gelten ab jetzt, bereits vergebene XP bleiben.</p>
    <div class="xp-regeln">
      <label for="rue">Übung abgehakt<span class="muted">Standard, wenn im Plan nichts anderes steht</span></label>
      <input id="rue" inputmode="numeric" bind:value={r.uebungXp} />

      <label for="rbw">Neuer Bestwert<span class="muted">schwerster Satz einer Übung</span></label>
      <input id="rbw" inputmode="numeric" bind:value={r.bestwertXp} />

      <label for="rph">Physiotherapie besucht<span class="muted">höchstens einmal pro Tag</span></label>
      <input id="rph" inputmode="numeric" bind:value={r.physioXp} />

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
    <p class="muted" style="margin-top: 0">Exportiert Shop-Belohnungen, Briefe, Abzeichen, Level, XP-Regeln und Aktivitäten als verschlüsselte Datei. Auf dem anderen Handy unter Mehr → Daten importieren, dort wird das Passwort abgefragt. Der Fortschritt dort bleibt erhalten.</p>
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
