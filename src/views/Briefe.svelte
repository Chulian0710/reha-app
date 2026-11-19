<script>
  import { liveQuery } from 'dexie';
  import { briefStand } from '../lib/briefe.js';
  import Sheet from '../lib/Sheet.svelte';
  import BriefOeffnen from '../lib/BriefOeffnen.svelte';

  const daten = liveQuery(briefStand);
  $: d = $daten;

  let offenerBrief = null; // bleibt im Sheet, auch wenn er nach dem Öffnen in die andere Liste wandert
</script>

<h1>Briefe</h1>

{#if d}
  {#if d.ungeoeffnet.length}
    <h2>Noch nicht geöffnet</h2>
    <div class="card">
      {#each d.ungeoeffnet as b (b.id)}
        <div class="zeile">
          <span class="brief-symbol" aria-hidden="true">✉</span>
          <span class="zeile-text">Ein Brief für dich<br /><span class="muted">freigeschaltet mit Level {b.level}</span></span>
          <button class="klein" on:click={() => (offenerBrief = b)}>Öffnen</button>
        </div>
      {/each}
    </div>
  {/if}

  <h2>Geöffnet</h2>
  <div class="card">
    {#if !d.geoeffnet.length}
      <p class="muted" style="margin: 0">Noch keine Briefe geöffnet. Neue Briefe erscheinen auf „Heute“, sobald du das nötige Level erreichst.</p>
    {/if}
    {#each d.geoeffnet as b (b.id)}
      <details class="brief">
        <summary><strong>{b.titel || 'Brief'}</strong> <span class="muted">· Level {b.level}</span></summary>
        <p style="white-space: pre-line">{b.text}</p>
      </details>
    {/each}
  </div>

  {#if d.verschlossen}
    <p class="muted" style="text-align: center">
      ✉ {d.verschlossen === 1 ? 'Ein weiterer Brief wartet' : `${d.verschlossen} weitere Briefe warten`}, der nächste öffnet sich bei Level {d.naechstesLevel}.
    </p>
  {/if}
{/if}

<Sheet offen={offenerBrief !== null} titel="Brief" onclose={() => (offenerBrief = null)}>
  {#if offenerBrief}{#key offenerBrief.id}<BriefOeffnen brief={offenerBrief} />{/key}{/if}
</Sheet>
