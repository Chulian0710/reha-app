<script>
  import { onMount } from 'svelte';
  import { liveQuery } from 'dexie';
  import { db, heute } from '../lib/db.js';
  import { iso, parse, kurz, wochentag, TAGE } from '../lib/datum.js';
  import { levelInfo, schwellen, punktestand } from '../lib/xp.js';
  import { statistik, erreicht as abzErreicht, bedingungText, fortschrittText } from '../lib/abzeichen.js';
  import { zieleMitStand, zielePruefen, umfangReihen, UMFANG_STELLEN, zahlText } from '../lib/ziele.js';
  import { gehe } from '../lib/nav.js';
  import LineChart from '../lib/LineChart.svelte';
  import Medaille from '../lib/Medaille.svelte';
  import { istAusdauer, streckeEinheit, zahl1 } from '../lib/ausdauer.js';
  import { schmerzJeTag, gleitend, trainingsInfo, VERGLEICHE, vergleichen, fazit, trend, komma, schmerzFarbe, MIN_TAGE } from '../lib/schmerz.js';

  const h = heute();
  const LINKS = '#00897b';
  const RECHTS = '#c4561a';
  const WOCHEN = 16;

  onMount(() => zielePruefen());

  const daten = liveQuery(async () => {
    const stand = await punktestand();
    const erledigt = await db.erledigt.toArray();
    const alleSaetze = (await db.saetze.toArray()).filter((s) => s.fertig);
    const saetze = alleSaetze.filter((s) => s.gewicht !== null && s.gewicht !== undefined);
    const ausdauerSaetze = alleSaetze.filter((s) => (s.strecke ?? null) !== null || (s.dauer ?? null) !== null);
    const uebungen = await db.uebungen.toArray();
    const reihen = (await db.reihen.toArray()).filter((r) => r.typ !== 'kraft');
    const werte = await db.werte.toArray();
    return {
      stand,
      level: levelInfo(stand.verdient, await schwellen()),
      erledigt,
      saetze,
      ausdauerSaetze,
      uebungen,
      reihen,
      werte,
      schmerz: schmerzJeTag(await db.tagebuch.toArray()),
      trainingsInfo: await trainingsInfo(),
      ziele: await zieleMitStand(),
      abzeichen: await db.abzeichen.toArray(),
      stat: await statistik()
    };
  });
  $: d = $daten;

  // --- Trainingstage als Wochenraster ---
  $: proTag = d ? d.erledigt.reduce((m, e) => ((m[e.datum] = (m[e.datum] || 0) + 1), m), {}) : {};
  $: raster = (() => {
    const ende = parse(h);
    ende.setDate(ende.getDate() + (7 - wochentag(h))); // Sonntag dieser Woche
    const start = new Date(ende);
    start.setDate(start.getDate() - WOCHEN * 7 + 1);
    const wochen = [];
    for (let w = 0; w < WOCHEN; w++) {
      const tage = [];
      for (let t = 0; t < 7; t++) {
        const dt = new Date(start);
        dt.setDate(start.getDate() + w * 7 + t);
        const ds = iso(dt);
        tage.push({ ds, n: proTag[ds] || 0, zukunft: ds > h });
      }
      wochen.push(tage);
    }
    return wochen;
  })();
  $: tageImRaster = raster.flat().filter((t) => t.n > 0).length;
  const stufe = (n) => (n === 0 ? 0 : n <= 1 ? 1 : n <= 3 ? 2 : n <= 5 ? 3 : 4);
  const STUFEN = ['var(--leer)', '#cde8e3', '#86c9bf', '#2f9f91', '#00695e'];
  let rasterAktiv = null;

  // Serie: Tage am Stück mit Training (heute zählt, wenn schon trainiert)
  $: serie = (() => {
    let n = 0;
    const dt = parse(h);
    if (!proTag[h]) dt.setDate(dt.getDate() - 1);
    while (proTag[iso(dt)]) {
      n++;
      dt.setDate(dt.getDate() - 1);
    }
    return n;
  })();

  // --- Kraft aus den Trainingssätzen ---
  $: kraft = (() => {
    if (!d) return [];
    const je = {};
    for (const s of d.saetze) {
      const k = (je[s.uebungId] ||= { tage: {}, best: null });
      k.tage[s.datum] = Math.max(k.tage[s.datum] ?? -Infinity, s.gewicht);
      if (!k.best || s.gewicht > k.best.gewicht || (s.gewicht === k.best.gewicht && (s.wdh ?? 0) > (k.best.wdh ?? 0))) k.best = s;
    }
    return Object.entries(je)
      .map(([id, k]) => {
        const u = d.uebungen.find((x) => x.id === Number(id));
        const punkte = Object.entries(k.tage).map(([datum, wert]) => ({ datum, wert })).sort((a, b) => a.datum.localeCompare(b.datum));
        return { id: Number(id), name: u?.name ?? 'Übung', punkte, best: k.best };
      })
      .sort((a, b) => b.best.datum.localeCompare(a.best.datum) || a.name.localeCompare(b.name, 'de'));
  })();

  let kraftId = null;
  $: if (kraft.length && !kraft.some((k) => k.id === kraftId)) kraftId = kraft[0].id;
  $: kraftAuswahl = kraft.find((k) => k.id === kraftId);

  let zeitraum = 'alles';
  const ZEITRAEUME = [['4w', '4 Wochen', 28], ['3m', '3 Monate', 91], ['alles', 'Alles', null]];
  function abDatumFuer(z) {
    const tage = ZEITRAEUME.find((x) => x[0] === z)[2];
    if (!tage) return '';
    const dt = parse(h);
    dt.setDate(dt.getDate() - tage);
    return iso(dt);
  }
  $: abDatum = abDatumFuer(zeitraum);
  $: kraftPunkte = kraftAuswahl ? kraftAuswahl.punkte.filter((p) => p.datum >= abDatum) : [];
  $: kraftStart = kraftPunkte[0];
  $: kraftJetzt = kraftPunkte[kraftPunkte.length - 1];
  $: kraftPlus = kraftStart && kraftJetzt && kraftStart.wert > 0 ? Math.round(((kraftJetzt.wert - kraftStart.wert) / kraftStart.wert) * 100) : null;

  // --- Schmerz aus dem Tagebuch ---
  const SCHMERZ = '#c4561a';
  let schmerzZeitraum = '3m';
  let schmerzVergleichId = 'training';
  $: schmerzAb = abDatumFuer(schmerzZeitraum);
  $: schmerzAlle = d ? d.schmerz : [];
  // Der 7-Tage-Schnitt nutzt auch Werte vor dem Zeitraum, damit er am Anfang nicht springt
  $: schmerzSchnitt = gleitend(schmerzAlle).filter((p) => p.datum >= schmerzAb);
  $: schmerzPunkte = schmerzAlle.filter((p) => p.datum >= schmerzAb);
  $: schmerzTrend = trend(schmerzPunkte);
  $: schmerzLetzt = schmerzPunkte[schmerzPunkte.length - 1];
  $: schmerzTraining = d ? [...d.trainingsInfo.training] : [];
  $: schmerzVergleich = VERGLEICHE.find((v) => v.id === schmerzVergleichId);
  $: schmerzGruppen = d ? vergleichen(schmerzPunkte, d.trainingsInfo, schmerzVergleich) : [];
  $: schmerzFazit = schmerzGruppen.length ? fazit(schmerzGruppen) : null;
  const vorzeichen = (v) => (Math.round(v * 10) === 0 ? '±0' : (v > 0 ? '+' : '−') + komma(Math.abs(v)));

  // --- Ausdauer: Strecke und Dauer je Tag ---
  $: ausdauer = (() => {
    if (!d) return [];
    const je = {};
    for (const s of d.ausdauerSaetze) {
      const a = (je[s.uebungId] ||= { tage: {} });
      const t = (a.tage[s.datum] ||= { strecke: 0, dauer: 0 });
      t.strecke += s.strecke ?? 0;
      t.dauer += s.dauer ?? 0;
    }
    return Object.entries(je)
      .map(([id, a]) => {
        const u = d.uebungen.find((x) => x.id === Number(id));
        const tage = Object.entries(a.tage).map(([datum, t]) => ({ datum, ...t })).sort((x, y) => x.datum.localeCompare(y.datum));
        return {
          id: Number(id),
          name: u?.name ?? 'Übung',
          einheit: streckeEinheit(u),
          tage,
          gesamt: tage.reduce((s, t) => s + t.strecke, 0),
          minuten: tage.reduce((s, t) => s + t.dauer, 0),
          weiteste: Math.max(...tage.map((t) => t.strecke)),
          letzte: tage[tage.length - 1].datum
        };
      })
      .filter((a) => istAusdauer(d.uebungen.find((x) => x.id === a.id)) || a.gesamt || a.minuten)
      .sort((a, b) => b.letzte.localeCompare(a.letzte));
  })();
  let ausdauerId = null;
  $: if (ausdauer.length && !ausdauer.some((a) => a.id === ausdauerId)) ausdauerId = ausdauer[0].id;
  $: ausdauerWahl = ausdauer.find((a) => a.id === ausdauerId);
  const stunden = (min) => (min >= 60 ? `${Math.floor(min / 60)} h ${Math.round(min % 60)} min` : `${Math.round(min)} min`);

  function kraftZeigen(id) {
    kraftId = id;
    document.getElementById('kraft')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // --- Ausgangssituation vs. letzte Messung ---
  let stellen = [];
  onMount(async () => (stellen = await umfangReihen()));
  $: vergleich = (() => {
    if (!d) return [];
    const rang = (r) => {
      if (r.typ !== 'umfang') return 100;
      const i = UMFANG_STELLEN.findIndex((n) => n.toLowerCase() === r.name.toLowerCase());
      return i < 0 ? 50 : i;
    };
    return d.reihen
      .map((r) => {
        const w = d.werte.filter((x) => x.reiheId === r.id).sort((a, b) => a.datum.localeCompare(b.datum) || a.id - b.id);
        const seiten = [...new Set(w.map((x) => x.seite))].sort();
        const zeilen = seiten.map((s) => {
          const ws = w.filter((x) => x.seite === s);
          return { seite: s, erst: ws[0], letzt: ws[ws.length - 1], anzahl: ws.length };
        });
        return { ...r, werte: w, zeilen, rang: rang(r) };
      })
      .filter((r) => r.werte.length)
      .sort((a, b) => a.rang - b.rang || a.name.localeCompare(b.name, 'de'));
  })();
  $: letzteMessung = vergleich.length ? vergleich.flatMap((r) => r.werte.map((w) => w.datum)).sort().pop() : null;
  let offenReihe = null;
  function reiheSerien(r) {
    const seitig = r.zeilen.some((z) => z.seite !== '-');
    if (!seitig) return [{ name: r.name, farbe: LINKS, punkte: r.werte.map((w) => ({ datum: w.datum, wert: w.wert })) }];
    return [
      { name: 'Links', farbe: LINKS, punkte: r.werte.filter((w) => w.seite === 'L').map((w) => ({ datum: w.datum, wert: w.wert })) },
      { name: 'Rechts', farbe: RECHTS, gestrichelt: true, punkte: r.werte.filter((w) => w.seite === 'R').map((w) => ({ datum: w.datum, wert: w.wert })) }
    ];
  }
  const seiteText = (s) => (s === 'L' ? 'Links' : s === 'R' ? 'Rechts' : '');
  function delta(z) {
    const v = Math.round((z.letzt.wert - z.erst.wert) * 10) / 10;
    if (v === 0) return '±0';
    return (v > 0 ? '+' : '−') + zahlText(Math.abs(v));
  }

  // --- Ziele & Abzeichen ---
  $: zieleOffen = d ? d.ziele.filter((z) => !z.erreicht) : [];
  $: zieleErreicht = d ? d.ziele.filter((z) => z.erreicht) : [];
  // Antippen einer erreichten Medaille dreht sie einmal
  let dreh = {};
  const drehen = (a) => (dreh = { ...dreh, [a.id]: (dreh[a.id] || 0) + 1 });

  const neu = (ds) => {
    const dt = parse(h);
    dt.setDate(dt.getDate() - 7);
    return ds >= iso(dt);
  };
</script>

<h1>Fortschritt</h1>

{#if d}
  <!-- Kennzahlen -->
  <div class="kacheln">
    <div class="kachel">
      <span class="kachel-wert">{d.level.level}</span>
      <span class="kachel-name">Level</span>
      <div class="bar klein-bar" role="img" aria-label="{Math.round(d.level.fortschritt * 100)} Prozent bis zum nächsten Level"><div style="width: {Math.round(d.level.fortschritt * 100)}%"></div></div>
    </div>
    <div class="kachel">
      <span class="kachel-wert">{d.stat.trainingstage}</span>
      <span class="kachel-name">Trainingstage</span>
      <span class="muted kachel-extra">{serie ? `${serie} ${serie === 1 ? 'Tag' : 'Tage'} am Stück` : 'Serie startet beim nächsten Training'}</span>
    </div>
    <div class="kachel">
      <span class="kachel-wert">{kraft.length}</span>
      <span class="kachel-name">{kraft.length === 1 ? 'Übung' : 'Übungen'} mit Bestwert</span>
      <span class="muted kachel-extra">{d.stat.bestwerte} Bestwert-Boni</span>
    </div>
    <div class="kachel">
      <span class="kachel-wert">{zieleErreicht.length}<span class="kachel-von">/{d.ziele.length}</span></span>
      <span class="kachel-name">Ziele erreicht</span>
      <span class="muted kachel-extra">{d.stand.verdient} XP gesammelt</span>
    </div>
  </div>

  <div class="spalten">
  <div>
  <!-- Trainingstage -->
  <h2>Trainingstage</h2>
  <div class="card">
    <div class="raster-wrap">
      <div class="raster" style="--wochen: {WOCHEN}" role="group" aria-label="Trainingstage der letzten {WOCHEN} Wochen">
        {#each TAGE as t, i}<span class="raster-tag muted" style="grid-row: {i + 1}">{i % 2 === 0 ? t : ''}</span>{/each}
        {#each raster as woche, w}
          {#each woche as tag, t}
            <button
              class="raster-zelle"
              class:aktiv={rasterAktiv?.ds === tag.ds}
              class:heute-zelle={tag.ds === h}
              style="grid-column: {w + 2}; grid-row: {t + 1}; background: {tag.zukunft ? 'transparent' : STUFEN[stufe(tag.n)]}"
              disabled={tag.zukunft}
              aria-label="{kurz(tag.ds)}: {tag.n} {tag.n === 1 ? 'Übung' : 'Übungen'}"
              on:pointerenter={() => (rasterAktiv = tag)}
              on:focus={() => (rasterAktiv = tag)}
              on:click={() => (rasterAktiv = tag)}
            ></button>
          {/each}
        {/each}
      </div>
    </div>
    <div class="row" style="justify-content: space-between; margin-top: 10px">
      <span aria-live="polite">
        {#if rasterAktiv}
          <strong>{rasterAktiv.n}</strong> <span class="muted">{rasterAktiv.n === 1 ? 'Übung' : 'Übungen'} am {kurz(rasterAktiv.ds)}</span>
          {#if rasterAktiv.n}<button class="link" style="margin-left: 6px; min-height: 0" on:click={() => gehe('kalender', { datum: rasterAktiv.ds })}>ansehen</button>{/if}
        {:else}
          <strong>{tageImRaster}</strong> <span class="muted">Trainingstage in {WOCHEN} Wochen</span>
        {/if}
      </span>
      <span class="raster-legende muted" aria-hidden="true">
        weniger {#each STUFEN.slice(1) as c}<span style="background: {c}"></span>{/each} mehr
      </span>
    </div>
  </div>

  <!-- Schmerz -->
  <h2>Schmerz</h2>
  {#if !schmerzAlle.length}
    <div class="card">
      <p class="muted" style="margin-top: 0">Trag im Tagebuch ein, wie stark dein Schmerz ist (0–10). Hier siehst du dann, wie er sich entwickelt und ob Training oder Ruhe einen Unterschied machen.</p>
      <button class="sek" on:click={() => gehe('tagebuch')}>Zum Tagebuch</button>
    </div>
  {:else}
    <div class="card">
      <div class="chips" role="group" aria-label="Zeitraum" style="margin-bottom: 12px">
        {#each ZEITRAEUME as [id, label]}
          <button class="chip klein-chip" class:an={schmerzZeitraum === id} aria-pressed={schmerzZeitraum === id} on:click={() => (schmerzZeitraum = id)}>{label}</button>
        {/each}
      </div>
      {#if !schmerzPunkte.length}
        <p class="muted" style="margin: 0">In diesem Zeitraum kein Schmerzwert eingetragen.</p>
      {:else}
        <div class="mini-stats">
          {#if schmerzTrend}
            <div><span class="muted">Anfang</span><strong>Ø {komma(schmerzTrend.anfang)}</strong><span class="muted">erste {schmerzTrend.k} Tage</span></div>
            <div><span class="muted">Zuletzt</span><strong>Ø {komma(schmerzTrend.zuletzt)}</strong><span class="muted">letzte {schmerzTrend.k} Tage</span></div>
            <div><span class="muted">Veränderung</span><strong>{vorzeichen(schmerzTrend.diff)}</strong><span class="muted">Punkte</span></div>
          {:else}
            <div><span class="muted">Zuletzt</span><strong>{schmerzLetzt.wert}</strong><span class="muted">{kurz(schmerzLetzt.datum)}</span></div>
            <div><span class="muted">Höchster</span><strong>{Math.max(...schmerzPunkte.map((p) => p.wert))}</strong><span class="muted">im Zeitraum</span></div>
            <div><span class="muted">Einträge</span><strong>{schmerzPunkte.length}</strong><span class="muted">Trend ab 6</span></div>
          {/if}
        </div>
        <LineChart
          series={[
            { name: 'Tageswert', farbe: SCHMERZ, punkte: schmerzPunkte },
            { name: 'Ø 7 Tage', farbe: LINKS, gestrichelt: true, punkte: schmerzSchnitt }
          ]}
          min={0}
          max={10}
          markierungen={schmerzTraining}
          markierungName="Training"
        />
      {/if}
    </div>

    {#if schmerzPunkte.length}
      <div class="chips filter-zeile" role="group" aria-label="Vergleichen">
        {#each VERGLEICHE as v (v.id)}
          <button class="chip" class:an={schmerzVergleichId === v.id} aria-pressed={schmerzVergleichId === v.id} on:click={() => (schmerzVergleichId = v.id)}>{v.label}</button>
        {/each}
      </div>
      <div class="card" style="margin-top: 10px">
        {#each schmerzGruppen as g}
          <div class="schmerz-balken">
            <span>{g.name}</span>
            <span>{#if g.schnitt !== null}<strong>Ø {komma(g.schnitt)}</strong>{:else}–{/if} <span class="muted">· {g.n} {g.n === 1 ? 'Tag' : 'Tage'}</span></span>
            <div class="bar" role="img" aria-label="{g.name}: Durchschnitt {g.schnitt === null ? 'keiner' : komma(g.schnitt)} von 10">
              {#if g.schnitt !== null}<div style="width: {g.schnitt * 10}%; background: {schmerzFarbe(g.schnitt)}"></div>{/if}
            </div>
          </div>
        {/each}
        {#if schmerzFazit}
          <p class="hinweis" style="margin: 12px 0 0">{schmerzFazit}</p>
        {:else}
          <p class="muted" style="margin: 12px 0 0">Für einen Vergleich braucht es mindestens {MIN_TAGE} Tage mit Schmerzwert in jeder Gruppe.</p>
        {/if}
        {#if schmerzVergleich.hinweis}<p class="muted" style="margin: 8px 0 0; font-size: 0.8rem">{schmerzVergleich.hinweis}</p>{/if}
        <p class="muted" style="margin: 8px 0 0; font-size: 0.8rem">Verglichen werden nur Tage im gewählten Zeitraum.</p>
      </div>
    {/if}
  {/if}

  <!-- Kraft -->
  <h2 id="kraft">Kraftentwicklung</h2>
  {#if !kraft.length}
    <div class="card"><p class="muted" style="margin: 0">Sobald du im Training Sätze mit Gewicht abhakst, siehst du hier deine Kraft wachsen.</p></div>
  {:else}
    <div class="chips filter-zeile" role="group" aria-label="Übung">
      {#each kraft as k (k.id)}
        <button class="chip" class:an={kraftId === k.id} aria-pressed={kraftId === k.id} on:click={() => (kraftId = k.id)}>{k.name}</button>
      {/each}
    </div>
    <div class="card" style="margin-top: 10px">
      <div class="chips" role="group" aria-label="Zeitraum" style="margin-bottom: 12px">
        {#each ZEITRAEUME as [id, label]}
          <button class="chip klein-chip" class:an={zeitraum === id} aria-pressed={zeitraum === id} on:click={() => (zeitraum = id)}>{label}</button>
        {/each}
      </div>
      {#if kraftPunkte.length}
        <div class="mini-stats">
          <div><span class="muted">Start</span><strong>{zahlText(kraftStart.wert)} kg</strong><span class="muted">{kurz(kraftStart.datum)}</span></div>
          <div><span class="muted">Zuletzt</span><strong>{zahlText(kraftJetzt.wert)} kg</strong><span class="muted">{kurz(kraftJetzt.datum)}</span></div>
          <div><span class="muted">Veränderung</span><strong>{kraftPlus === null ? '–' : (kraftPlus > 0 ? '+' : '') + kraftPlus + ' %'}</strong><span class="muted">im Zeitraum</span></div>
        </div>
        <LineChart series={[{ name: 'Schwerster Satz', farbe: LINKS, punkte: kraftPunkte }]} einheit="kg" />
      {:else}
        <p class="muted" style="margin: 0">In diesem Zeitraum kein Training mit Gewicht.</p>
      {/if}
    </div>

    <h2>Bestwerte auf einen Blick</h2>
    <div class="card">
      {#each kraft as k (k.id)}
        <button class="menue bestwert" on:click={() => kraftZeigen(k.id)}>
          <span class="zeile-text">{k.name}<br /><span class="muted">{kurz(k.best.datum)}{neu(k.best.datum) ? ' · neu' : ''}</span></span>
          <span class="bestwert-zahl"><strong>{zahlText(k.best.gewicht)} kg</strong>{#if k.best.wdh}<span class="muted"> × {k.best.wdh}</span>{/if}</span>
        </button>
      {/each}
    </div>
  {/if}

  <!-- Ausdauer -->
  {#if ausdauer.length}
    <h2>Ausdauer</h2>
    {#if ausdauer.length > 1}
      <div class="chips filter-zeile" role="group" aria-label="Ausdauer-Übung">
        {#each ausdauer as a (a.id)}
          <button class="chip" class:an={ausdauerId === a.id} aria-pressed={ausdauerId === a.id} on:click={() => (ausdauerId = a.id)}>{a.name}</button>
        {/each}
      </div>
    {/if}
    {#if ausdauerWahl}
      <div class="card" style={ausdauer.length > 1 ? 'margin-top: 10px' : ''}>
        {#if ausdauer.length === 1}<strong style="display: block; margin-bottom: 10px">{ausdauerWahl.name}</strong>{/if}
        <div class="mini-stats">
          <div><span class="muted">Insgesamt</span><strong>{zahl1(ausdauerWahl.gesamt)} {ausdauerWahl.einheit}</strong><span class="muted">{ausdauerWahl.tage.length} {ausdauerWahl.tage.length === 1 ? 'Tag' : 'Tage'}</span></div>
          <div><span class="muted">Weiteste</span><strong>{zahl1(ausdauerWahl.weiteste)} {ausdauerWahl.einheit}</strong><span class="muted">an einem Tag</span></div>
          <div><span class="muted">Zeit</span><strong>{stunden(ausdauerWahl.minuten)}</strong><span class="muted">insgesamt</span></div>
        </div>
        {#if ausdauerWahl.tage.filter((t) => t.strecke > 0).length > 1}
          <LineChart series={[{ name: 'Strecke', farbe: LINKS, punkte: ausdauerWahl.tage.filter((t) => t.strecke > 0).map((t) => ({ datum: t.datum, wert: Math.round(t.strecke * 100) / 100 }))}]} einheit={ausdauerWahl.einheit} />
        {:else}
          <p class="muted" style="margin: 0">Ab der zweiten Einheit mit Strecke siehst du hier den Verlauf.</p>
        {/if}
      </div>
    {/if}
  {/if}

  </div>
  <div>
  <!-- Messwerte: Ausgangssituation vs. letzte Messung, Eintragen -->
  <h2>Messwerte</h2>
  {#if !vergleich.length}
    <div class="card">
      <p class="muted" style="margin-top: 0">Noch keine Messwerte. Miss am besten jetzt einmal Umfang an {stellen.map((s) => s.name).join(', ') || 'Wade und Oberschenkel'}: Das ist deine Ausgangssituation.</p>
      <button class="breit" on:click={() => gehe('messwerte')}>Erste Messung eintragen</button>
    </div>
  {:else}
    <div class="card">
      <p class="muted" style="margin: 0 0 4px">Ausgangssituation → letzte Messung</p>
      {#each vergleich as r (r.id)}
        <div class="vergleich">
          <button class="vergleich-kopf" aria-expanded={offenReihe === r.id} on:click={() => (offenReihe = offenReihe === r.id ? null : r.id)}>
            <strong>{r.name}</strong>
            <span class="muted">{offenReihe === r.id ? 'Verlauf schließen' : 'Verlauf'} {offenReihe === r.id ? '▴' : '▾'}</span>
          </button>
          {#each r.zeilen as z}
            <div class="vergleich-zeile">
              <span class="muted">{seiteText(z.seite) || 'Wert'}</span>
              <span>{zahlText(z.erst.wert)} <span class="muted">→</span> <strong>{zahlText(z.letzt.wert)}</strong> {r.einheit || ''}</span>
              <span class="delta">{z.anzahl > 1 ? delta(z) : 'erste Messung'}</span>
            </div>
          {/each}
          {#if r.zeilen.length && r.zeilen[0].anzahl > 1}
            <p class="muted" style="margin: 2px 0 0; font-size: 0.8rem">{kurz(r.zeilen[0].erst.datum)} bis {kurz(r.zeilen[0].letzt.datum)}</p>
          {/if}
          {#if offenReihe === r.id}
            <div style="margin-top: 10px"><LineChart series={reiheSerien(r)} einheit={r.einheit || ''} hoehe={150} /></div>
          {/if}
        </div>
      {/each}
      <div class="messung-fuss">
        <button class="breit" on:click={() => gehe('messwerte')}>Neue Messung eintragen</button>
        {#if letzteMessung}<p class="muted" style="margin: 6px 0 0; text-align: center">Zuletzt gemessen am {kurz(letzteMessung)}</p>{/if}
      </div>
    </div>
  {/if}

  <!-- Ziele -->
  <div class="row" style="justify-content: space-between; align-items: baseline">
    <h2>Ziele</h2>
    <button class="link" on:click={() => gehe('ziele')}>Alle Ziele</button>
  </div>
  <div class="card">
    {#if !d.ziele.length}
      <p class="muted" style="margin-top: 0">Noch keine Ziele.</p>
      <button class="sek" on:click={() => gehe('ziele')}>Ziel anlegen</button>
    {/if}
    {#each zieleOffen as z (z.id)}
      <div class="ziel-zeile">
        <div class="ziel-stand" style="margin: 0 0 6px">
          <span>{z.titel}</span>
          <span>
            {#if z.art === 'mess'}<strong>{zahlText(z.aktuell)}</strong><span class="muted">/{zahlText(z.ziel)} {z.einheit || ''} · {Math.round(z.anteil * 100)} %</span>
            {:else}<span class="muted">offen</span>{/if}
          </span>
        </div>
        <div class="bar" role="img" aria-label="{Math.round(z.anteil * 100)} Prozent erreicht"><div style="width: {Math.round(z.anteil * 100)}%"></div></div>
      </div>
    {/each}
    {#each zieleErreicht as z (z.id)}
      <div class="zeile" style="min-height: 44px">
        <span class="ziel-stern" aria-hidden="true">★</span>
        <span class="zeile-text">{z.titel}</span>
        <span class="muted">erreicht {kurz(z.erreicht)}</span>
      </div>
    {/each}
  </div>

  <!-- Abzeichen -->
  <h2>Abzeichen</h2>
  <div class="card">
    <div class="abzeichen">
      {#each d.abzeichen as a (a.id)}
        <div class="abz" class:offen={abzErreicht(a, d.stat)}>
          <button class="abz-knopf" disabled={!abzErreicht(a, d.stat)} aria-label="Medaille {a.name} drehen" on:click={() => drehen(a)}>
            {#key dreh[a.id]}<Medaille groesse={54} erreicht={abzErreicht(a, d.stat)} glanz animation={dreh[a.id] ? 'flip' : ''} />{/key}
          </button>
          <span>{a.name}</span>
          <span class="muted" style="font-size: 0.75rem">{abzErreicht(a, d.stat) ? 'erreicht' : `${bedingungText(a)} · ${fortschrittText(a, d.stat)}`}{#if a.gels}<br />{a.gels} Gels{/if}</span>
        </div>
      {/each}
    </div>
    {#if !d.abzeichen.length}<p class="muted" style="margin: 0">Noch keine Abzeichen angelegt.</p>{/if}
  </div>
  </div>
  </div>
{/if}
