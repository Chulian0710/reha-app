<script>
  import { liveQuery } from 'dexie';
  import { db } from '../lib/db.js';
  import { punktestand } from '../lib/xp.js';
  import { briefStand } from '../lib/briefe.js';
  import { gehe } from '../lib/nav.js';

  const info = liveQuery(async () => {
    const b = await briefStand();
    return {
      gels: (await punktestand()).gels,
      wuensche: await db.wuensche.where('status').equals('offen').count(),
      briefeNeu: b.ungeoeffnet.length,
      briefeOffen: b.geoeffnet.length
    };
  });

  $: i = $info || { gels: 0, wuensche: 0, briefeNeu: 0, briefeOffen: 0 };
  const mehrzahl = (n, eins, viele) => `${n} ${n === 1 ? eins : viele}`;

  // Icons: weiße Linien auf farbigem Feld, 24er Raster
  const ICONS = {
    // Notizbuch mit Lesezeichen
    tagebuch: 'M7 3.5h10.5a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H7a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2zM5 17a2 2 0 0 1 2-2h11.5M9 3.5v6l2-1.4 2 1.4v-6',
    // Umschlag
    briefe: 'M4.5 6h15a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM4 7l8 6 8-6',
    // Einkaufstasche
    shop: 'M5.5 8h13l-.9 11.1a1 1 0 0 1-1 .9H7.4a1 1 0 0 1-1-.9zM9 10V7a3 3 0 0 1 6 0v3',
    // Datenbank
    daten: 'M12 3.5c4.1 0 7.5 1.3 7.5 3s-3.4 3-7.5 3-7.5-1.3-7.5-3 3.4-3 7.5-3zM4.5 6.5v11c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-11M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3',
    // Schild mit Schloss
    betreuer: 'M12 3l7 2.8v5.4c0 4.4-2.9 8.2-7 9.8-4.1-1.6-7-5.4-7-9.8V5.8zM9.5 11.5h5v4h-5zM10.3 11.5v-1.3a1.7 1.7 0 0 1 3.4 0v1.3'
  };

  $: eintraege = [
    { seite: 'tagebuch', titel: 'Tagebuch', text: 'Alle Einträge', farbe: '#2f6f6a' },
    {
      seite: 'briefe',
      titel: 'Briefe',
      text: i.briefeNeu ? `${mehrzahl(i.briefeNeu, 'neuer Brief', 'neue Briefe')} · ${mehrzahl(i.briefeOffen, 'geöffnet', 'geöffnet')}` : i.briefeOffen ? mehrzahl(i.briefeOffen, 'Brief geöffnet', 'Briefe geöffnet') : 'Briefe von deinem Betreuer',
      farbe: '#e2231a',
      zahl: i.briefeNeu
    },
    { seite: 'shop', titel: 'Shop', text: `${mehrzahl(i.gels, 'Gel', 'Gels')} · Belohnungen einlösen und wünschen`, farbe: '#e0a43a' },
    { seite: 'daten', titel: 'Daten', text: 'Backup, Bericht, Pack importieren', farbe: '#4a6fa5' },
    {
      seite: 'betreuer',
      titel: 'Betreuer-Bereich',
      text: i.wuensche ? `Mit Passwort geschützt · ${i.wuensche} ${i.wuensche === 1 ? 'Wunsch wartet' : 'Wünsche warten'}` : 'Mit Passwort geschützt',
      farbe: '#1f2a29',
      zahl: i.wuensche
    }
  ];
</script>

<h1>Mehr</h1>
<div class="card">
  {#each eintraege as e (e.seite)}
    <button class="menue mehr-zeile" on:click={() => gehe(e.seite)}>
      <span class="mehr-icon" style="background: {e.farbe}" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24"><path d={ICONS[e.seite]} fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </span>
      <span class="mehr-text"><strong>{e.titel}</strong><br /><span class="muted">{e.text}</span></span>
      {#if e.zahl}<span class="mehr-zahl" aria-label="{e.zahl} neu">{e.zahl}</span>{/if}
      <span aria-hidden="true" class="muted">›</span>
    </button>
  {/each}
</div>
