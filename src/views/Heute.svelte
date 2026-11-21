<script>
  import { liveQuery } from 'dexie';
  import { db } from '../lib/db.js';
  import { heute, anzeige, iso, parse, tagKurz } from '../lib/datum.js';
  import { levelInfo, levelGels, gelsFuerLevel, xpVergeben, xpEintragen, physioEintragen, physioEntfernen, regeln, schwellen, punktestand, aktivitaeten as aktivitaetenLaden, ruhetagPunkte } from '../lib/xp.js';
  import { tagesplan } from '../lib/plan.js';
  import { gehe } from '../lib/nav.js';
  import { abhaken, zuruecknehmen } from '../lib/training.js';
  import TrainingPanel from '../lib/TrainingPanel.svelte';
  import SwipeRow from '../lib/SwipeRow.svelte';
  import { loeschenMitUndo, zeigeToast, toast } from '../lib/toast.js';
  import Gel from '../lib/Gel.svelte';
  import Sheet from '../lib/Sheet.svelte';
  import BriefOeffnen from '../lib/BriefOeffnen.svelte';
  import { briefStand } from '../lib/briefe.js';
  import { schmerzFarbe } from '../lib/schmerz.js';
  import SchmerzSkala from '../lib/SchmerzSkala.svelte';

  // Ungeöffnete Briefe stehen ganz oben (nur bei „Heute“)
  const briefe = liveQuery(briefStand);
  let offenerBrief = null;

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
    aufgeklappt = {};
    tagebuchText = '';
    tagebuchSchmerz = null;
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
  $: physioEingetragen = d ? d.log.some((e) => e.ref === `physio:${datum}`) : false;

  async function physio() {
    if (await physioEintragen(datum, d.r)) zeigeToast(`Physiotherapie eingetragen · +${d.r.physioXp} XP`, async () => {
      await physioEntfernen(datum);
      toast.set(null);
    });
  }
  $: erledigtAnzahl = d ? d.tp.eintraege.filter((e) => e.erledigt).length : 0;

  // Übungen nach Plan gruppiert, zusätzlich eingeplante (auch verschobene) als eigene Gruppe.
  // Jede Gruppe lässt sich aufklappen; ist es nur eine, ist sie anfangs offen.
  $: gruppen = d ? gruppieren(d.tp) : [];
  let aufgeklappt = {};
  function gruppieren(tp) {
    const g = tp.plaene.map((p) => ({ key: `p${p.id}`, name: p.name, eintraege: tp.eintraege.filter((e) => !e.extra && e.planId === p.id) }));
    const extra = tp.eintraege.filter((e) => e.extra);
    if (extra.length) g.push({ key: 'extra', name: 'Zusätzlich eingeplant', eintraege: extra });
    return g.filter((x) => x.eintraege.length);
  }

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
  let tagebuchSchmerz = null; // 0–10 oder null
  async function tagebuchSpeichern() {
    if (!tagebuchText.trim() && tagebuchSchmerz === null) return;
    await db.tagebuch.add({ datum, text: tagebuchText.trim(), schmerz: tagebuchSchmerz, zeit: Date.now() });
    tagebuchText = '';
    tagebuchSchmerz = null;
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
  {#if datum === h && $briefe?.ungeoeffnet.length}
    <div class="card brief-karte">
      {#each $briefe.ungeoeffnet as b (b.id)}
        <div class="zeile">
          <span class="brief-mini" aria-hidden="true"><span></span></span>
          <span class="zeile-text"><strong>Ein Brief für dich</strong><br /><span class="muted">freigeschaltet mit Level {b.level}</span></span>
          <button on:click={() => (offenerBrief = b)}>Öffnen</button>
        </div>
      {/each}
    </div>
  {/if}

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
          {#if t.art === 'physio' && !zukunft}
            {#if physioEingetragen}<span class="muted">✓ war da</span>
            {:else}<button class="sek klein" on:click={physio}>Ich war da (+{d.r.physioXp} XP)</button>{/if}
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  {#if !d.tp.plan && d.tp.eintraege.length === 0}
    <div class="card">
      <p style="margin-top: 0">Für {datum === h ? 'heute' : 'diesen Tag'} gibt es keinen Trainingsplan.</p>
      <div class="row">
        <button class="sek" on:click={() => gehe('plan')}>Plan anlegen</button>
        {#if datum >= h}<button class="sek" on:click={() => gehe('uebungen', { datum, von: 'heute' })}>Übung einplanen</button>{/if}
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
  {:else if d.tp.eintraege.length === 0}
    <h2>Verschoben</h2>
    <div class="card">
      <p style="margin-top: 0">Die Übungen {datum === h ? 'von heute' : 'dieses Tages'} sind verschoben.</p>
      {#each d.tp.weg as w (w.id)}
        <div class="muted">{w.uebung?.name ?? 'Übung'} · auf {tagKurz(w.datum)}</div>
      {/each}
      <button class="link" style="margin-top: 10px" on:click={() => gehe('kalender', { datum })}>Im Kalender ansehen</button>
    </div>
  {:else}
    <div class="row" style="justify-content: space-between; align-items: baseline">
      <h2>{zukunft ? 'Geplant' : datum === h ? 'Dein Plan heute' : 'Dein Plan'}</h2>
      <span class="muted">{erledigtAnzahl} von {d.tp.eintraege.length} erledigt</span>
    </div>
    <div class="card">
      {#each gruppen as g (g.key)}
        {@const offen = aufgeklappt[g.key] ?? gruppen.length === 1}
        {@const fertig = g.eintraege.filter((e) => e.erledigt).length}
        <div class="plan-gruppe">
        <button class="plan-kopf" aria-expanded={offen} on:click={() => (aufgeklappt = { ...aufgeklappt, [g.key]: !offen })}>
          <span class="zeile-text"><strong>{g.name}</strong><br /><span class="muted">{g.eintraege.length === 1 ? '1 Übung' : `${g.eintraege.length} Übungen`} · {fertig === g.eintraege.length ? 'alle erledigt ✓' : `${fertig} erledigt`}</span></span>
          <span class="plan-pfeil" class:offen aria-hidden="true">›</span>
        </button>
        {#if offen}
      {#each g.eintraege as e (e.id)}
        <div class="zeile" style={offenId === e.id ? 'border-bottom: none' : ''}>
          <input id="u{e.id}" type="checkbox" checked={e.erledigt} disabled={zukunft} on:change={() => umschalten(e)} />
          <label for="u{e.id}" class="zeile-text">
            {e.uebung?.name ?? 'Übung'}<br /><span class="muted">{e.vonDatum ? `von ${tagKurz(e.vonDatum)} verschoben · ` : e.extra ? 'eingeplant · ' : ''}+{e.xp ?? d.r.uebungXp} XP</span>
          </label>
          <button class="sek klein" aria-expanded={offenId === e.id} on:click={() => (offenId = offenId === e.id ? null : e.id)}>
            {offenId === e.id ? 'Schließen' : zukunft ? 'Details' : 'Training'}
          </button>
        </div>
        {#if offenId === e.id}
          {#key datum}<TrainingPanel eintrag={e} {datum} r={d.r} nurDetails={zukunft} />{/key}
        {/if}
      {/each}
        {/if}
        </div>
      {/each}
    </div>
    {#if zukunft}<p class="muted">Abhaken geht an dem Tag selbst.</p>{/if}
    {#if erledigtAnzahl < d.tp.eintraege.length}
      <button class="link" on:click={() => gehe('kalender', { datum })}>Keine Zeit? Übungen auf einen anderen Tag verschieben</button>
    {/if}
    {#if d.tp.weg.length}
      <p class="muted">{d.tp.weg.length === 1 ? '1 Übung' : `${d.tp.weg.length} Übungen`} verschoben auf {[...new Set(d.tp.weg.map((w) => tagKurz(w.datum)))].join(', ')}</p>
    {/if}
  {/if}

  </div>
  <div>
  {#if !zukunft}
    <h2 class="spalte-oben">Aktivitäten</h2>
    <div class="card">
      <div class="zeile">
        <span class="zeile-text">Physiotherapie <span class="muted">+{d.r.physioXp} XP</span></span>
        {#if physioEingetragen}<span class="muted">✓ eingetragen</span>
        {:else}<button class="sek" on:click={physio}>Eintragen</button>{/if}
      </div>
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
            <span class="zeile-text">
              {#if typeof e.schmerz === 'number'}<span class="schmerz-badge" style="background: {schmerzFarbe(e.schmerz)}; margin-left: 0">Schmerz {e.schmerz}</span>{/if}
              {#if e.text}{#if typeof e.schmerz === 'number'}<br />{/if}<span style="white-space: pre-line">{e.text}</span>{/if}
            </span>
          </div>
        </SwipeRow>
      {/each}
      <label for="tb" style={d.tagebuch.length ? '' : 'margin-top: 0'}>{d.tagebuch.length ? 'Noch etwas ergänzen' : 'Wie war der Tag? Schreib es so, wie es ist.'}</label>
      <textarea id="tb" bind:value={tagebuchText} style="min-height: 90px"></textarea>
      <SchmerzSkala bind:wert={tagebuchSchmerz} id="schmerz-heute" label={datum === heute() ? 'Schmerz heute (optional)' : 'Schmerz an diesem Tag (optional)'} />
      <div class="row" style="margin-top: 10px; justify-content: space-between">
        <button on:click={tagebuchSpeichern} disabled={!tagebuchText.trim() && tagebuchSchmerz === null}>Speichern</button>
        <button class="link" on:click={() => gehe('tagebuch')}>Alle Einträge</button>
      </div>
    </div>
  {/if}

  {#if tagLog.length}
    <h2>Eingetragen</h2>
    <div class="card">
      {#each tagLog as e (e.id)}
        <SwipeRow aktionen={!e.ref || e.ref.startsWith('physio:') ? [{ label: 'Entfernen', art: 'loeschen', aktion: () => rueckgaengig(e) }] : []}>
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

<Sheet offen={offenerBrief !== null} titel="Brief" onclose={() => (offenerBrief = null)}>
  {#if offenerBrief}{#key offenerBrief.id}<BriefOeffnen brief={offenerBrief} />{/key}{/if}
</Sheet>
