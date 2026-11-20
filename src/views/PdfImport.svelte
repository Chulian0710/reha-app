<script>
  import { onMount } from 'svelte';
  import { db } from '../lib/db.js';
  import { TAGE } from '../lib/datum.js';
  import { alsDataUrl } from '../lib/datei.js';
  import { pdfAuslesen, inBibliothek } from '../lib/pdfimport.js';
  import { sxrLesen } from '../lib/pdfparse.js';
  import { youtubeId } from '../lib/youtube.js';
  import { gehe } from '../lib/nav.js';

  export let params = {};
  const planId = params.planId;

  let plan = null;
  let zeilen = null;
  let status = '';
  let fehler = '';
  let bibHinweis = '';
  let tage = [];
  let dateiInput;

  onMount(async () => {
    plan = await db.plaene.get(planId);
    if (plan) {
      const tageImPlan = new Set((await db.planEintraege.where('planId').equals(planId).toArray()).map((e) => e.wochentag));
      tage = [...tageImPlan].sort();
    }
    if (plan?.datei && plan.datei.startsWith('data:application/pdf')) await lesen(plan.datei);
  });

  async function lesen(quelle) {
    fehler = '';
    zeilen = null;
    status = 'PDF wird gelesen …';
    try {
      const gefunden = await pdfAuslesen(quelle);
      zeilen = gefunden.map((z, i) => ({
        ...z,
        nr: i + 1,
        an: true,
        sxr: z.vorgabe ?? '',
        notiz: z.notiz ?? ''
      }));
      if (gefunden.length) {
        const { neu } = await inBibliothek(gefunden);
        bibHinweis = neu ? `${neu} ${neu === 1 ? 'Übung' : 'Übungen'} in deine Bibliothek aufgenommen.` : 'Alle Übungen sind schon in deiner Bibliothek.';
      }
      if (!zeilen.length) fehler = 'Keine Übungen mit Link gefunden. Ist die PDF vielleicht eingescannt (Foto statt Text)? Dann bitte die Übungen von Hand anlegen.';
    } catch (e) {
      fehler = 'Die PDF konnte nicht gelesen werden.';
      console.error(e);
    }
    status = '';
  }

  async function dateiGewaehlt(ev) {
    const datei = ev.target.files[0];
    ev.target.value = '';
    if (!datei) return;
    const dataUrl = await alsDataUrl(datei);
    await db.plaene.update(planId, { datei: dataUrl, dateiName: datei.name });
    plan = await db.plaene.get(planId);
    await lesen(dataUrl);
  }

  function tagUmschalten(t) {
    tage = tage.includes(t) ? tage.filter((x) => x !== t) : [...tage, t].sort();
  }

  $: anzahl = zeilen ? zeilen.filter((z) => z.an).length : 0;

  async function uebernehmen() {
    if (!anzahl || !tage.length) return;
    status = 'Wird übernommen …';
    const alle = await db.uebungen.toArray();
    let neu = 0;
    for (const z of zeilen.filter((z) => z.an && z.name.trim())) {
      const name = z.name.trim();
      const vorhanden = alle.find((u) => u.name.toLowerCase() === name.toLowerCase());
      let id;
      if (vorhanden) {
        id = vorhanden.id;
        // eine gelöschte Übung kommt mit dem Plan zurück
        if (z.video || vorhanden.geloescht) await db.uebungen.update(id, { ...(z.video ? { video: z.video } : {}), geloescht: false });
      } else {
        id = await db.uebungen.add({ name, kategorie: 'reha', bereich: '', quelle: 'physio', video: z.video || null });
        alle.push({ id, name });
      }
      const sxr = z.sxr.trim() ? sxrLesen(z.sxr) : null;
      for (const wt of tage) {
        const doppelt = await db.planEintraege
          .where('planId')
          .equals(planId)
          .filter((e) => e.wochentag === wt && e.uebungId === id)
          .count();
        if (doppelt) continue;
        await db.planEintraege.add({
          planId,
          wochentag: wt,
          uebungId: id,
          saetze: sxr ? sxr.saetze : null,
          wdh: sxr ? sxr.wdh : null,
          vorgabe: z.sxr.trim() || null,
          notiz: z.notiz.trim() || null,
          gewicht: null,
          xp: null
        });
        neu++;
      }
    }
    status = '';
    alert(`${neu} Einträge im Plan angelegt. Bereits vorhandene Übungen an diesen Tagen wurden übersprungen.`);
    gehe('plan', { planId, wochentag: tage[0] });
  }
</script>

<h1>Übungen aus PDF</h1>
{#if plan}<p class="muted" style="margin-top: -8px">für „{plan.name}“</p>{/if}

<div class="hinweis">
  Die PDF wird nur auf diesem Gerät gelesen. Erkannt werden Übungsname mit Link, Sets × Reps und Anmerkungen. Bitte prüfe alles, bevor du es übernimmst.
</div>

<div class="card" style="margin-top: 12px">
  {#if plan?.dateiName}
    <p style="margin-top: 0"><strong>{plan.dateiName}</strong></p>
  {/if}
  <button class="sek" on:click={() => dateiInput.click()}>{plan?.datei ? 'Andere PDF wählen' : 'PDF wählen'}</button>
  <input bind:this={dateiInput} type="file" accept="application/pdf" on:change={dateiGewaehlt} style="display: none" />
  {#if status}<p class="muted">{status}</p>{/if}
  {#if fehler}<p class="fehler">{fehler}</p>{/if}
  {#if bibHinweis}<p class="hinweis">{bibHinweis} Du findest sie unter Übungen im Filter „Physio“.</p>{/if}
</div>

{#if zeilen && zeilen.length}
  <h2>{zeilen.length} Übungen gefunden</h2>
  {#each zeilen as z, i}
    <div class="card" class:aus={!z.an}>
      <div class="zeile" style="border: none; min-height: 0; padding-top: 0">
        <input id="an{i}" type="checkbox" bind:checked={z.an} />
        <label for="an{i}" class="zeile-text" style="margin: 0">Übernehmen <span class="muted">· Seite {z.seite}</span></label>
      </div>
      {#if z.an}
        <label for="n{i}">Name</label>
        <input id="n{i}" bind:value={z.name} />
        <label for="s{i}">Sets × Reps</label>
        <input id="s{i}" bind:value={z.sxr} placeholder="leer = ohne Vorgabe" />
        <label for="a{i}">Anmerkung</label>
        <textarea id="a{i}" bind:value={z.notiz} style="min-height: 64px"></textarea>
        <p class="muted" style="margin: 8px 0 0">{youtubeId(z.video) ? 'YouTube-Video verknüpft' : `Link: ${z.video}`}</p>
      {/if}
    </div>
  {/each}

  <h2>An welchen Tagen?</h2>
  <div class="wochentage" role="group" aria-label="Wochentage">
    {#each TAGE as t, i}
      <button class="chip" class:an={tage.includes(i + 1)} aria-pressed={tage.includes(i + 1)} on:click={() => tagUmschalten(i + 1)}>{t}</button>
    {/each}
  </div>
  <p class="muted">Gilt für alle ausgewählten Übungen. Für unterschiedliche Tage einfach zweimal übernehmen, mit anderer Auswahl.</p>

  <button class="breit" disabled={!anzahl || !tage.length || !!status} on:click={uebernehmen}>
    {anzahl} {anzahl === 1 ? 'Übung' : 'Übungen'} übernehmen{tage.length ? ` (${tage.map((t) => TAGE[t - 1]).join(', ')})` : ''}
  </button>
{/if}

<button class="sek breit" style="margin-top: 10px" on:click={() => gehe('plan', { planId })}>Zurück zum Plan</button>
