<script>
  import { onMount } from 'svelte';
  import { liveQuery } from 'dexie';
  import { db } from './db.js';
  import { kurz } from './datum.js';
  import { abhaken, vorschlagSaetze, istSatzBestwert, satzBestwertXp, zahl } from './training.js';
  import Video from './Video.svelte';
  import LineChart from './LineChart.svelte';
  import { zielePruefen } from './ziele.js';

  export let eintrag; // Planeintrag mit .uebung und .erledigt
  export let datum;
  export let r; // XP-Regeln

  let zeilen = [];
  let geladen = false;
  let hinweis = '';

  onMount(async () => {
    const vorhanden = await db.saetze.where('[datum+planEintragId]').equals([datum, eintrag.id]).toArray();
    if (vorhanden.length) {
      zeilen = vorhanden.sort((a, b) => a.nr - b.nr).map((s) => ({ id: s.id, gewicht: s.gewicht ?? '', wdh: s.wdh ?? '', fertig: !!s.fertig }));
    } else {
      zeilen = (await vorschlagSaetze(eintrag, datum)).map((s) => ({ id: null, gewicht: s.gewicht ?? '', wdh: s.wdh ?? '', fertig: false }));
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
      gewicht: zahl(z.gewicht),
      wdh: zahl(z.wdh),
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

    if (eintrag.uebung && (await istSatzBestwert(eintrag.uebungId, zeilen[i].id, zahl(zeilen[i].gewicht)))) {
      const neu = await satzBestwertXp(eintrag.uebung, zeilen[i].id, datum, r);
      hinweis = neu ? `Neuer persönlicher Bestwert. +${r.bestwertXp} XP` : 'Neuer persönlicher Bestwert. Bonus-XP gab es diese Woche schon.';
    }
    if (zeilen.every((z) => z.fertig) && !eintrag.erledigt) {
      await abhaken(eintrag, datum, r);
      hinweis = (hinweis ? hinweis + ' ' : '') + 'Alle Sätze geschafft, Übung abgehakt.';
    }
    const ziele = await zielePruefen(datum);
    if (ziele.length) hinweis = (hinweis ? hinweis + ' ' : '') + `Ziel erreicht: ${ziele.join(', ')}! +${r.zielXp} XP`;
  }

  function geaendert(i) {
    if (zeilen[i].id) speichern(i);
  }

  function satzDazu() {
    const l = zeilen[zeilen.length - 1];
    zeilen = [...zeilen, { id: null, gewicht: l ? l.gewicht : '', wdh: l ? l.wdh : '', fertig: false }];
  }

  async function satzWeg() {
    const l = zeilen[zeilen.length - 1];
    if (!l) return;
    if (l.id) await db.saetze.delete(l.id);
    zeilen = zeilen.slice(0, -1);
  }

  // Verlauf: schwerstes erledigtes Gewicht je Trainingstag
  const verlauf = liveQuery(async () => {
    const alle = (await db.saetze.where('uebungId').equals(eintrag.uebungId).toArray()).filter((s) => s.fertig && s.gewicht !== null);
    const proTag = {};
    for (const s of alle) proTag[s.datum] = Math.max(proTag[s.datum] ?? -Infinity, s.gewicht);
    return Object.entries(proTag).map(([d, wert]) => ({ datum: d, wert }));
  });
  $: serien = $verlauf && $verlauf.length > 1 ? [{ name: 'Schwerster Satz', farbe: '#00897b', punkte: $verlauf }] : [];
</script>

<div class="training">
  {#if eintrag.notiz}<p class="hinweis" style="margin-top: 0"><strong>Anmerkung:</strong> {eintrag.notiz}</p>{/if}
  {#if eintrag.uebung?.video}
    <Video url={eintrag.uebung.video} />
  {/if}

  {#if geladen}
    <div class="satz satz-kopf muted" aria-hidden="true">
      <span>Satz</span><span>kg</span><span>Wdh.</span><span></span>
    </div>
    {#each zeilen as z, i}
      <div class="satz" class:fertig={z.fertig}>
        <span class="satz-nr">{i + 1}</span>
        <input aria-label="Gewicht Satz {i + 1} in kg" inputmode="decimal" placeholder="–" bind:value={z.gewicht} on:change={() => geaendert(i)} />
        <input aria-label="Wiederholungen Satz {i + 1}" inputmode="numeric" placeholder="–" bind:value={z.wdh} on:change={() => geaendert(i)} />
        <button class:sek={!z.fertig} aria-pressed={z.fertig} aria-label="Satz {i + 1} {z.fertig ? 'erledigt' : 'abhaken'}" on:click={() => umschalten(i)}>✓</button>
      </div>
    {/each}
    <div class="row" style="margin-top: 8px">
      <button class="sek klein" on:click={satzDazu}>+ Satz</button>
      <button class="sek klein" on:click={satzWeg} disabled={zeilen.length === 0}>– Satz</button>
    </div>
    <p class="muted" style="margin: 6px 0 0">Vorgeschlagen sind die Werte vom letzten Training. Gewicht leer lassen bei Übungen ohne Gewicht.</p>
    {#if hinweis}<p class="hinweis">{hinweis}</p>{/if}

    {#if serien.length}
      <div style="margin-top: 10px">
        <span class="feldname">Verlauf</span>
        <LineChart series={serien} einheit="kg" hoehe={140} />
      </div>
    {:else if $verlauf && $verlauf.length === 1}
      <p class="muted">Bisher: {kurz($verlauf[0].datum)}, schwerster Satz {String($verlauf[0].wert).replace('.', ',')} kg</p>
    {/if}
  {/if}
</div>
