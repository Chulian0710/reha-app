<script>
  import { onMount } from 'svelte';
  import { liveQuery } from 'dexie';
  import { db } from './db.js';
  import { kurz } from './datum.js';
  import { abhaken, vorschlagSaetze, istSatzBestwert, satzBestwertXp, zahl } from './training.js';
  import Video from './Video.svelte';
  import LineChart from './LineChart.svelte';
  import { zielePruefen } from './ziele.js';
  import { istAusdauer, streckeEinheit, zahl1 } from './ausdauer.js';

  export let eintrag; // Planeintrag mit .uebung und .erledigt
  export let datum;
  export let r; // XP-Regeln

  let zeilen = [];
  let geladen = false;
  let hinweis = '';

  // Ausdauer: Dauer (Minuten) und Strecke statt Gewicht und Wiederholungen
  const ausdauer = istAusdauer(eintrag.uebung);
  const einheit = streckeEinheit(eintrag.uebung);
  const leerZeile = (s = {}) => ({ id: s.id ?? null, gewicht: s.gewicht ?? '', wdh: s.wdh ?? '', dauer: s.dauer ?? '', strecke: s.strecke ?? '', fertig: !!s.fertig });

  onMount(async () => {
    const vorhanden = await db.saetze.where('[datum+planEintragId]').equals([datum, eintrag.id]).toArray();
    if (vorhanden.length) {
      zeilen = vorhanden.sort((a, b) => a.nr - b.nr).map(leerZeile);
    } else {
      zeilen = (await vorschlagSaetze(eintrag, datum)).map((s) => leerZeile({ ...s, id: null, fertig: false }));
    }
    geladen = true;
  });

  // Sätze werden erst gespeichert, wenn sie abgehakt oder nach dem Abhaken geändert werden.
  async function speichern(i) {
    const z = zeilen[i];
    const daten = {
      datum,
      planEintragId: eintrag.id,
      uebungId: eintrag.uebungId,
      nr: i + 1,
      gewicht: ausdauer ? null : zahl(z.gewicht),
      wdh: ausdauer ? null : zahl(z.wdh),
      dauer: ausdauer ? zahl(z.dauer) : null,
      strecke: ausdauer ? zahl(z.strecke) : null,
      fertig: z.fertig
    };
    if (z.id) await db.saetze.update(z.id, daten);
    else {
      z.id = await db.saetze.add(daten);
      zeilen = zeilen;
    }
  }

  async function umschalten(i) {
    zeilen[i].fertig = !zeilen[i].fertig;
    hinweis = '';
    await speichern(i);
    if (!zeilen[i].fertig) return;

    const feld = ausdauer ? 'strecke' : 'gewicht';
    if (eintrag.uebung && (await istSatzBestwert(eintrag.uebungId, zeilen[i].id, zahl(zeilen[i][feld]), feld))) {
      const neu = await satzBestwertXp(eintrag.uebung, zeilen[i].id, datum, r);
      const was = ausdauer ? 'Neue Bestleistung: so weit wie noch nie.' : 'Neuer persönlicher Bestwert.';
      hinweis = neu ? `${was} +${r.bestwertXp} XP` : `${was} Bonus-XP gab es diese Woche schon.`;
    }
    if (zeilen.every((z) => z.fertig) && !eintrag.erledigt) {
      await abhaken(eintrag, datum, r);
      hinweis = (hinweis ? hinweis + ' ' : '') + (ausdauer ? 'Geschafft, Übung abgehakt.' : 'Alle Sätze geschafft, Übung abgehakt.');
    }
    const ziele = await zielePruefen(datum);
    if (ziele.length) hinweis = (hinweis ? hinweis + ' ' : '') + `Ziel erreicht: ${ziele.join(', ')}! +${r.zielXp} XP`;
  }

  function geaendert(i) {
    if (zeilen[i].id) speichern(i);
  }

  function satzDazu() {
    const l = zeilen[zeilen.length - 1];
    zeilen = [...zeilen, leerZeile(l ? { ...l, id: null, fertig: false } : {})];
  }

  async function satzWeg() {
    const l = zeilen[zeilen.length - 1];
    if (!l) return;
    if (l.id) await db.saetze.delete(l.id);
    zeilen = zeilen.slice(0, -1);
  }

  // Verlauf: Kraft = schwerstes Gewicht je Tag, Ausdauer = Strecke je Tag (mehrere Einheiten zusammengezählt)
  const feldVerlauf = ausdauer ? 'strecke' : 'gewicht';
  const verlauf = liveQuery(async () => {
    const alle = (await db.saetze.where('uebungId').equals(eintrag.uebungId).toArray()).filter((s) => s.fertig && s[feldVerlauf] !== null && s[feldVerlauf] !== undefined);
    const proTag = {};
    for (const s of alle) proTag[s.datum] = ausdauer ? (proTag[s.datum] ?? 0) + s.strecke : Math.max(proTag[s.datum] ?? -Infinity, s.gewicht);
    return Object.entries(proTag).sort(([a], [b]) => a.localeCompare(b)).map(([d, wert]) => ({ datum: d, wert }));
  });
  $: serien = $verlauf && $verlauf.length > 1 ? [{ name: ausdauer ? 'Strecke' : 'Schwerster Satz', farbe: '#00897b', punkte: $verlauf }] : [];
</script>

<div class="training">
  {#if eintrag.notiz}<p class="hinweis" style="margin-top: 0"><strong>Anmerkung:</strong> {eintrag.notiz}</p>{/if}
  {#if eintrag.uebung?.video}
    <Video url={eintrag.uebung.video} />
  {/if}

  {#if geladen}
    <div class="satz satz-kopf muted" aria-hidden="true">
      {#if ausdauer}<span>{zeilen.length > 1 ? 'Teil' : ''}</span><span>Min</span><span>{einheit}</span><span></span>
      {:else}<span>Satz</span><span>kg</span><span>Wdh.</span><span></span>{/if}
    </div>
    {#each zeilen as z, i}
      <div class="satz" class:fertig={z.fertig}>
        <span class="satz-nr">{ausdauer && zeilen.length === 1 ? '' : i + 1}</span>
        {#if ausdauer}
          <input aria-label="Dauer {zeilen.length > 1 ? `Teil ${i + 1} ` : ''}in Minuten" inputmode="decimal" placeholder="–" bind:value={z.dauer} on:change={() => geaendert(i)} />
          <input aria-label="Strecke {zeilen.length > 1 ? `Teil ${i + 1} ` : ''}in {einheit === 'm' ? 'Metern' : 'Kilometern'}" inputmode="decimal" placeholder="–" bind:value={z.strecke} on:change={() => geaendert(i)} />
        {:else}
          <input aria-label="Gewicht Satz {i + 1} in kg" inputmode="decimal" placeholder="–" bind:value={z.gewicht} on:change={() => geaendert(i)} />
          <input aria-label="Wiederholungen Satz {i + 1}" inputmode="numeric" placeholder="–" bind:value={z.wdh} on:change={() => geaendert(i)} />
        {/if}
        <button class:sek={!z.fertig} aria-pressed={z.fertig} aria-label="{ausdauer ? 'Einheit' : 'Satz'} {i + 1} {z.fertig ? 'erledigt' : 'abhaken'}" on:click={() => umschalten(i)}>✓</button>
      </div>
    {/each}
    <div class="row" style="margin-top: 8px">
      <button class="sek klein" on:click={satzDazu}>{ausdauer ? '+ Teil' : '+ Satz'}</button>
      <button class="sek klein" on:click={satzWeg} disabled={zeilen.length === 0}>{ausdauer ? '– Teil' : '– Satz'}</button>
    </div>
    <p class="muted" style="margin: 6px 0 0">
      {#if ausdauer}Trag ein, wie lange und wie weit du warst, und hake ab. Beides ist freiwillig. Mehrere Teile (z. B. hin und zurück) werden zusammengezählt.
      {:else}Vorgeschlagen sind die Werte vom letzten Training. Gewicht leer lassen bei Übungen ohne Gewicht.{/if}
    </p>
    {#if hinweis}<p class="hinweis">{hinweis}</p>{/if}

    {#if serien.length}
      <div style="margin-top: 10px">
        <span class="feldname">Verlauf</span>
        <LineChart series={serien} einheit={ausdauer ? einheit : 'kg'} hoehe={140} />
      </div>
    {:else if $verlauf && $verlauf.length === 1}
      <p class="muted">Bisher: {kurz($verlauf[0].datum)}, {ausdauer ? `${zahl1($verlauf[0].wert)} ${einheit}` : `schwerster Satz ${String($verlauf[0].wert).replace('.', ',')} kg`}</p>
    {/if}
  {/if}
</div>
