<script>
  import { liveQuery } from 'dexie';
  import { db } from '../lib/db.js';
  import { heute, wochentag, TAGE, TAGE_LANG, kurz } from '../lib/datum.js';
  import { planAusListe } from '../lib/plan.js';
  import { istAusdauer, streckeEinheit } from '../lib/ausdauer.js';
  import { alsDataUrl, dataUrlOeffnen } from '../lib/datei.js';
  import { gehe } from '../lib/nav.js';
  import Video from '../lib/Video.svelte';
  import { pdfAuslesen, inBibliothek } from '../lib/pdfimport.js';
  import { loeschenMitUndo } from '../lib/toast.js';
  import Sheet from '../lib/Sheet.svelte';
  import SwipeRow from '../lib/SwipeRow.svelte';

  export let params = {};

  const plaene = liveQuery(() => db.plaene.orderBy('start').reverse().toArray());

  let planId = params.planId ?? null;
  let tag = params.wochentag ?? wochentag(heute());

  $: if (planId === null && $plaene && $plaene.length) planId = (planAusListe($plaene, heute()) || $plaene[0]).id;
  $: plan = ($plaene || []).find((p) => p.id === planId);

  $: eintraege = planId
    ? liveQuery(async () => {
        const es = await db.planEintraege.where('planId').equals(planId).toArray();
        const ue = await db.uebungen.bulkGet(es.map((e) => e.uebungId));
        return es.map((e, i) => ({ ...e, uebung: ue[i] }));
      })
    : null;
  $: tagesListe = ($eintraege || []).filter((e) => e.wochentag === tag);
  $: trainingstage = new Set(($eintraege || []).map((e) => e.wochentag));

  // neuer Plan
  let zeigeNeu = false;
  let neuName = '';
  let neuStart = heute();
  let neuEnde = '';

  async function planAnlegen() {
    if (!neuName.trim() || !neuStart) return;
    planId = await db.plaene.add({ name: neuName.trim(), start: neuStart, ende: neuEnde || null });
    zeigeNeu = false;
    neuName = '';
    neuEnde = '';
  }

  async function planLoeschen() {
    if (!plan || !confirm(`Plan „${plan.name}“ mit allen Übungen löschen? Bereits abgehakte Tage behalten ihre XP.`)) return;
    await db.planEintraege.where('planId').equals(plan.id).delete();
    await db.plaene.delete(plan.id);
    planId = null;
  }

  // Übung bearbeiten
  let bearbeitId = null;
  let f = {};
  function bearbeiten(e) {
    bearbeitId = e.id;
    f = { saetze: e.saetze ?? '', wdh: e.wdh ?? '', gewicht: e.gewicht ?? '', dauer: e.dauer ?? '', strecke: e.strecke ?? '', xp: e.xp ?? '', video: e.uebung?.video ?? '', notiz: e.notiz ?? '', vorgabe: e.vorgabe ?? '' };
  }
  const zahl = (v) => (v === '' || v === null ? null : Number(String(v).replace(',', '.')));
  async function speichern() {
    const e = tagesListe.find((x) => x.id === bearbeitId);
    await db.planEintraege.update(bearbeitId, {
      saetze: zahl(f.saetze),
      wdh: zahl(f.wdh),
      gewicht: zahl(f.gewicht),
      dauer: zahl(f.dauer),
      strecke: zahl(f.strecke),
      xp: zahl(f.xp),
      vorgabe: String(f.vorgabe).trim() || null,
      notiz: String(f.notiz).trim() || null
    });
    if (e && e.uebungId) await db.uebungen.update(e.uebungId, { video: f.video.trim() || null });
    bearbeitId = null;
  }
  $: bearbeitEintrag = tagesListe.find((x) => x.id === bearbeitId);
  async function entfernen(e) {
    await loeschenMitUndo(`„${e.uebung?.name ?? 'Übung'}“ am ${TAGE_LANG[tag - 1]} entfernt`, [{ tabelle: 'planEintraege', ids: [e.id] }]);
  }

  // Physio-Plan als Datei
  let dateiInput;
  let bibHinweis = '';
  async function dateiGewaehlt(ev) {
    const datei = ev.target.files[0];
    if (!datei || !plan) return;
    const dataUrl = await alsDataUrl(datei);
    await db.plaene.update(plan.id, { datei: dataUrl, dateiName: datei.name });
    ev.target.value = '';
    bibHinweis = '';
    if (!dataUrl.startsWith('data:application/pdf')) return;
    // Übungen aus dem Physio-Plan direkt in die Bibliothek aufnehmen
    bibHinweis = 'Übungen werden gelesen …';
    try {
      const gefunden = await pdfAuslesen(dataUrl);
      if (!gefunden.length) bibHinweis = 'In der PDF wurden keine Übungen mit Link erkannt.';
      else {
        const { neu } = await inBibliothek(gefunden);
        bibHinweis = neu
          ? `${neu} ${neu === 1 ? 'Übung' : 'Übungen'} aus dem Plan in deine Bibliothek aufgenommen (Filter „Physio“).`
          : 'Alle Übungen aus dem Plan sind schon in deiner Bibliothek.';
      }
    } catch (e) {
      console.error(e);
      bibHinweis = 'Die PDF konnte nicht gelesen werden.';
    }
  }
</script>

<h1>Plan</h1>

{#if plan}
  <div class="card">
    <strong>{plan.name}</strong><br />
    <span class="muted">ab {kurz(plan.start)}{plan.ende ? ` bis ${kurz(plan.ende)}` : ''} · Training an {[...trainingstage].sort().map((t) => TAGE[t - 1]).join(', ') || 'noch keinem Tag'}</span>
    {#if $plaene.length > 1}
      <label for="planwahl">Plan wählen</label>
      <select id="planwahl" bind:value={planId}>
        {#each $plaene as p (p.id)}<option value={p.id}>{p.name} (ab {kurz(p.start)})</option>{/each}
      </select>
    {/if}
    <div class="row" style="margin-top: 12px">
      <button class="sek" on:click={() => (zeigeNeu = true)}>Neuer Plan</button>
      <button class="sek" on:click={planLoeschen}>Plan löschen</button>
    </div>
  </div>
{/if}

{#if $plaene && $plaene.length === 0}
  <div class="card">
    <strong>Neuen Plan anlegen</strong>
    {@render planFormular()}
  </div>
{/if}

<Sheet offen={zeigeNeu} titel="Neuer Plan" onclose={() => (zeigeNeu = false)}>
  {@render planFormular()}
</Sheet>

{#snippet planFormular()}
    
    <label for="pname">Name (z. B. „Reha Woche 1 bis 6“)</label>
    <input id="pname" bind:value={neuName} />
    <div class="row" style="flex-wrap: nowrap">
      <div style="flex: 1; min-width: 0"><label for="pstart">Start</label><input id="pstart" type="date" bind:value={neuStart} /></div>
      <div style="flex: 1; min-width: 0"><label for="pende">Ende (optional)</label><input id="pende" type="date" bind:value={neuEnde} /></div>
    </div>
    <p class="muted">Tage ohne Übung im Plan zählen als Ruhetage.</p>
    <div class="sheet-aktionen"><button on:click={planAnlegen}>Plan anlegen</button></div>
  {/snippet}

{#if plan}
  <div class="wochentage" role="group" aria-label="Wochentag">
    {#each TAGE as t, i}
      <button class="chip" class:an={tag === i + 1} aria-pressed={tag === i + 1} on:click={() => { tag = i + 1; bearbeitId = null; }}>
        {t}{#if trainingstage.has(i + 1)}<span class="punkt" aria-hidden="true"></span>{/if}
      </button>
    {/each}
  </div>

  <h2>{TAGE_LANG[tag - 1]}</h2>
  <div class="card">
    {#if tagesListe.length === 0}
      <p class="muted" style="margin: 0">Keine Übungen, also Ruhetag.</p>
    {/if}
    {#each tagesListe as e (e.id)}
      <SwipeRow
        aktionen={[
          { label: 'Löschen', art: 'loeschen', aktion: () => entfernen(e) },
          { label: 'Ändern', art: 'neutral', aktion: () => bearbeiten(e) }
        ]}
      >
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
        <div class="zeile tippbar" on:click={() => bearbeiten(e)}>
          <span class="zeile-text">{e.uebung?.name ?? 'Übung'}</span>
          <span class="muted" aria-hidden="true">›</span>
        </div>
      </SwipeRow>
    {/each}
  </div>
  <button class="sek breit" on:click={() => gehe('uebungen', { planId, wochentag: tag })}>Übung hinzufügen</button>

  <h2>Plan vom Physio</h2>
  <div class="card">
    {#if plan.datei}
      <strong>{plan.dateiName}</strong><br /><span class="muted">nur auf diesem Gerät gespeichert</span>
      <div class="row" style="margin-top: 10px">
        <button class="sek" on:click={() => dataUrlOeffnen(plan.datei)}>Ansehen</button>
        <button class="sek" on:click={() => dateiInput.click()}>Ersetzen</button>
      </div>
      {#if plan.datei.startsWith('data:application/pdf')}
        <button class="breit" style="margin-top: 10px" on:click={() => gehe('pdfimport', { planId })}>Übungen aus PDF übernehmen</button>
      {/if}
    {:else}
      <p class="muted" style="margin-top: 0">PDF oder Foto des Plans anhängen, um ihn jederzeit nachzusehen.</p>
      <button class="sek" on:click={() => dateiInput.click()}>Datei anhängen</button>
      <button class="breit" style="margin-top: 10px" on:click={() => gehe('pdfimport', { planId })}>Übungen aus PDF übernehmen</button>
    {/if}
    {#if bibHinweis}<p class="hinweis">{bibHinweis}</p>{/if}
    <input bind:this={dateiInput} type="file" accept="application/pdf,image/*" on:change={dateiGewaehlt} style="display: none" />
  </div>
{/if}

<Sheet offen={!!bearbeitEintrag} titel={bearbeitEintrag?.uebung?.name ?? 'Übung'} onclose={() => (bearbeitId = null)}>
  {#if bearbeitEintrag}
    {#if istAusdauer(bearbeitEintrag.uebung)}
      <div class="row" style="flex-wrap: nowrap">
        <div style="flex: 1; min-width: 0"><label for="pd">Dauer (Min)</label><input id="pd" inputmode="decimal" bind:value={f.dauer} placeholder="optional" /></div>
        <div style="flex: 1; min-width: 0"><label for="pst">Strecke ({streckeEinheit(bearbeitEintrag.uebung)})</label><input id="pst" inputmode="decimal" bind:value={f.strecke} placeholder="optional" /></div>
      </div>
      <div class="row" style="flex-wrap: nowrap">
        <div style="flex: 1; min-width: 0"><label for="px">XP (5 bis 10)</label><input id="px" inputmode="numeric" bind:value={f.xp} placeholder="Standard" /></div>
        <div style="flex: 1; min-width: 0"></div>
      </div>
    {:else}
      <div class="row" style="flex-wrap: nowrap">
        <div style="flex: 1; min-width: 0"><label for="ps">Sätze</label><input id="ps" inputmode="numeric" bind:value={f.saetze} /></div>
        <div style="flex: 1; min-width: 0"><label for="pw">Wdh.</label><input id="pw" inputmode="numeric" bind:value={f.wdh} /></div>
      </div>
      <div class="row" style="flex-wrap: nowrap">
        <div style="flex: 1; min-width: 0"><label for="pg">Gewicht (kg)</label><input id="pg" inputmode="decimal" bind:value={f.gewicht} /></div>
        <div style="flex: 1; min-width: 0"><label for="px">XP (5 bis 10)</label><input id="px" inputmode="numeric" bind:value={f.xp} placeholder="Standard" /></div>
      </div>
    {/if}
    <label for="pvg">Vorgabe wie im Plan (optional, z. B. {istAusdauer(bearbeitEintrag.uebung) ? '„locker, Puls unter 130“' : '„3 × 30 Sek“'})</label>
    <input id="pvg" bind:value={f.vorgabe} />
    <label for="pnz">Anmerkung</label>
    <input id="pnz" bind:value={f.notiz} />
    <label for="pv">YouTube-Link (gilt für diese Übung in allen Plänen)</label>
    <input id="pv" type="url" inputmode="url" bind:value={f.video} placeholder="https://youtu.be/…" />
    {#if f.video}<div style="margin-top: 8px"><Video url={f.video} /></div>{/if}
    <div class="sheet-aktionen">
      <button class="sek gefahr" on:click={() => { const e = bearbeitEintrag; bearbeitId = null; entfernen(e); }}>Entfernen</button>
      <button on:click={speichern}>Speichern</button>
    </div>
  {/if}
</Sheet>
