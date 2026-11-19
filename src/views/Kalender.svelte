<script>
  import { liveQuery } from 'dexie';
  import { db } from '../lib/db.js';
  import { iso, heute, wochentag, anzeige, parse, TAGE } from '../lib/datum.js';
  import { planAusListe, tagesplan, eintragText } from '../lib/plan.js';
  import { satzText, zahl } from '../lib/training.js';
  import { gehe } from '../lib/nav.js';
  import { loeschenMitUndo } from '../lib/toast.js';
  import Sheet from '../lib/Sheet.svelte';
  import SwipeRow from '../lib/SwipeRow.svelte';

  export let params = {};

  const h = heute();
  let auswahl = params.datum ?? h;
  let jahr = parse(auswahl).getFullYear();
  let monat = parse(auswahl).getMonth();

  // Status je Tag: alles | teil | nichts | geplant | ruhe | ruhe-ok
  async function ladeMonat(j, m) {
    const tage = new Date(j, m + 1, 0).getDate();
    const von = iso(new Date(j, m, 1));
    const bis = iso(new Date(j, m, tage));
    const plaene = await db.plaene.toArray();
    const eintraege = await db.planEintraege.toArray();
    const erledigt = await db.erledigt.where('datum').between(von, bis, true, true).toArray();
    const ruhe = new Set((await db.xpLog.where('ref').startsWith('ruhetag:').toArray()).map((r) => r.datum));
    const termine = new Set((await db.termine.where('datum').between(von, bis, true, true).toArray()).map((t) => t.datum));
    const status = {};
    for (let t = 1; t <= tage; t++) {
      const ds = iso(new Date(j, m, t));
      const plan = planAusListe(plaene, ds);
      const geplant = eintraege.filter((e) => e.datum === ds || (plan && e.planId === plan.id && e.wochentag === wochentag(ds)));
      if (!plan && !geplant.length) continue;
      if (!geplant.length) {
        status[ds] = ruhe.has(ds) ? 'ruhe-ok' : 'ruhe';
        continue;
      }
      const ids = new Set(geplant.map((e) => e.id));
      const n = erledigt.filter((e) => e.datum === ds && ids.has(e.planEintragId)).length;
      if (n === geplant.length) status[ds] = 'alles';
      else if (n > 0) status[ds] = 'teil';
      else status[ds] = ds < h ? 'nichts' : 'geplant';
    }
    return { status, termine };
  }

  async function ladeTag(ds) {
    const tp = await tagesplan(ds);
    const werte = await db.werte.where('datum').equals(ds).toArray();
    const reihen = await db.reihen.bulkGet(werte.map((w) => w.reiheId));
    const tagebuch = await db.tagebuch.where('datum').equals(ds).toArray();
    const log = await db.xpLog.where('datum').equals(ds).toArray();
    const saetze = (await db.saetze.where('datum').equals(ds).toArray()).filter((s) => s.fertig).sort((a, b) => a.nr - b.nr);
    return {
      tp,
      saetze,
      werte: werte.map((w, i) => ({ ...w, reihe: reihen[i] })),
      tagebuch,
      xp: log.reduce((s, e) => s + e.punkte, 0),
      ruheEingetragen: log.some((e) => e.ref === `ruhetag:${ds}`),
      physio: log.some((e) => e.ref === `physio:${ds}`)
    };
  }

  $: monatDaten = liveQuery(() => ladeMonat(jahr, monat));
  $: st = $monatDaten ? $monatDaten.status : {};
  $: termintage = $monatDaten ? $monatDaten.termine : new Set();
  $: tag = liveQuery(() => ladeTag(auswahl));

  $: monatsName = new Date(jahr, monat, 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  $: zellen = (() => {
    const leer = wochentag(iso(new Date(jahr, monat, 1))) - 1;
    const tage = new Date(jahr, monat + 1, 0).getDate();
    const z = Array(leer).fill(null);
    for (let t = 1; t <= tage; t++) z.push({ t, ds: iso(new Date(jahr, monat, t)) });
    return z;
  })();

  function blaettern(schritt) {
    const d = new Date(jahr, monat + schritt, 1);
    jahr = d.getFullYear();
    monat = d.getMonth();
  }

  // Termin eintragen
  let zeigeTermin = false;
  let tTitel = '';
  let tZeit = '';
  let tNotiz = '';
  let tPhysio = false; // Physio-Termine kann man am Tag selbst abhaken (XP, Abzeichen)
  async function terminSpeichern() {
    if (!tTitel.trim()) return;
    await db.termine.add({ datum: auswahl, zeit: tZeit || null, titel: tTitel.trim(), notiz: tNotiz.trim() || null, art: tPhysio ? 'physio' : null });
    tTitel = '';
    tZeit = '';
    tNotiz = '';
    tPhysio = false;
    zeigeTermin = false;
  }
  async function terminLoeschen(t) {
    await loeschenMitUndo(`Termin „${t.titel}“ gelöscht`, [{ tabelle: 'termine', ids: [t.id] }]);
  }

  // eingeplante Zusatzübung bearbeiten
  let bearbeitId = null;
  let f = {};
  function bearbeiten(e) {
    bearbeitId = e.id;
    f = { saetze: e.saetze ?? '', wdh: e.wdh ?? '', gewicht: e.gewicht ?? '', notiz: e.notiz ?? '' };
  }
  async function extraSpeichern() {
    await db.planEintraege.update(bearbeitId, {
      saetze: zahl(f.saetze),
      wdh: zahl(f.wdh),
      gewicht: zahl(f.gewicht),
      notiz: String(f.notiz).trim() || null
    });
    bearbeitId = null;
  }
  async function extraEntfernen(e) {
    const saetze = await db.saetze.where('planEintragId').equals(e.id).primaryKeys();
    await loeschenMitUndo(`„${e.uebung?.name ?? 'Übung'}“ nicht mehr eingeplant`, [
      { tabelle: 'planEintraege', ids: [e.id] },
      { tabelle: 'saetze', ids: saetze }
    ]);
  }

  // Monat wechseln durch Wischen über den Kalender
  let wischStart = null;
  function wischAn(ev) {
    if (ev.pointerType === 'mouse') return;
    wischStart = { x: ev.clientX, y: ev.clientY };
  }
  function wischAus(ev) {
    if (!wischStart) return;
    const dx = ev.clientX - wischStart.x;
    const dy = ev.clientY - wischStart.y;
    wischStart = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) blaettern(dx < 0 ? 1 : -1);
  }

  // Laptop: Pfeiltasten wählen Tage, Bild auf/ab blättert Monate
  function taste(ev) {
    if (ev.defaultPrevented || ev.target.closest?.('input, textarea, select, .sheet')) return;
    const schritte = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[ev.key];
    if (schritte) {
      const d = parse(auswahl);
      d.setDate(d.getDate() + schritte);
      waehle(iso(d));
      jahr = d.getFullYear();
      monat = d.getMonth();
      ev.preventDefault();
    } else if (ev.key === 'PageUp' || ev.key === 'PageDown') {
      blaettern(ev.key === 'PageUp' ? -1 : 1);
      ev.preventDefault();
    }
  }

  function waehle(ds) {
    auswahl = ds;
    zeigeTermin = false;
    bearbeitId = null;
  }

  const statusText = {
    alles: 'alles erledigt',
    teil: 'teilweise erledigt',
    nichts: 'nichts erledigt',
    geplant: 'geplant',
    ruhe: 'Ruhetag',
    'ruhe-ok': 'Ruhetag eingetragen'
  };
</script>

<svelte:window on:keydown={taste} />

<h1>Kalender</h1>

<div class="kal-layout">
<div>

<div class="row" style="justify-content: space-between">
  <button class="sek rund" aria-label="Vorheriger Monat" on:click={() => blaettern(-1)}>‹</button>
  <strong>{monatsName}</strong>
  <button class="sek rund" aria-label="Nächster Monat" on:click={() => blaettern(1)}>›</button>
</div>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="card kal-karte" style="margin-top: 12px; padding: 10px" on:pointerdown={wischAn} on:pointerup={wischAus} on:pointercancel={() => (wischStart = null)}>
  <div class="kal">
    {#each TAGE as t}<span class="kal-kopf">{t}</span>{/each}
    {#each zellen as z}
      {#if z}
        <button
          class="kal-tag"
          class:gewaehlt={z.ds === auswahl}
          class:heute={z.ds === h}
          aria-label="{z.t}. {st[z.ds] ? statusText[st[z.ds]] : ''}{termintage.has(z.ds) ? ', Termin' : ''}"
          on:click={() => waehle(z.ds)}
        >
          <span>{z.t}</span>
          {#if termintage.has(z.ds)}<span class="kal-termin" aria-hidden="true"></span>{/if}
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            {#if st[z.ds] === 'alles'}<circle cx="6" cy="6" r="5" fill="var(--accent)" />
            {:else if st[z.ds] === 'teil'}<circle cx="6" cy="6" r="4.5" fill="none" stroke="var(--accent)" stroke-width="1.5" /><path d="M6 1.5a4.5 4.5 0 010 9z" fill="var(--accent)" />
            {:else if st[z.ds] === 'nichts'}<path d="M3 6h6" stroke="var(--muted)" stroke-width="1.8" stroke-linecap="round" />
            {:else if st[z.ds] === 'geplant'}<circle cx="6" cy="6" r="3.5" fill="none" stroke="var(--muted)" stroke-width="1.5" />
            {:else if st[z.ds] === 'ruhe-ok'}<rect x="2" y="2" width="8" height="8" rx="2" fill="var(--accent)" />
            {:else if st[z.ds] === 'ruhe'}<rect x="2.5" y="2.5" width="7" height="7" rx="2" fill="none" stroke="var(--muted)" stroke-width="1.3" />
            {/if}
          </svg>
        </button>
      {:else}
        <span></span>
      {/if}
    {/each}
  </div>
  <div class="legende muted">
    <span><svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="var(--accent)" /></svg> alles</span>
    <span><svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="4.5" fill="none" stroke="var(--accent)" stroke-width="1.5" /><path d="M6 1.5a4.5 4.5 0 010 9z" fill="var(--accent)" /></svg> teilweise</span>
    <span><svg width="12" height="12" aria-hidden="true"><path d="M3 6h6" stroke="var(--muted)" stroke-width="1.8" stroke-linecap="round" /></svg> nichts</span>
    <span><svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="3.5" fill="none" stroke="var(--muted)" stroke-width="1.5" /></svg> geplant</span>
    <span><svg width="12" height="12" aria-hidden="true"><rect x="2" y="2" width="8" height="8" rx="2" fill="var(--accent)" /></svg> Ruhetag</span>
    <span><svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="3" fill="var(--warn)" /></svg> Termin</span>
  </div>
</div>

</div>
<div>
<h2>{anzeige(auswahl)}</h2>
{#if $tag}
  {#if $tag.tp.termine.length}
    <div class="card">
      {#each $tag.tp.termine as t (t.id)}
        <SwipeRow aktionen={[{ label: 'Löschen', art: 'loeschen', aktion: () => terminLoeschen(t) }]}>
          <div class="zeile">
            <span class="zeile-text"><strong>{t.zeit ? `${t.zeit} · ` : ''}{t.titel}</strong>{#if t.art === 'physio'}<span class="marke neu">Physio{$tag.physio ? ' ✓' : ''}</span>{/if}{#if t.notiz}<br /><span class="muted">{t.notiz}</span>{/if}</span>
          </div>
        </SwipeRow>
      {/each}
    </div>
  {/if}

  {#if $tag.physio && !$tag.tp.termine.some((t) => t.art === 'physio')}
    <p class="hinweis">Physiotherapie besucht ✓</p>
  {/if}

  <div class="card">
    {#if $tag.tp.eintraege.length === 0}
      <p class="muted" style="margin: 0">{$tag.tp.ruhetag ? `Ruhetag${$tag.ruheEingetragen ? ' · eingetragen' : ''}` : $tag.tp.plan ? 'Keine Übungen.' : 'Kein Plan an diesem Tag.'}</p>
    {:else}
      <p class="muted" style="margin: 0 0 4px">
        {$tag.tp.eintraege.filter((e) => e.erledigt).length} von {$tag.tp.eintraege.length} Übungen erledigt
      </p>
      {#each $tag.tp.eintraege as e (e.id)}
        <SwipeRow
          aktionen={e.extra && !e.erledigt && auswahl >= h
            ? [
                { label: 'Löschen', art: 'loeschen', aktion: () => extraEntfernen(e) },
                { label: 'Ändern', art: 'neutral', aktion: () => bearbeiten(e) }
              ]
            : []}
        >
          <div class="zeile">
            <span class="zeile-text">
              {e.uebung?.name ?? 'Übung'}<br />
              <span class="muted">
                {e.extra ? 'eingeplant · ' : ''}{$tag.saetze.some((s) => s.planEintragId === e.id)
                  ? $tag.saetze.filter((s) => s.planEintragId === e.id).map(satzText).join(' · ')
                  : eintragText(e)}
              </span>
              {#if e.extra && e.notiz}<br /><span class="muted">{e.notiz}</span>{/if}
            </span>
            {#if !(e.extra && !e.erledigt && auswahl >= h)}
              <span class="muted">{e.erledigt ? 'erledigt' : auswahl > h ? 'geplant' : auswahl === h ? 'offen' : 'nicht gemacht'}</span>
            {/if}
          </div>
        </SwipeRow>
      {/each}
    {/if}

    {#if $tag.werte.length || $tag.tagebuch.length || $tag.xp}
      <div style="border-top: 1px solid var(--line); margin-top: 8px; padding-top: 10px; line-height: 1.5">
        {#each $tag.werte as w (w.id)}
          <div><strong>Messwert:</strong> {w.reihe?.name ?? ''} {w.seite === 'L' ? 'links' : w.seite === 'R' ? 'rechts' : ''} {String(w.wert).replace('.', ',')} {w.reihe?.einheit ?? ''}</div>
        {/each}
        {#each $tag.tagebuch as t (t.id)}
          <div><strong>Tagebuch:</strong> {t.text}</div>
        {/each}
        {#if $tag.xp}<div><strong>XP:</strong> +{$tag.xp}</div>{/if}
      </div>
    {/if}
  </div>

  <div class="row" style="flex-wrap: nowrap">
    {#if auswahl >= h}
      <button style="flex: 1" on:click={() => gehe('uebungen', { datum: auswahl })}>Übung einplanen</button>
    {/if}
    <button class="sek" style="flex: 1" on:click={() => (zeigeTermin = true)}>Termin eintragen</button>
  </div>
  {#if auswahl <= h}
    <button class="link" style="margin-top: 10px" on:click={() => gehe('heute', { datum: auswahl })}>Diesen Tag öffnen (abhaken, Tagebuch)</button>
  {/if}
{/if}
</div>
</div>

<Sheet offen={zeigeTermin} titel="Termin" onclose={() => (zeigeTermin = false)}>
  <p class="muted" style="margin: 10px 0 0">{anzeige(auswahl)}</p>
  <label for="ttitel">Was? (z. B. „Physio“, „Arzt“)</label>
  <input id="ttitel" bind:value={tTitel} on:input={() => /physio/i.test(tTitel) && (tPhysio = true)} />
  <span class="feldname">Art</span>
  <div class="chips" role="group" aria-label="Art des Termins">
    <button class="chip" class:an={tPhysio} aria-pressed={tPhysio} on:click={() => (tPhysio = true)}>Physiotherapie</button>
    <button class="chip" class:an={!tPhysio} aria-pressed={!tPhysio} on:click={() => (tPhysio = false)}>Anderer Termin</button>
  </div>
  {#if tPhysio}<p class="muted" style="margin: 6px 0 0">Am Tag selbst kannst du den Besuch auf „Heute“ abhaken und bekommst XP dafür.</p>{/if}
  <label for="tzeit">Uhrzeit (optional)</label>
  <input id="tzeit" type="time" bind:value={tZeit} />
  <label for="tnotiz">Notiz (optional)</label>
  <input id="tnotiz" bind:value={tNotiz} />
  <div class="sheet-aktionen"><button on:click={terminSpeichern} disabled={!tTitel.trim()}>Termin speichern</button></div>
</Sheet>

<Sheet offen={bearbeitId !== null} titel="Übung ändern" onclose={() => (bearbeitId = null)}>
  {#if bearbeitId !== null}
    <div class="row" style="flex-wrap: nowrap">
      <div style="flex: 1; min-width: 0"><label for="ks">Sätze</label><input id="ks" inputmode="numeric" bind:value={f.saetze} /></div>
      <div style="flex: 1; min-width: 0"><label for="kw">Wdh.</label><input id="kw" inputmode="numeric" bind:value={f.wdh} /></div>
      <div style="flex: 1; min-width: 0"><label for="kg">kg</label><input id="kg" inputmode="decimal" bind:value={f.gewicht} /></div>
    </div>
    <label for="kn">Anmerkung</label>
    <input id="kn" bind:value={f.notiz} />
    <div class="sheet-aktionen"><button on:click={extraSpeichern}>Speichern</button></div>
  {/if}
</Sheet>
