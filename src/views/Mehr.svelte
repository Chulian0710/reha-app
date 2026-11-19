<script>
  import { liveQuery } from 'dexie';
  import { db } from '../lib/db.js';
  import { punktestand } from '../lib/xp.js';
  import { gehe } from '../lib/nav.js';

  const info = liveQuery(async () => ({
    gels: (await punktestand()).gels,
    wuensche: await db.wuensche.where('status').equals('offen').count()
  }));

  $: gels = $info?.gels ?? 0;
  $: offen = $info?.wuensche ?? 0;
  $: eintraege = [
    ['tagebuch', 'Tagebuch', 'Alle Einträge'],
    ['shop', 'Shop', `${gels} ${gels === 1 ? 'Gel' : 'Gels'} · Belohnungen einlösen und wünschen`],
    ['daten', 'Daten', 'Backup, Bericht, Pack importieren'],
    ['betreuer', 'Betreuer-Bereich', offen ? `Mit Passwort geschützt · ${offen} ${offen === 1 ? 'Wunsch wartet' : 'Wünsche warten'}` : 'Mit Passwort geschützt']
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
