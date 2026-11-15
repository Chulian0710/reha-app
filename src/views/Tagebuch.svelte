<script>
  import { liveQuery } from 'dexie';
  import { db, heute } from '../lib/db.js';
  import { kurz } from '../lib/datum.js';
  import SwipeRow from '../lib/SwipeRow.svelte';
  import { loeschenMitUndo } from '../lib/toast.js';

  // Tagebuch gibt bewusst keine XP: Schreiben soll kein Pflichtpunkt sein.
  const eintraege = liveQuery(() => db.tagebuch.toArray());
  let text = '';

  $: sortiert = ($eintraege || []).slice().sort((a, b) => b.datum.localeCompare(a.datum) || b.id - a.id);

  async function speichern() {
    if (!text.trim()) return;
    await db.tagebuch.add({ datum: heute(), text: text.trim(), zeit: Date.now() });
    text = '';
  }

  async function loeschen(e) {
    await loeschenMitUndo('Tagebucheintrag gelöscht', [{ tabelle: 'tagebuch', ids: [e.id] }]);
  }
</script>

<h1>Tagebuch</h1>

<div class="card">
  <label for="t">Wie war der Tag? Schreib es so, wie es ist.</label>
  <textarea id="t" bind:value={text}></textarea>
  <div style="margin-top: 10px"><button on:click={speichern}>Speichern</button></div>
</div>

<div class="card">
  {#if sortiert.length === 0}
    <p class="muted" style="margin: 0">Noch keine Einträge.</p>
  {/if}
  {#each sortiert as e (e.id)}
    <SwipeRow aktionen={[{ label: 'Löschen', art: 'loeschen', aktion: () => loeschen(e) }]}>
      <div class="zeile" style="align-items: flex-start; padding: 10px 0">
        <span class="zeile-text"><span class="muted">{kurz(e.datum)}</span><br /><span style="white-space: pre-line">{e.text}</span></span>
      </div>
    </SwipeRow>
  {/each}
</div>
