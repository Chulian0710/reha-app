<script>
  // Schmerzskala 0–10 zum Antippen. Nochmal tippen hebt die Auswahl auf (wert = null).
  import { SCHMERZ_STUFEN, schmerzFarbe } from './schmerz.js';

  export let wert = null;
  export let label = 'Schmerz heute (optional)';
  export let id = 'schmerz';
</script>

<span class="feldname" id="{id}-label">{label}</span>
<div class="schmerz-skala" role="group" aria-labelledby="{id}-label">
  {#each SCHMERZ_STUFEN as v}
    <button
      class="chip schmerz-chip"
      class:an={wert === v}
      style={wert === v ? `background: ${schmerzFarbe(v)}; border-color: ${schmerzFarbe(v)}` : ''}
      aria-pressed={wert === v}
      aria-label="Schmerz {v} von 10"
      on:click={() => (wert = wert === v ? null : v)}>{v}</button>
  {/each}
</div>
<div class="schmerz-enden muted" aria-hidden="true"><span>kein Schmerz</span><span>stärkster</span></div>
