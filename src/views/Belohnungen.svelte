<script>
  import { liveQuery } from 'dexie';
  import { db, heute } from '../lib/db.js';
  import { kurz } from '../lib/datum.js';
  import { levelInfo, schwellen, punktestand } from '../lib/xp.js';
  import { statistik, erreicht, bedingungText } from '../lib/abzeichen.js';

  const daten = liveQuery(async () => {
    const stand = await punktestand();
    const liste = await schwellen();
    return {
      stand,
      level: levelInfo(stand.verdient, liste).level,
      belohnungen: (await db.belohnungen.toArray()).sort((a, b) => a.kosten - b.kosten),
      einloesungen: (await db.einloesungen.toArray()).sort((a, b) => b.id - a.id),
      abzeichen: await db.abzeichen.toArray(),
      briefe: (await db.briefe.toArray()).sort((a, b) => a.level - b.level),
      stat: await statistik()
    };
  });

  $: d = $daten;

  async function einloesen(b) {
    if (!confirm(`„${b.name}“ für ${b.kosten} XP einlösen?`)) return;
    await db.einloesungen.add({ belohnungUid: b.uid, name: b.name, kosten: b.kosten, datum: heute() });
  }
</script>

<h1>Belohnungen</h1>

{#if d}
  <div class="card">
    <div class="row" style="justify-content: space-between">
      <strong style="font-size: 1.2rem">{d.stand.verfuegbar} XP</strong>
      <span class="muted">Level {d.level}</span>
    </div>
    <p class="muted" style="margin-bottom: 0">Einlösen senkt nur die verfügbaren XP. Dein Level bleibt.</p>
  </div>

  <h2>Einlösen</h2>
  <div class="card">
    {#if d.belohnungen.length === 0}
      <p class="muted" style="margin: 0">Noch keine Belohnungen angelegt.</p>
    {/if}
    {#each d.belohnungen as b (b.id)}
      <div class="zeile">
        <span class="zeile-text">{b.name}<br /><span class="muted">{b.kosten} XP{d.stand.verfuegbar < b.kosten ? ` · noch ${b.kosten - d.stand.verfuegbar} XP` : ''}</span></span>
        <button class="sek klein" disabled={d.stand.verfuegbar < b.kosten} on:click={() => einloesen(b)}>Einlösen</button>
      </div>
    {/each}
  </div>

  {#if d.einloesungen.length}
    <h2>Eingelöst</h2>
    <div class="card">
      {#each d.einloesungen as e (e.id)}
        <div class="zeile"><span class="zeile-text">{e.name}</span><span class="muted">{kurz(e.datum)} · {e.kosten} XP</span></div>
      {/each}
    </div>
  {/if}

  <h2>Abzeichen</h2>
  <div class="card">
    <div class="abzeichen">
      {#each d.abzeichen as a (a.id)}
        <div class="abz" class:offen={erreicht(a, d.stat)}>
          <span class="abz-kreis" aria-hidden="true">{erreicht(a, d.stat) ? '★' : '○'}</span>
          <span>{a.name}</span>
          <span class="muted" style="font-size: 0.75rem">{erreicht(a, d.stat) ? 'erreicht' : bedingungText(a)}</span>
        </div>
      {/each}
    </div>
  </div>

  {#if d.briefe.length}
    <h2>Briefe</h2>
    <div class="card">
      {#each d.briefe as b (b.id)}
        {#if d.level >= b.level}
          <details class="brief">
            <summary><strong>{b.titel || 'Brief'}</strong> <span class="muted">· Level {b.level}</span></summary>
            <p style="white-space: pre-line">{b.text}</p>
          </details>
        {:else}
          <div class="zeile"><span class="zeile-text">Verschlossener Brief</span><span class="muted">öffnet bei Level {b.level}</span></div>
        {/if}
      {/each}
    </div>
  {/if}
{/if}
