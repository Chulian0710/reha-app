<script>
  import { onMount } from 'svelte';
  import { liveQuery } from 'dexie';
  import { db, heute } from '../lib/db.js';
  import { kurz } from '../lib/datum.js';
  import { umfangReihen, zielePruefen, zahlText } from '../lib/ziele.js';
  import { gehe } from '../lib/nav.js';
  import LineChart from '../lib/LineChart.svelte';
  import Sheet from '../lib/Sheet.svelte';
  import SwipeRow from '../lib/SwipeRow.svelte';
  import { loeschenMitUndo } from '../lib/toast.js';

  // Kraft kommt direkt aus dem Training (siehe Fortschritt). Hier nur Umfang und weitere Werte.
  const weitereTypen = {
    beweglichkeit: { label: 'Beweglichkeit (Grad)', einheit: '°', seitig: true },
    schmerz: { label: 'Schmerz (0–10)', einheit: '', seitig: false },
    frei: { label: 'Eigener Wert', einheit: '', seitig: false }
  };
  const LINKS = '#00897b';
  const RECHTS = '#c4561a';

  let gruppe = 'umfang';
  let hinweis = '';
  let stellen = [];
  onMount(async () => {
    stellen = await umfangReihen();
  });

  const reihen = liveQuery(() => db.reihen.toArray());
  $: umfang = ($reihen || []).filter((r) => r.typ === 'umfang');
  // Standard-Messstellen zuerst, dann eigene
  $: umfangSortiert = [...stellen.filter((s) => umfang.some((u) => u.id === s.id)), ...umfang.filter((u) => !stellen.some((s) => s.id === u.id))];
  $: weitere = ($reihen || []).filter((r) => weitereTypen[r.typ]);
  $: inGruppe = gruppe === 'umfang' ? umfangSortiert : weitere;

  let gewaehlteId = null;
  $: if ($reihen && !inGruppe.some((r) => r.id === gewaehlteId)) gewaehlteId = inGruppe[0]?.id ?? null;
  $: aktuelle = inGruppe.find((r) => r.id === gewaehlteId);
  $: seitig = aktuelle ? aktuelle.typ === 'umfang' || weitereTypen[aktuelle.typ]?.seitig : false;

  function gruppeWechseln(g) {
    gruppe = g;
    hinweis = '';
    gewaehlteId = null;
  }

  // --- Umfang: alle Messstellen auf einmal ---
  let mDatum = heute();
  let eingabe = {}; // { ['<reiheId>L' | '<reiheId>R']: Text }

  const alsZahl = (v) => (String(v).trim() === '' ? null : Number(String(v).replace(',', '.')));

  async function messungSpeichern() {
    const neu = [];
    for (const s of umfangSortiert) {
      for (const seite of ['L', 'R']) {
        const w = alsZahl(eingabe[s.id + seite] ?? '');
        if (w !== null && !Number.isNaN(w)) neu.push({ reiheId: s.id, datum: mDatum, seite, wert: w, wdh: null, saetze: null, notiz: null });
      }
    }
    if (!neu.length) return;
    await db.werte.bulkAdd(neu);
    eingabe = {};
    const ziele = await zielePruefen(mDatum);
    hinweis = `${neu.length} ${neu.length === 1 ? 'Wert' : 'Werte'} gespeichert.` + (ziele.length ? ` Ziel erreicht: ${ziele.join(', ')}!` : '');
  }

  // --- Weitere: einzelne Messreihen ---
  let zeigeNeu = false;
  let neuerName = '';
  let neuerTyp = 'beweglichkeit';
  async function reiheAnlegen() {
    if (!neuerName.trim()) return;
    gewaehlteId = await db.reihen.add({ name: neuerName.trim(), typ: neuerTyp, einheit: weitereTypen[neuerTyp].einheit, uebungId: null });
    neuerName = '';
    zeigeNeu = false;
  }

  let datum = heute();
  let seite = 'L';
  let wert = '';
  let notiz = '';
  async function wertSpeichern() {
    const zahl = alsZahl(wert);
    if (!aktuelle || zahl === null || Number.isNaN(zahl)) return;
    await db.werte.add({ reiheId: aktuelle.id, datum, seite: seitig ? seite : '-', wert: zahl, wdh: null, saetze: null, notiz: notiz.trim() || null });
    wert = '';
    notiz = '';
    const ziele = await zielePruefen(datum);
    hinweis = 'Gespeichert.' + (ziele.length ? ` Ziel erreicht: ${ziele.join(', ')}!` : '');
  }

  // --- Verlauf der gewählten Reihe ---
  $: werte = gewaehlteId ? liveQuery(() => db.werte.where('reiheId').equals(gewaehlteId).toArray()) : null;
  $: liste = $werte ? $werte.slice().sort((a, b) => b.datum.localeCompare(a.datum) || b.id - a.id) : [];
  $: einheit = aktuelle?.einheit || '';
  $: serien = !aktuelle
    ? []
    : seitig
      ? [
          { name: 'Links', farbe: LINKS, gestrichelt: false, punkte: liste.filter((w) => w.seite === 'L').map((w) => ({ datum: w.datum, wert: w.wert })) },
          { name: 'Rechts', farbe: RECHTS, gestrichelt: true, punkte: liste.filter((w) => w.seite === 'R').map((w) => ({ datum: w.datum, wert: w.wert })) }
        ]
      : [{ name: aktuelle.name, farbe: LINKS, punkte: liste.map((w) => ({ datum: w.datum, wert: w.wert })) }];
  $: letzteL = liste.find((w) => w.seite === 'L');
  $: letzteR = liste.find((w) => w.seite === 'R');

  async function loeschen(w) {
    await loeschenMitUndo('Messwert gelöscht', [{ tabelle: 'werte', ids: [w.id] }]);
  }
</script>

<h1>Messwerte</h1>

<div class="chips" role="group" aria-label="Art der Messung">
  {#each [['umfang', 'Umfang'], ['weitere', 'Weitere']] as [id, label]}
    <button class="chip" class:an={gruppe === id} aria-pressed={gruppe === id} on:click={() => gruppeWechseln(id)}>{label}</button>
  {/each}
</div>
<p class="muted">Kraft musst du nicht eintragen: Sie kommt direkt aus deinen Trainingssätzen. <button class="link" on:click={() => gehe('fortschritt')}>Zum Fortschritt</button></p>

{#if gruppe === 'umfang'}
  <h2>Neue Messung (cm)</h2>
  <div class="card">
    <label for="mdatum">Datum</label>
    <input id="mdatum" type="date" bind:value={mDatum} />
    <div class="messraster">
      <span></span><span class="muted">Links</span><span class="muted">Rechts</span>
      {#each umfangSortiert as s (s.id)}
        <span class="messstelle">{s.name}</span>
        <input aria-label="{s.name} links in cm" inputmode="decimal" placeholder="–" bind:value={eingabe[s.id + 'L']} />
        <input aria-label="{s.name} rechts in cm" inputmode="decimal" placeholder="–" bind:value={eingabe[s.id + 'R']} />
      {/each}
    </div>
    <p class="muted" style="margin: 8px 0 12px">Leere Felder werden nicht gespeichert.</p>
    <button class="breit" on:click={messungSpeichern}>Messung speichern</button>
    {#if hinweis}<p class="hinweis">{hinweis}</p>{/if}
  </div>
{:else}
  <div class="card" style="margin-top: 12px">
    {#if weitere.length}
      <label for="reihe" style="margin-top: 0">Messreihe</label>
      <select id="reihe" bind:value={gewaehlteId}>
        {#each weitere as r (r.id)}<option value={r.id}>{r.name}</option>{/each}
      </select>
    {:else}
      <p class="muted" style="margin-top: 0">Noch keine Messreihe angelegt, z. B. Beweglichkeit im Knie oder Schmerz.</p>
    {/if}
    {#if !weitere.length}
      <div style="margin-top: 12px">
        <strong>Neue Messreihe</strong>
        {@render reiheFormular()}
      </div>
    {:else}
      <button class="link" style="margin-top: 10px" on:click={() => (zeigeNeu = true)}>Neue Messreihe anlegen</button>
    {/if}
  </div>

  {#if aktuelle}
    <h2>Wert eintragen: {aktuelle.name}</h2>
    <div class="card">
      <label for="datum" style="margin-top: 0">Datum</label>
      <input id="datum" type="date" bind:value={datum} />
      {#if seitig}
        <span class="feldname">Seite</span>
        <div class="row" style="flex-wrap: nowrap">
          <button style="flex: 1" class:sek={seite !== 'L'} aria-pressed={seite === 'L'} on:click={() => (seite = 'L')}>Links</button>
          <button style="flex: 1" class:sek={seite !== 'R'} aria-pressed={seite === 'R'} on:click={() => (seite = 'R')}>Rechts</button>
        </div>
      {/if}
      <label for="wert">Wert {einheit ? `(${einheit})` : ''}</label>
      <input id="wert" inputmode="decimal" bind:value={wert} />
      <label for="notiz">Notiz (optional)</label>
      <input id="notiz" bind:value={notiz} />
      <div style="margin-top: 12px"><button class="breit" on:click={wertSpeichern}>Speichern</button></div>
      {#if hinweis}<p class="hinweis">{hinweis}</p>{/if}
    </div>
  {/if}
{/if}

{#if inGruppe.length}
  <h2>Verlauf</h2>
  {#if gruppe === 'umfang'}
    <div class="chips" role="group" aria-label="Messstelle">
      {#each umfangSortiert as s (s.id)}
        <button class="chip" class:an={gewaehlteId === s.id} aria-pressed={gewaehlteId === s.id} on:click={() => (gewaehlteId = s.id)}>{s.name}</button>
      {/each}
    </div>
  {/if}
  {#if aktuelle}
    <div class="card" style="margin-top: 10px">
      <strong>{aktuelle.name}</strong>
      {#if seitig && letzteL && letzteR}
        <span class="muted"> · Unterschied links/rechts zuletzt: {zahlText(Math.abs(letzteL.wert - letzteR.wert))} {einheit}</span>
      {/if}
      <div style="margin-top: 8px"><LineChart series={serien} {einheit} /></div>
    </div>

    <div class="card">
      {#if liste.length === 0}
        <p class="muted" style="margin: 0">Noch keine Einträge.</p>
      {/if}
      {#each liste as w (w.id)}
        <SwipeRow aktionen={[{ label: 'Löschen', art: 'loeschen', aktion: () => loeschen(w) }]}>
        <div class="zeile">
          <span class="zeile-text">
            {kurz(w.datum)}{w.seite === 'L' ? ' · Links' : w.seite === 'R' ? ' · Rechts' : ''} · <strong>{zahlText(w.wert)}</strong> {einheit}
            {#if w.notiz}<br /><span class="muted">{w.notiz}</span>{/if}
          </span>
        </div>
        </SwipeRow>
      {/each}
    </div>
  {/if}
{/if}

<Sheet offen={zeigeNeu} titel="Neue Messreihe" onclose={() => (zeigeNeu = false)}>
  {@render reiheFormular()}
</Sheet>

{#snippet reiheFormular()}
        <label for="typ">Art</label>
        <select id="typ" bind:value={neuerTyp}>
          {#each Object.entries(weitereTypen) as [id, t]}<option value={id}>{t.label}</option>{/each}
        </select>
        <label for="name">Name (z. B. „Kniebeugung“)</label>
        <input id="name" bind:value={neuerName} />
  <div class="sheet-aktionen"><button on:click={reiheAnlegen} disabled={!neuerName.trim()}>Anlegen</button></div>
{/snippet}
