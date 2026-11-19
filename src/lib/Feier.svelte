<script>
  // Feier-Overlay: erscheint bei neuem Level, neuem Abzeichen (jeweils mit den Gels dafür) oder freigeschaltetem Brief.
  // Gemerkt wird das höchste gefeierte Level und welche Briefe schon angekündigt wurden,
  // damit nach Abhaken/Zurücknehmen nichts doppelt gefeiert wird.
  import { liveQuery } from 'dexie';
  import { tick } from 'svelte';
  import { fade } from 'svelte/transition';
  import { db, getEinstellung, setEinstellung } from './db.js';
  import { statistik } from './abzeichen.js';
  import { gelsVergeben } from './gels.js';
  import Gel from './Gel.svelte';
  import Medaille from './Medaille.svelte';
  import { ansicht, sheetAuf, zurueck, istOberstesSheet } from './nav.js';
  import { alsGelesen } from './briefe.js';

  // Beobachtet alles, wovon Level, Abzeichen und Briefe abhängen
  const stand = liveQuery(async () => ({
    stat: await statistik(),
    abzeichen: await db.abzeichen.toArray(),
    briefe: await db.briefe.toArray()
  }));

  let feier = null; // { level: Zahl | null, levelGels, abzeichen: [{ name, gels }], briefe: [] }
  let phase = 'erfolg'; // 'erfolg' | 'umschlag' | 'lesen'
  let briefNr = 0;
  let offen = false; // Umschlag geöffnet
  let eintrag = null;
  let box;
  let konfetti = [];

  // Im Betreuer-Bereich nicht feiern (dort entstehen die Briefe), danach schon.
  $: if ($stand && $ansicht.seite !== 'betreuer' && !feier) pruefen($stand);

  let laeuft = false;
  let wartend = null;
  async function pruefen(s) {
    if (laeuft) {
      wartend = s;
      return;
    }
    laeuft = true;
    try {
      // Gels für Level und Abzeichen gutschreiben. Beim ersten Mal still (rückwirkend, ohne Feier).
      const ersteMal = !(await getEinstellung('gelsEingerichtet'));
      const { neu, stat } = await gelsVergeben();
      if (ersteMal) await setEinstellung('gelsEingerichtet', true);

      const level = stat.level;
      const gefeiert = await getEinstellung('gefeiertesLevel');
      const frei = s.briefe.filter((b) => level >= b.level);
      if (gefeiert === undefined) {
        // Erster Start mit dieser Funktion: aktuellen Stand übernehmen, ohne zu feiern
        await setEinstellung('gefeiertesLevel', level);
        await setEinstellung('briefeGezeigt', frei.map((b) => b.uid));
        if ((await getEinstellung('briefeGelesen')) === undefined) await setEinstellung('briefeGelesen', frei.map((b) => b.uid));
        return;
      }
      const gezeigt = (await getEinstellung('briefeGezeigt')) || [];
      const neueBriefe = frei.filter((b) => !gezeigt.includes(b.uid)).sort((a, b) => a.level - b.level);
      const neuesLevel = level > gefeiert ? level : null;
      const levelGels = neu.filter((g) => g.art === 'level' && g.level > gefeiert).reduce((x, g) => x + g.gels, 0);
      const neueAbzeichen = ersteMal ? [] : neu.filter((g) => g.art === 'abzeichen').map((g) => ({ name: g.name, gels: g.gels }));
      if (!neuesLevel && !neueAbzeichen.length && !neueBriefe.length) return;

      await setEinstellung('gefeiertesLevel', Math.max(gefeiert, level));
      await setEinstellung('briefeGezeigt', [...gezeigt, ...neueBriefe.map((b) => b.uid)]);
      starten({ level: neuesLevel, levelGels, abzeichen: neueAbzeichen, briefe: neueBriefe });
    } finally {
      laeuft = false;
      if (wartend && !feier) {
        const w = wartend;
        wartend = null;
        pruefen(w);
      }
    }
  }

  const FARBEN = ['#2f6f6a', '#86c9bf', '#e0a43a', '#c4561a', '#f2c94c', '#e98a8a'];
  async function starten(f) {
    feier = f;
    phase = f.level || f.abzeichen.length ? 'erfolg' : 'umschlag';
    briefNr = 0;
    offen = false;
    konfetti = Array.from({ length: 42 }, (_, i) => {
      const winkel = (i / 42) * Math.PI * 2 + Math.random() * 0.4;
      const weite = 90 + Math.random() * 140;
      return {
        x: Math.round(Math.cos(winkel) * weite),
        y: Math.round(Math.sin(winkel) * weite * 0.8 - 80),
        r: Math.round(Math.random() * 720 - 360),
        c: FARBEN[i % FARBEN.length],
        d: Math.round(Math.random() * 180),
        w: 6 + Math.round(Math.random() * 6),
        rund: i % 3 === 0
      };
    });
    eintrag = sheetAuf(() => {
      eintrag = null;
      feier = null;
    });
    try {
      navigator.vibrate?.([30, 60, 40]);
    } catch {
      // nicht wichtig
    }
    await tick();
    box?.querySelector('button')?.focus({ preventScroll: true });
  }

  function schliessen() {
    if (eintrag && istOberstesSheet(eintrag)) zurueck();
  }

  function taste(ev) {
    if (ev.key === 'Escape' && eintrag && istOberstesSheet(eintrag)) {
      ev.preventDefault();
      schliessen();
    }
  }

  $: brief = feier?.briefe[briefNr];
  $: gelsGesamt = feier ? feier.levelGels + feier.abzeichen.reduce((x, a) => x + a.gels, 0) : 0;
  const gelText = (n) => `+${n} ${n === 1 ? 'Gel' : 'Gels'}`;

  async function oeffnen() {
    offen = true;
    await alsGelesen(brief.uid);
    setTimeout(async () => {
      phase = 'lesen';
      await tick();
      box?.querySelector('button')?.focus({ preventScroll: true });
    }, 900);
  }

  function naechsterBrief() {
    briefNr++;
    offen = false;
    phase = 'umschlag';
  }
</script>

<svelte:window on:keydown={taste} />

{#if feier}
  <div class="feier" role="dialog" aria-modal="true" aria-labelledby="feier-titel" transition:fade={{ duration: 220 }}>
    {#if phase === 'erfolg'}
      <div class="konfetti" aria-hidden="true">
        {#each konfetti as k}
          <span
            class:rund={k.rund}
            style="--x: {k.x}px; --y: {k.y}px; --r: {k.r}deg; --c: {k.c}; --d: {k.d}ms; --w: {k.w}px"
          ></span>
        {/each}
      </div>
    {/if}

    <div class="feier-box" bind:this={box}>
      {#if phase === 'erfolg'}
        {#if feier.level}
          <div class="feier-medaille" aria-hidden="true">
            <span class="feier-strahlen"></span>
            <span class="feier-kreis"><small>Level</small>{feier.level}</span>
          </div>
          <h2 id="feier-titel" class="feier-titel">Level {feier.level} erreicht!</h2>
          <p class="feier-text">Stark! Jede Übung, jeder Ruhetag hat dich hierher gebracht.</p>
        {:else}
          <div class="feier-medaille feier-medaille-abz">
            <span class="feier-strahlen"></span>
            <Medaille groesse={118} animation="auftritt" />
          </div>
          <h2 id="feier-titel" class="feier-titel">{feier.abzeichen.length === 1 ? 'Neues Abzeichen!' : `${feier.abzeichen.length} neue Abzeichen!`}</h2>
        {/if}

        {#if feier.abzeichen.length}
          <ul class="feier-abzeichen">
            {#each feier.abzeichen as a}
              <li><Medaille groesse={30} /><span>{a.name}</span>{#if a.gels}<span class="feier-gels-klein">{gelText(a.gels)}</span>{/if}</li>
            {/each}
          </ul>
        {/if}

        {#if gelsGesamt > 0}
          <p class="feier-gels"><Gel groesse={26} /> {gelText(gelsGesamt)} für den Shop</p>
        {/if}

        {#if feier.briefe.length}
          <p class="feier-post">✉ {feier.briefe.length === 1 ? 'Ein neuer Brief wartet auf dich.' : `${feier.briefe.length} neue Briefe warten auf dich.`}</p>
          <div class="feier-knoepfe">
            <button on:click={() => (phase = 'umschlag')}>Brief ansehen</button>
            <button class="link" on:click={schliessen}>Später lesen</button>
          </div>
        {:else}
          <div class="feier-knoepfe"><button on:click={schliessen}>Weiter</button></div>
        {/if}
      {:else if phase === 'umschlag' && brief}
        <h2 id="feier-titel" class="feier-titel">{feier.level || feier.abzeichen.length ? 'Ein Brief für dich' : 'Neuer Brief!'}</h2>
        <p class="feier-text">Freigeschaltet mit Level {brief.level}{feier.briefe.length > 1 ? ` · Brief ${briefNr + 1} von ${feier.briefe.length}` : ''}</p>
        <button class="umschlag" class:offen aria-label="Brief öffnen" on:click={oeffnen} disabled={offen}>
          <span class="umschlag-papier" aria-hidden="true"></span>
          <span class="umschlag-tasche" aria-hidden="true"></span>
          <span class="umschlag-klappe" aria-hidden="true"></span>
          <span class="umschlag-siegel" aria-hidden="true">♥</span>
        </button>
        <div class="feier-knoepfe">
          <button on:click={oeffnen} disabled={offen}>Öffnen</button>
          <button class="link" on:click={schliessen}>Später lesen</button>
        </div>
      {:else if phase === 'lesen' && brief}
        <div class="feier-brief">
          <h2 id="feier-titel" class="feier-titel">{brief.titel || 'Für dich'}</h2>
          <p>{brief.text}</p>
        </div>
        <div class="feier-knoepfe">
          {#if briefNr < feier.briefe.length - 1}
            <button on:click={naechsterBrief}>Nächster Brief</button>
            <button class="link" on:click={schliessen}>Später</button>
          {:else}
            <button on:click={schliessen}>Schließen</button>
          {/if}
        </div>
        <p class="muted" style="text-align: center; margin: 8px 0 0">Du findest alle Briefe unter Mehr → Briefe.</p>
      {/if}
    </div>
  </div>
{/if}
