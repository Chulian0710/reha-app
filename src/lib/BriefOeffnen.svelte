<script>
  // Verschlossener Umschlag → antippen → klappt auf → Brief lesen. Beim Öffnen gilt der Brief als gelesen.
  import { alsGelesen } from './briefe.js';

  export let brief;
  let offen = false;
  let lesen = false;

  async function oeffnen() {
    if (offen) return;
    offen = true;
    await alsGelesen(brief.uid);
    setTimeout(() => (lesen = true), 900);
  }
</script>

{#if !lesen}
  <div class="brief-oeffnen">
    <p class="muted" style="margin: 0">Freigeschaltet mit Level {brief.level}</p>
    <button class="umschlag" class:offen aria-label="Brief öffnen" on:click={oeffnen} disabled={offen}>
      <span class="umschlag-papier" aria-hidden="true"></span>
      <span class="umschlag-tasche" aria-hidden="true"></span>
      <span class="umschlag-klappe" aria-hidden="true"></span>
      <span class="umschlag-siegel" aria-hidden="true">♥</span>
    </button>
    <button class="breit" on:click={oeffnen} disabled={offen}>Öffnen</button>
  </div>
{:else}
  <div class="feier-brief" style="margin-top: 10px">
    <h2 class="feier-titel">{brief.titel || 'Für dich'}</h2>
    <p>{brief.text}</p>
  </div>
  <p class="muted" style="text-align: center; margin: 10px 0 0">Ab jetzt findest du den Brief unter Mehr → Briefe.</p>
{/if}
