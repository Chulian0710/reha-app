<script>
  import { liveQuery } from 'dexie';
  import { db, heute } from '../lib/db.js';
  import { kurz } from '../lib/datum.js';
  import { punktestand } from '../lib/xp.js';
  import { zeigeToast } from '../lib/toast.js';
  import Sheet from '../lib/Sheet.svelte';
  import Gel from '../lib/Gel.svelte';

  const daten = liveQuery(async () => {
    const einloesungen = (await db.einloesungen.toArray()).map((e) => ({ ...e, art: 'einl' }));
    const gutschriften = (await db.gelLog.toArray()).filter((g) => g.gels > 0);
    return {
      stand: await punktestand(),
      belohnungen: (await db.belohnungen.toArray()).sort((a, b) => a.kosten - b.kosten || a.name.localeCompare(b.name, 'de')),
      wuensche: (await db.wuensche.toArray()).sort((a, b) => b.id - a.id),
      verlauf: [...einloesungen, ...gutschriften].sort((a, b) => b.datum.localeCompare(a.datum) || b.id - a.id)
    };
  });
  $: d = $daten;
  $: gels = d ? d.stand.gels : 0;

  const gelText = (n) => `${n} ${n === 1 ? 'Gel' : 'Gels'}`;

  async function einloesen(b) {
    if (!confirm(`„${b.name}“ für ${gelText(b.kosten)} einlösen?`)) return;
    await db.einloesungen.add({ belohnungUid: b.uid, name: b.name, kosten: b.kosten, datum: heute() });
    zeigeToast(`„${b.name}“ eingelöst. Sag deinem Betreuer Bescheid!`);
  }

  // --- Wünsche ---
  let wunschOffen = false;
  let w = { name: '', notiz: '' };
  async function wunschSenden() {
    if (!w.name.trim()) return;
    await db.wuensche.add({ name: w.name.trim(), notiz: w.notiz.trim(), datum: heute(), status: 'offen' });
    wunschOffen = false;
    w = { name: '', notiz: '' };
    zeigeToast('Wunsch gespeichert. Dein Betreuer legt den Preis fest.');
  }
  async function wunschWeg(x) {
    const frage = x.status === 'offen' ? `Wunsch „${x.name}“ zurückziehen?` : `„${x.name}“ aus der Liste entfernen?`;
    if (confirm(frage)) await db.wuensche.delete(x.id);
  }
</script>

<h1>Shop</h1>

{#if d}
  <div class="card gel-stand">
    <div class="gel-stand-zahl">
      <Gel groesse={34} />
      <span><strong>{gels}</strong> {gels === 1 ? 'Gel' : 'Gels'}</span>
    </div>
    <p class="muted" style="margin: 6px 0 0">
      Gels bekommst du für jeden Level-Aufstieg, für Abzeichen und als Geschenk.
      Einlösen kostet nur Gels, deine XP und dein Level bleiben.
    </p>
  </div>

  <h2>Belohnungen</h2>
  <div class="card">
    {#if d.belohnungen.length === 0}
      <p class="muted" style="margin: 0">Noch keine Belohnungen im Shop. Wünsch dir unten etwas!</p>
    {/if}
    {#each d.belohnungen as b (b.id)}
      <div class="shop-zeile">
        <div class="zeile" style="border: none">
          <span class="zeile-text">
            {b.name}{#if b.gewuenscht}<span class="marke">Dein Wunsch</span>{/if}<br />
            <span class="muted gel-preis"><Gel groesse={14} /> {gelText(b.kosten)}{gels < b.kosten ? ` · noch ${b.kosten - gels}` : ''}</span>
          </span>
          <button class="sek klein" disabled={gels < b.kosten} on:click={() => einloesen(b)}>Einlösen</button>
        </div>
        {#if gels < b.kosten}
          <div class="bar klein-bar gel-bar" role="img" aria-label="{Math.round((Math.max(gels, 0) / b.kosten) * 100)} Prozent gesammelt">
            <div style="width: {Math.round((Math.max(gels, 0) / b.kosten) * 100)}%"></div>
          </div>
        {/if}
      </div>
    {/each}
  </div>

  <div class="row" style="justify-content: space-between; align-items: baseline">
    <h2>Deine Wünsche</h2>
    <button class="link" on:click={() => (wunschOffen = true)}>+ Wunsch</button>
  </div>
  <div class="card">
    {#if d.wuensche.length === 0}
      <p class="muted" style="margin-top: 0">Gibt es etwas, worauf du hinarbeiten möchtest? Wünsch es dir. Dein Betreuer legt den Preis fest und stellt es in den Shop.</p>
    {/if}
    {#each d.wuensche as x (x.id)}
      <div class="zeile">
        <span class="zeile-text">
          {x.name}<br />
          {#if x.status === 'offen'}
            <span class="muted">Wartet auf Freigabe · {kurz(x.datum)}</span>
          {:else}
            <span class="muted">Nicht freigegeben{x.antwort ? `: ${x.antwort}` : ''}</span>
          {/if}
        </span>
        <button class="sek klein" aria-label={x.status === 'offen' ? 'Wunsch zurückziehen' : 'Entfernen'} on:click={() => wunschWeg(x)}>✕</button>
      </div>
    {/each}
    <button class="sek breit" style="margin-top: 10px" on:click={() => (wunschOffen = true)}>Belohnung wünschen</button>
  </div>

  {#if d.verlauf.length}
    <h2>Verlauf</h2>
    <div class="card">
      {#each d.verlauf as v (v.art + v.id)}
        <div class="zeile">
          {#if v.art === 'einl'}
            <span class="zeile-text">{v.name}<br /><span class="muted">{v.erhalten ? `erhalten am ${kurz(v.erhalten)}` : 'eingelöst, noch nicht erhalten'}</span></span>
            <span class="muted">{kurz(v.datum)} · −{v.kosten}</span>
          {:else if v.art === 'geschenk'}
            <span class="zeile-text">Geschenk vom Betreuer{#if v.grund}<br /><span class="muted">{v.grund}</span>{/if}</span>
            <span class="muted">{kurz(v.datum)} · +{v.gels}</span>
          {:else}
            <span class="zeile-text">{v.grund}</span>
            <span class="muted">{kurz(v.datum)} · +{v.gels}</span>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <Sheet offen={wunschOffen} titel="Belohnung wünschen" onclose={() => (wunschOffen = false)}>
    <label for="wname">Was wünschst du dir?</label>
    <input id="wname" bind:value={w.name} placeholder="z. B. Kinoabend, neues Buch" />
    <label for="wnotiz">Notiz (optional)</label>
    <textarea id="wnotiz" bind:value={w.notiz} style="min-height: 80px" placeholder="z. B. welcher Film, welches Buch"></textarea>
    <p class="muted">Dein Betreuer sieht den Wunsch im Betreuer-Bereich, legt fest, wie viele Gels er kostet, und stellt ihn in den Shop.</p>
    <div class="sheet-aktionen">
      <button on:click={wunschSenden} disabled={!w.name.trim()}>Wunsch speichern</button>
    </div>
  </Sheet>
{/if}
