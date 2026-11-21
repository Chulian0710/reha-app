<script>
  import { liveQuery } from 'dexie';
  import { db, heute } from '../lib/db.js';
  import { tagKurz } from '../lib/datum.js';
  import SwipeRow from '../lib/SwipeRow.svelte';
  import { loeschenMitUndo } from '../lib/toast.js';
  import { regeln, xpVergeben } from '../lib/xp.js';
  import { schmerzFarbe, SCHMERZ_STUFEN } from '../lib/schmerz.js';
  import SchmerzSkala from '../lib/SchmerzSkala.svelte';

  // Tagebuch gibt standardmäßig keine XP (im Betreuer-Bereich einstellbar), höchstens einmal pro Tag.
  const eintraege = liveQuery(() => db.tagebuch.toArray());
  let text = '';
  let schmerz = null; // 0–10 oder null (nicht angegeben)

  $: sortiert = ($eintraege || []).slice().sort((a, b) => b.datum.localeCompare(a.datum) || b.id - a.id);

  // --- Suche und Schmerz-Filter ---
  let suche = '';
  let schmerzFilter = 'alle';
  const BEREICHE = [
    ['alle', 'Alle Einträge', () => true],
    ['mit', 'Mit Schmerzwert', (v) => v !== null],
    ['ohne', 'Ohne Schmerzwert', (v) => v === null],
    ['leicht', 'Leicht (0–3)', (v) => v !== null && v <= 3],
    ['mittel', 'Mittel (4–6)', (v) => v !== null && v >= 4 && v <= 6],
    ['stark', 'Stark (7–10)', (v) => v !== null && v >= 7]
  ];
  const passtSchmerz = (e, f) => {
    const v = typeof e.schmerz === 'number' ? e.schmerz : null;
    if (f.startsWith('wert:')) return v === Number(f.slice(5));
    return BEREICHE.find((b) => b[0] === f)[2](v);
  };
  $: begriff = suche.trim().toLowerCase();
  // Die Suche findet Text und Datum (z. B. „26.11.“ oder „Mo“)
  $: gefiltert = sortiert.filter(
    (e) => passtSchmerz(e, schmerzFilter) && (!begriff || (e.text || '').toLowerCase().includes(begriff) || tagKurz(e.datum).toLowerCase().includes(begriff))
  );
  $: filterAktiv = !!begriff || schmerzFilter !== 'alle';
  function zuruecksetzen() {
    suche = '';
    schmerzFilter = 'alle';
  }

  // Text in Stücke teilen, damit Treffer markiert werden können (ohne HTML einzuschleusen)
  function teile(text, q) {
    if (!q) return [{ t: text, treffer: false }];
    const klein = text.toLowerCase();
    const stuecke = [];
    let i = 0;
    for (let j = klein.indexOf(q); j !== -1; j = klein.indexOf(q, i)) {
      if (j > i) stuecke.push({ t: text.slice(i, j), treffer: false });
      stuecke.push({ t: text.slice(j, j + q.length), treffer: true });
      i = j + q.length;
    }
    if (i < text.length) stuecke.push({ t: text.slice(i), treffer: false });
    return stuecke;
  }

  async function speichern() {
    if (!text.trim() && schmerz === null) return;
    const datum = heute();
    await db.tagebuch.add({ datum, text: text.trim(), schmerz, zeit: Date.now() });
    text = '';
    schmerz = null;
    const r = await regeln();
    if (r.tagebuchXp > 0) await xpVergeben('Tagebuch', r.tagebuchXp, `tagebuch:${datum}`, datum);
  }

  async function loeschen(e) {
    await loeschenMitUndo('Tagebucheintrag gelöscht', [{ tabelle: 'tagebuch', ids: [e.id] }]);
  }
</script>

<h1>Tagebuch</h1>

<div class="card">
  <label for="t">Wie war der Tag? Schreib es so, wie es ist.</label>
  <textarea id="t" bind:value={text}></textarea>
  <SchmerzSkala bind:wert={schmerz} />
  <div style="margin-top: 10px"><button on:click={speichern} disabled={!text.trim() && schmerz === null}>Speichern</button></div>
</div>

{#if sortiert.length}
  <div class="tagebuch-filter">
    <div>
      <label for="tb-suche">Suchen</label>
      <input id="tb-suche" type="search" placeholder="Text oder Datum, z. B. Knie" autocomplete="off" bind:value={suche} />
    </div>
    <div>
      <label for="tb-schmerz">Schmerz</label>
      <select id="tb-schmerz" bind:value={schmerzFilter}>
        <optgroup label="Bereich">
          {#each BEREICHE as [id, name]}<option value={id}>{name}</option>{/each}
        </optgroup>
        <optgroup label="Genauer Wert">
          {#each SCHMERZ_STUFEN as v}<option value="wert:{v}">Schmerz {v}</option>{/each}
        </optgroup>
      </select>
    </div>
  </div>
  <div class="row" style="justify-content: space-between; margin: 0 0 8px; min-height: 32px" aria-live="polite">
    <span class="muted">{filterAktiv ? `${gefiltert.length} von ${sortiert.length} Einträgen` : `${sortiert.length} ${sortiert.length === 1 ? 'Eintrag' : 'Einträge'}`}</span>
    {#if filterAktiv}<button class="link" style="min-height: 0" on:click={zuruecksetzen}>Filter zurücksetzen</button>{/if}
  </div>
{/if}

<div class="card">
  {#if sortiert.length === 0}
    <p class="muted" style="margin: 0">Noch keine Einträge.</p>
  {:else if gefiltert.length === 0}
    <p class="muted" style="margin: 0">Kein Eintrag passt zu Suche und Filter.</p>
  {/if}
  {#each gefiltert as e (e.id)}
    <SwipeRow aktionen={[{ label: 'Löschen', art: 'loeschen', aktion: () => loeschen(e) }]}>
      <div class="zeile" style="align-items: flex-start; padding: 10px 0">
        <span class="zeile-text">
          <span class="muted">{#each teile(tagKurz(e.datum), begriff) as st}{#if st.treffer}<mark>{st.t}</mark>{:else}{st.t}{/if}{/each}</span>
          {#if typeof e.schmerz === 'number'}<span class="schmerz-badge" style="background: {schmerzFarbe(e.schmerz)}">Schmerz {e.schmerz}</span>{/if}
          {#if e.text}<br /><span style="white-space: pre-line">{#each teile(e.text, begriff) as st}{#if st.treffer}<mark>{st.t}</mark>{:else}{st.t}{/if}{/each}</span>{/if}
        </span>
      </div>
    </SwipeRow>
  {/each}
</div>
