<script>
  import { gehe } from '../lib/nav.js';

  const eintraege = [
    ['tagebuch', 'Tagebuch', 'Alle Einträge'],
    ['belohnungen', 'Belohnungen', 'XP einlösen, Abzeichen, Briefe'],
    ['daten', 'Daten', 'Backup, Bericht, Pack importieren'],
    ['betreuer', 'Betreuer-Bereich', 'Mit Passwort geschützt']
  ];
</script>

<h1>Mehr</h1>
<div class="card">
  {#each eintraege as [seite, titel, text]}
    <button class="menue" on:click={() => gehe(seite)}>
      <span><strong>{titel}</strong><br /><span class="muted">{text}</span></span>
      <span aria-hidden="true" class="muted">›</span>
    </button>
  {/each}
</div>
