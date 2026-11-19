<script>
  import { liveQuery } from 'dexie';
  import { db } from '../lib/db.js';
  import { heute, anzeige, iso, parse } from '../lib/datum.js';
  import { levelInfo, levelGels, gelsFuerLevel, xpVergeben, xpEintragen, regeln, schwellen, punktestand, aktivitaeten as aktivitaetenLaden, ruhetagPunkte } from '../lib/xp.js';
  import { tagesplan, eintragText } from '../lib/plan.js';
  import { gehe } from '../lib/nav.js';
  import { abhaken, zuruecknehmen } from '../lib/training.js';
  import TrainingPanel from '../lib/TrainingPanel.svelte';
  import SwipeRow from '../lib/SwipeRow.svelte';
  import { loeschenMitUndo, zeigeToast, toast } from '../lib/toast.js';
  import Gel from '../lib/Gel.svelte';

  export let params = {};

  const h = heute();
  let datum = params.datum ?? h;
  let offenId = null;

  function verschoben(ds, schritt) {
    const d = parse(ds);
    d.setDate(d.getDate() + schritt);
    return iso(d);
  }
  function wechseln(ds) {
    datum = ds;
    offenId = null;
    tagebuchText = '';
    andere = '';
  }

  $: zukunft = datum > h;
  $: titel = datum === h ? 'Heute' : datum === verschoben(h, -1) ? 'Gestern' : datum === verschoben(h, 1) ? 'Morgen' : anzeige(datum).split(',')[0];

  function laden(ds) {
    return liveQuery(async () => {
      const stand = await punktestand();
      const liste = await schwellen();
      const r = await regeln();
      const tp = await tagesplan(ds);
      const log = await db.xpLog.where('datum').equals(ds).toArray();
      const tagebuch = (await db.tagebuch.where('datum').equals(ds).toArray()).sort((a, b) => a.zeit - b.zeit);
      let ruheXp = null;
      if (tp.plan && tp.ruhetag) ruheXp = await ruhetagPunkte(ds, r);
      const aktivitaeten = await aktivitaetenLaden();
      const lg = await levelGels();
      return { ds, stand, liste, r, tp, log, tagebuch, ruheXp, aktivitaeten, lg };
    });
  }
  $: daten = laden(datum);

  // beim Tageswechsel die alten Daten nicht für den neuen Tag zeigen
  $: d = $daten && $daten.ds === datum ? $daten : null;
  $: info = d ? levelInfo(d.stand.verdient, d.liste) : null;
  $: tagLog = d ? d.log.slice().sort((a, b) => b.zeit - a.zeit) : [];
  $: ruheEingetragen = d ? d.log.some((e) => e.ref === `ruhetag:${datum}`) : false;
  $: erledigtAnzahl = d ? d.tp.eintraege.filter((e) => e.erledigt).length : 0;

  let andere = '';

  async function umschalten(e) {
    if (e.erledigt) await zuruecknehmen(e, datum);
    else await abhaken(e, datum, d.r);
  }

  async function ruhetagEintragen() {
    await xpVergeben('Ruhetag', d.ruheXp, `ruhetag:${datum}`, datum);
  }

  async function aktivitaet(name, punkte) {
    if (!name.trim()) return;
    const grund = name.trim();
    const id = await xpEintragen(grund, punkte, datum);
    andere = '';
    zeigeToast(`„${grund}“ eingetragen · +${punkte} XP`, async () => {
      await db.xpLog.delete(id);
      toast.set(null);
    });
  }

  async function rueckgaengig(e) {
    await loeschenMitUndo(`„${e.grund}“ entfernt`, [{ tabelle: 'xpLog', ids: [e.id] }]);
  }

  // Laptop: Pfeiltasten wechseln den Tag
  function taste(ev) {
    if (ev.defaultPrevented || ev.altKey || ev.metaKey || ev.ctrlKey) return;
    if (ev.target.closest?.('input, textarea, select, .sheet, .lc')) return;
    if (ev.key === 'ArrowLeft') wechseln(verschoben(datum, -1));
    else if (ev.key === 'ArrowRight') wechseln(verschoben(datum, 1));
    else if (ev.key === 't' || ev.key === 'T') wechseln(h);
    else return;
    ev.preventDefault();
  }

  // Tagebuch: XP nur, wenn im Betreuer-Bereich eingestellt (Standard 0), höchstens einmal pro Tag.
  let tagebuchText = '';
  async function tagebuchSpeichern() {
    if (!tagebuchText.trim()) return;
    await db.tagebuch.add({ datum, text: tagebuchText.trim(), zeit: Date.now() });
    tagebuchText = '';
    if (d.r.tagebuchXp > 0) await xpVergeben('Tagebuch', d.r.tagebuchXp, `tagebuch:${datum}`, datum);
  }
  async function tagebuchLoeschen(e) {
    await loeschenMitUndo('Tagebucheintrag gelöscht', [{ tabelle: 'tagebuch', ids: [e.id] }]);
  }
</script>

<svelte:window on:keydown={taste} />

<div class="tagwahl">
  <button class="sek rund" aria-label="Vorheriger Tag" on:click={() => wechseln(verschoben(datum, -1))}>‹</button>
  <div class="tagwahl-mitte">
    <h1>{titel}</h1>
    <span class="muted">{anzeige(datum)}</span>
  </div>
  <button class="sek rund" aria-label="Nächster Tag" on:click={() => wechseln(verschoben(datum, 1))}>›</button>
</div>
{#if datum !== h}
  <button class="link zurueck-heute" on:click={() => wechseln(h)}>Zurück zu heute</button>
{/if}

{#if d}
  <div class="spalten">
  <div>
  <div class="card">
    <div class="row" style="justify-content: space-between">
      <strong style="font-size: 1.2rem">Level {info.level}</strong>
      <span class="muted">{d.stand.verdient} XP gesammelt</span>
    </div>
    <div class="bar" style="margin-top: 10px" role="img" aria-label="Fortschritt bis zum nächsten Level">
      <div style="width: {Math.round(info.fortschritt * 100)}%"></div>
    </div>
    <p class="muted" style="margin-bottom: 0">Noch {info.naechster - d.stand.verdient} XP bis Level {info.level + 1}{gelsFuerLevel(d.lg, info.level + 1, d.r) ? ` · dann +${gelsFuerLevel(d.lg, info.level + 1, d.r)} Gels` : ''}</p>
    <div class="heute-gels">
      <span><Gel groesse={22} /><strong>{d.stand.gels}</strong> {d.stand.gels === 1 ? 'Gel' : 'Gels'}</span>
      <button class="link" on:click={() => gehe('shop')}>Zum Shop</button>
    </div>
  </div>

  {#if d.tp.termine.length}
    <h2>Termine</h2>
    <div class="card">
      {#each d.tp.termine as t (t.id)}
        <div class="zeile">
          <span class="zeile-text">{t.zeit ? `${t.zeit} · ` : ''}{t.titel}{#if t.notiz}<br /><span class="muted">{t.notiz}</span>{/if}</span>
        </div>
      {/each}
    </div>
  {/if}

  {#if !d.tp.plan && d.tp.eintraege.length === 0}
    <div class="card">
      <p style="margin-top: 0">Für {datum === h ? 'heute' : 'diesen Tag'} gibt es keinen Trainingsplan.</p>
      <div class="row">
        <button class="sek" on:click={() => gehe('plan')}>Plan anlegen</button>
        {#if datum >= h}<button class="sek" on:click={() => gehe('uebungen', { datum })}>Übung einplanen</button>{/if}
      </div>
    </div>
  {:else if d.tp.ruhetag}
    <h2>Ruhetag</h2>
    <div class="card">
      <p style="margin-top: 0">An diesem Tag steht keine Übung im Plan. Erholung gehört zur Reha dazu.</p>
      {#if ruheEingetragen}
        <p class="hinweis">Ruhetag eingetragen.</p>
      {:else if zukunft}
        <p class="muted" style="margin: 0">Den Ruhetag kannst du an dem Tag selbst eintragen.</p>
      {:else}
        <button on:click={ruhetagEintragen}>Ruhetag eintragen (+{d.ruheXp} XP)</button>
      {/if}
    </div>
  {:else}
    <div class="row" style="justify-content: space-between; align-items: baseline">
      <h2>{zukunft ? 'Geplant' : datum === h ? 'Dein Plan heute' : 'Dein Plan'}</h2>
      <span class="muted">{erledigtAnzahl} von {d.tp.eintraege.length} erledigt</span>
    </div>
    <div class="card">
      {#each d.tp.eintraege as e (e.id)}
        <div class="zeile" style={offenId === e.id ? 'border-bottom: none' : ''}>
          <input id="u{e.id}" type="checkbox" checked={e.erledigt} disabled={zukunft} on:change={() => umschalten(e)} />
          <label for="u{e.id}" class="zeile-text">
            {e.uebung?.name ?? 'Übung'}<br /><span class="muted">{e.extra ? 'eingeplant · ' : ''}{eintragText(e)} · +{e.xp ?? d.r.uebungXp} XP{e.uebung?.video ? ' · Video' : ''}</span>{#if e.notiz}<br /><span class="muted">{e.notiz}</span>{/if}
          </label>
          {#if !zukunft}
            <button class="sek klein" aria-expanded={offenId === e.id} on:click={() => (offenId = offenId === e.id ? null : e.id)}>
              {offenId === e.id ? 'Schließen' : 'Training'}
            </button>
          {/if}
        </div>
        {#if offenId === e.id}
          {#key datum}<TrainingPanel eintrag={e} {datum} r={d.r} />{/key}
        {/if}
      {/each}
    </div>
    {#if zukunft}<p class="muted">Abhaken geht an dem Tag selbst.</p>{/if}
  {/if}

  </div>
  <div>
  {#if !zukunft}
    <h2 class="spalte-oben">Aktivitäten</h2>
    <div class="card">
      {#each d.aktivitaeten as a}
        <div class="zeile">
          <span class="zeile-text">{a.name} <span class="muted">+{a.xp} XP</span></span>
          <button class="sek" on:click={() => aktivitaet(a.name, a.xp)}>Eintragen</button>
        </div>
      {/each}
      <label for="andere">Etwas anderes (+{d.r.aktivitaetXp} XP)</label>
      <div class="row" style="flex-wrap: nowrap">
        <input id="andere" bind:value={andere} placeholder="z. B. Freundin getroffen" />
        <button class="sek" on:click={() => aktivitaet(andere, d.r.aktivitaetXp)}>Eintragen</button>
      </div>
    </div>

    <h2>Tagebuch</h2>
    <div class="card">
      {#each d.tagebuch as e (e.id)}
        <SwipeRow aktionen={[{ label: 'Löschen', art: 'loeschen', aktion: () => tagebuchLoeschen(e) }]}>
          <div class="zeile" style="align-items: flex-start; padding: 10px 0">
            <span class="zeile-text" style="white-space: pre-line">{e.text}</span>
          </div>
        </SwipeRow>
      {/each}
      <label for="tb" style={d.tagebuch.length ? '' : 'margin-top: 0'}>{d.tagebuch.length ? 'Noch etwas ergänzen' : 'Wie war der Tag? Schreib es so, wie es ist.'}</label>
      <textarea id="tb" bind:value={tagebuchText} style="min-height: 90px"></textarea>
      <div class="row" style="margin-top: 10px; justify-content: space-between">
        <button on:click={tagebuchSpeichern} disabled={!tagebuchText.trim()}>Speichern</button>
        <button class="link" on:click={() => gehe('tagebuch')}>Alle Einträge</button>
      </div>
    </div>
  {/if}

  {#if tagLog.length}
    <h2>Eingetragen</h2>
    <div class="card">
      {#each tagLog as e (e.id)}
        <SwipeRow aktionen={e.ref ? [] : [{ label: 'Entfernen', art: 'loeschen', aktion: () => rueckgaengig(e) }]}>
          <div class="zeile">
            <span class="zeile-text">{e.grund} <span class="muted">+{e.punkte}</span></span>
          </div>
        </SwipeRow>
      {/each}
    </div>
  {/if}
  </div>
  </div>
{/if}
