<script>
  import { istAusdauer, streckeEinheit } from '../lib/ausdauer.js';
  import { onMount } from 'svelte';
  import { liveQuery } from 'dexie';
  import { db, heute } from '../lib/db.js';
  import { kurz, parse } from '../lib/datum.js';
  import { regeln } from '../lib/xp.js';
  import { loeschenMitUndo } from '../lib/toast.js';
  import Sheet from '../lib/Sheet.svelte';
  import SwipeRow from '../lib/SwipeRow.svelte';
  import { zieleMitStand, zielePruefen, zielAbhaken, zielZuruecknehmen, bestwerteJeUebung, umfangReihen, zahlText } from '../lib/ziele.js';

  export let params = {};

  const h = heute();
  let hinweis = '';
  let zielXp = 50;

  onMount(async () => {
    zielXp = (await regeln()).zielXp;
    await umfangReihen();
    const neu = await zielePruefen();
    if (neu.length) hinweis = `Ziel erreicht: ${neu.join(', ')}!`;
  });

  const daten = liveQuery(async () => {
    const ziele = await zieleMitStand();
    // gelöschte Übungen nur noch, wenn ein Ziel sie verwendet
    const inZielen = new Set(ziele.map((z) => z.uebungId));
    return {
      ziele,
      uebungen: (await db.uebungen.toArray()).filter((u) => !u.geloescht || inZielen.has(u.id)).sort((a, b) => a.name.localeCompare(b.name, 'de')),
      reihen: (await db.reihen.toArray()).filter((r) => r.typ !== 'kraft'),
      best: await bestwerteJeUebung()
    };
  });
  $: d = $daten;
  $: offen = d ? d.ziele.filter((z) => !z.erreicht) : [];
  $: erreicht = d ? d.ziele.filter((z) => z.erreicht) : [];

  // --- neues Ziel ---
  let zeigeNeu = !!params.neu;
  let f = leer();
  function leer() {
    return { art: 'mess', titel: '', quelle: 'uebung', uebungId: '', reiheId: '', seite: 'L', einheit: '', ziel: '', start: '', frist: '', notiz: '' };
  }
  $: reihe = d && f.reiheId ? d.reihen.find((r) => r.id === Number(f.reiheId)) : null;
  $: reiheSeitig = reihe ? reihe.typ === 'umfang' || reihe.typ === 'beweglichkeit' : false;
  $: uebung = d && f.uebungId ? d.uebungen.find((u) => u.id === Number(f.uebungId)) : null;
  $: einheit = f.quelle === 'uebung' ? (istAusdauer(uebung) ? streckeEinheit(uebung) : 'kg') : f.quelle === 'reihe' ? reihe?.einheit || '' : f.einheit.trim();

  // aktueller Wert als Hilfe beim Anlegen
  let jetzt = null;
  $: aktualisieren(f.quelle, f.uebungId, f.reiheId, f.seite, reiheSeitig, d);
  async function aktualisieren(quelle, uebungId, reiheId, seite, seitig) {
    jetzt = null;
    if (quelle === 'uebung' && uebungId && d) {
      const u = d.uebungen.find((x) => x.id === Number(uebungId));
      jetzt = (istAusdauer(u) ? d.best[Number(uebungId)]?.strecke : d.best[Number(uebungId)]?.gewicht) ?? null;
    }
    if (quelle === 'reihe' && reiheId) {
      const w = (await db.werte.where('reiheId').equals(Number(reiheId)).toArray()).filter((x) => !seitig || x.seite === seite);
      w.sort((a, b) => a.datum.localeCompare(b.datum) || a.id - b.id);
      jetzt = w.length ? w[w.length - 1].wert : null;
    }
  }

  const alsZahl = (v) => (String(v).trim() === '' ? null : Number(String(v).replace(',', '.')));

  $: beispiel = f.art === 'mess' ? 'z. B. Beinpresse 40 kg, 30 Minuten spazieren' : 'z. B. Erster Sprung, Treppe ohne Geländer';

  $: fehler = (() => {
    if (!f.titel.trim()) return 'Bitte gib dem Ziel einen Namen.';
    if (f.art === 'frei') return '';
    if (f.quelle === 'uebung' && !f.uebungId) return 'Bitte eine Übung wählen.';
    if (f.quelle === 'reihe' && !f.reiheId) return 'Bitte einen Messwert wählen.';
    const z = alsZahl(f.ziel);
    if (z === null || Number.isNaN(z)) return 'Bitte einen Zielwert eintragen.';
    return '';
  })();

  async function anlegen() {
    if (fehler) return;
    const mess = f.art === 'mess';
    const z = {
      art: f.art,
      titel: f.titel.trim(),
      quelle: mess ? f.quelle : null,
      uebungId: mess && f.quelle === 'uebung' ? Number(f.uebungId) : null,
      reiheId: mess && f.quelle === 'reihe' ? Number(f.reiheId) : null,
      seite: mess && f.quelle === 'reihe' ? (reiheSeitig ? f.seite : '-') : null,
      einheit: mess ? einheit : null,
      ziel: mess ? alsZahl(f.ziel) : null,
      // Ausgangswert: leer heißt 0, bei Messwerten ist der aktuelle Wert vorgeschlagen
      start: mess ? alsZahl(f.start) : null,
      verlauf: mess && f.quelle === 'manuell' && alsZahl(f.start) !== null ? [{ datum: h, wert: alsZahl(f.start) }] : [],
      frist: f.frist || null,
      notiz: f.notiz.trim() || null,
      erreicht: null,
      erstellt: h
    };
    await db.ziele.add(z);
    f = leer();
    zeigeNeu = false;
    const neu = await zielePruefen();
    hinweis = neu.length ? `Ziel erreicht: ${neu.join(', ')}!` : 'Ziel angelegt.';
  }

  function startVorschlagen() {
    if (jetzt !== null) f.start = String(jetzt).replace('.', ',');
  }

  // --- Ziele bearbeiten ---
  let stand = {};
  async function standEintragen(z) {
    const w = alsZahl(stand[z.id] ?? '');
    if (w === null || Number.isNaN(w)) return;
    await db.ziele.update(z.id, { verlauf: [...(z.verlauf || []), { datum: h, wert: w }] });
    stand[z.id] = '';
    const neu = await zielePruefen();
    hinweis = neu.length ? `Ziel erreicht: ${neu.join(', ')}! +${zielXp} XP` : '';
  }
  async function geschafft(z) {
    await zielAbhaken(z);
    hinweis = `Ziel erreicht: ${z.titel}! +${zielXp} XP`;
  }
  async function loeschen(z) {
    await loeschenMitUndo(`Ziel „${z.titel}“ gelöscht`, [{ tabelle: 'ziele', ids: [z.id] }]);
  }

  function frist(z) {
    if (!z.frist) return '';
    const tage = Math.round((parse(z.frist) - parse(h)) / 86400000);
    if (tage < 0) return `Frist war ${kurz(z.frist)}`;
    if (tage === 0) return 'Frist heute';
    return `bis ${kurz(z.frist)} · noch ${tage} ${tage === 1 ? 'Tag' : 'Tage'}`;
  }
  function quelleText(z) {
    if (z.art !== 'mess') return 'ohne Messwert';
    if (z.quelle === 'uebung') return istAusdauer(z.uebung) ? 'weiteste Strecke an einem Tag' : 'schwerster Satz im Training';
    if (z.quelle === 'reihe') return `Messwert${z.seite === 'L' ? ' links' : z.seite === 'R' ? ' rechts' : ''}`;
    return 'eigener Wert';
  }
</script>

<h1>Ziele</h1>

{#if hinweis}<p class="hinweis">{hinweis}</p>{/if}

{#if d}
  <button class="breit" on:click={() => { zeigeNeu = true; hinweis = ''; }}>Neues Ziel</button>

  <Sheet offen={zeigeNeu} titel="Neues Ziel" onclose={() => { zeigeNeu = false; f = leer(); }}>
      <label for="zt">Name des Ziels</label>
      <input id="zt" bind:value={f.titel} placeholder={beispiel} required aria-required="true" />

      <span class="feldname">Art</span>
      <div class="chips" role="group" aria-label="Art des Ziels">
        <button class="chip" class:an={f.art === 'mess'} aria-pressed={f.art === 'mess'} on:click={() => (f.art = 'mess')}>Mit Messwert</button>
        <button class="chip" class:an={f.art === 'frei'} aria-pressed={f.art === 'frei'} on:click={() => (f.art = 'frei')}>Ohne Messwert</button>
      </div>

      {#if f.art === 'mess'}
        <label for="zq">Woran misst du es?</label>
        <select id="zq" bind:value={f.quelle}>
          <option value="uebung">Übung aus dem Training (Gewicht, bei Ausdauer Strecke)</option>
          <option value="reihe">Messwert, z. B. Umfang</option>
          <option value="manuell">Eigener Wert, z. B. Minuten spazieren</option>
        </select>

        {#if f.quelle === 'uebung'}
          <label for="zu">Übung</label>
          <select id="zu" bind:value={f.uebungId}>
            <option value="">– bitte wählen –</option>
            {#each d.uebungen as u (u.id)}<option value={String(u.id)}>{u.name}</option>{/each}
          </select>
          {#if !d.uebungen.length}<p class="muted">Noch keine Übungen gespeichert. Leg sie im Plan an.</p>{/if}
        {:else if f.quelle === 'reihe'}
          <label for="zr">Messwert</label>
          <select id="zr" bind:value={f.reiheId}>
            <option value="">– bitte wählen –</option>
            {#each d.reihen as r (r.id)}<option value={String(r.id)}>{r.name}{r.einheit ? ` (${r.einheit})` : ''}</option>{/each}
          </select>
          {#if reiheSeitig}
            <span class="feldname">Seite</span>
            <div class="row" style="flex-wrap: nowrap">
              <button style="flex: 1" class:sek={f.seite !== 'L'} aria-pressed={f.seite === 'L'} on:click={() => (f.seite = 'L')}>Links</button>
              <button style="flex: 1" class:sek={f.seite !== 'R'} aria-pressed={f.seite === 'R'} on:click={() => (f.seite = 'R')}>Rechts</button>
            </div>
          {/if}
        {:else}
          <label for="ze">Einheit (z. B. Minuten, Schritte, m)</label>
          <input id="ze" bind:value={f.einheit} />
        {/if}

        {#if jetzt !== null}
          <p class="muted" style="margin: 8px 0 0">Aktuell: <strong>{zahlText(jetzt)} {einheit}</strong></p>
        {/if}

        <div class="row" style="flex-wrap: nowrap">
          <div style="flex: 1; min-width: 0">
            <label for="zs">Ausgangswert</label>
            <input id="zs" inputmode="decimal" bind:value={f.start} placeholder="leer = 0" />
          </div>
          <div style="flex: 1; min-width: 0">
            <label for="zz">Zielwert{einheit ? ` (${einheit})` : ''}</label>
            <input id="zz" inputmode="decimal" bind:value={f.ziel} />
          </div>
        </div>
        {#if jetzt !== null}<button class="link" style="margin-top: 6px" on:click={startVorschlagen}>Aktuellen Wert als Ausgangswert</button>{/if}
        <p class="muted" style="margin: 6px 0 0">Der Fortschritt läuft vom Ausgangswert zum Zielwert. Ist das Ziel kleiner (z. B. weniger Schmerz), zählt das Sinken.</p>
      {/if}

      <label for="zf">Bis wann? (optional)</label>
      <input id="zf" type="date" bind:value={f.frist} />
      <label for="zn">Notiz (optional)</label>
      <input id="zn" bind:value={f.notiz} />

      {#if fehler}<p class="muted" style="margin-bottom: 0">{fehler}</p>{/if}
      <div class="sheet-aktionen"><button on:click={anlegen} disabled={!!fehler}>Ziel anlegen</button></div>
  </Sheet>

  <h2>Offen{offen.length ? ` (${offen.length})` : ''}</h2>
  {#if !offen.length}
    <div class="card"><p class="muted" style="margin: 0">Keine offenen Ziele. Leg dir eins an, groß oder klein.</p></div>
  {/if}
  {#if offen.length}<div class="card">
  {#each offen as z (z.id)}
    <SwipeRow aktionen={[{ label: 'Löschen', art: 'loeschen', aktion: () => loeschen(z) }]}>
    <div class="ziel-block">
      <span class="zeile-text"><strong>{z.titel}</strong><br /><span class="muted">{quelleText(z)}{z.frist ? ' · ' + frist(z) : ''}</span></span>
      {#if z.art === 'mess'}
        <div class="ziel-stand">
          <span><strong>{zahlText(z.aktuell)}</strong> / {zahlText(z.ziel)} {z.einheit || ''}</span>
          <span class="muted">{Math.round(z.anteil * 100)} %</span>
        </div>
        <div class="bar" role="img" aria-label="{Math.round(z.anteil * 100)} Prozent erreicht"><div style="width: {Math.round(z.anteil * 100)}%"></div></div>
        {#if z.start !== null && z.start !== undefined}<p class="muted" style="margin: 6px 0 0">Ausgangswert {zahlText(z.start)} {z.einheit || ''}</p>{/if}
        {#if z.quelle === 'manuell'}
          <div class="row" style="flex-wrap: nowrap; margin-top: 10px">
            <input aria-label="Neuer Stand für {z.titel}" inputmode="decimal" placeholder="Neuer Stand{z.einheit ? ` (${z.einheit})` : ''}" bind:value={stand[z.id]} />
            <button class="sek" on:click={() => standEintragen(z)}>Eintragen</button>
          </div>
        {/if}
      {:else}
        <button style="margin-top: 10px" on:click={() => geschafft(z)}>Geschafft!</button>
      {/if}
      {#if z.notiz}<p class="muted" style="margin: 8px 0 0">{z.notiz}</p>{/if}
    </div>
    </SwipeRow>
  {/each}
  </div>{/if}

  {#if erreicht.length}
    <h2>Erreicht ({erreicht.length})</h2>
    <div class="card">
      {#each erreicht as z (z.id)}
        <SwipeRow
          aktionen={[
            { label: 'Löschen', art: 'loeschen', aktion: () => loeschen(z) },
            ...(z.art === 'frei' ? [{ label: 'Doch nicht', art: 'neutral', aktion: () => zielZuruecknehmen(z) }] : [])
          ]}
        >
          <div class="zeile">
            <span class="ziel-stern" aria-hidden="true">★</span>
            <span class="zeile-text">{z.titel}<br /><span class="muted">am {kurz(z.erreicht)}{z.art === 'mess' ? ` · ${zahlText(z.ziel)} ${z.einheit || ''}` : ''}</span></span>
          </div>
        </SwipeRow>
      {/each}
    </div>
  {/if}

  <p class="muted">Erreichte Ziele geben {zielXp} XP. Ziele mit Messwert werden automatisch abgehakt, sobald dein Training oder eine Messung sie erreicht.</p>
{/if}
