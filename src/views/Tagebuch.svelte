<script>
  import { liveQuery } from 'dexie';
  import { db, heute } from '../lib/db.js';
  import { kurz } from '../lib/datum.js';
  import SwipeRow from '../lib/SwipeRow.svelte';
  import { loeschenMitUndo } from '../lib/toast.js';
  import { regeln, xpVergeben } from '../lib/xp.js';
  import { SCHMERZ_STUFEN, schmerzFarbe } from '../lib/schmerz.js';

  // Tagebuch gibt standardmäßig keine XP (im Betreuer-Bereich einstellbar), höchstens einmal pro Tag.
  const eintraege = liveQuery(() => db.tagebuch.toArray());
  let text = '';
  let schmerz = null; // 0–10 oder null (nicht angegeben)

  $: sortiert = ($eintraege || []).slice().sort((a, b) => b.datum.localeCompare(a.datum) || b.id - a.id);

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
  <span class="feldname" id="schmerz-label">Schmerz heute (optional)</span>
  <div class="schmerz-skala" role="group" aria-labelledby="schmerz-label">
    {#each SCHMERZ_STUFEN as v}
      <button
        class="chip schmerz-chip"
        class:an={schmerz === v}
        style={schmerz === v ? `background: ${schmerzFarbe(v)}; border-color: ${schmerzFarbe(v)}` : ''}
        aria-pressed={schmerz === v}
        aria-label="Schmerz {v} von 10"
        on:click={() => (schmerz = schmerz === v ? null : v)}>{v}</button>
    {/each}
  </div>
  <div class="schmerz-enden muted" aria-hidden="true"><span>kein Schmerz</span><span>stärkster</span></div>
  <div style="margin-top: 10px"><button on:click={speichern} disabled={!text.trim() && schmerz === null}>Speichern</button></div>
</div>

<div class="card">
  {#if sortiert.length === 0}
    <p class="muted" style="margin: 0">Noch keine Einträge.</p>
  {/if}
  {#each sortiert as e (e.id)}
    <SwipeRow aktionen={[{ label: 'Löschen', art: 'loeschen', aktion: () => loeschen(e) }]}>
      <div class="zeile" style="align-items: flex-start; padding: 10px 0">
        <span class="zeile-text">
          <span class="muted">{kurz(e.datum)}</span>
          {#if typeof e.schmerz === 'number'}<span class="schmerz-badge" style="background: {schmerzFarbe(e.schmerz)}">Schmerz {e.schmerz}</span>{/if}
          {#if e.text}<br /><span style="white-space: pre-line">{e.text}</span>{/if}
        </span>
      </div>
    </SwipeRow>
  {/each}
</div>
