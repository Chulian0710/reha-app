<script>
  import { fly } from 'svelte/transition';
  import { ansicht, verlauf, gehe, zurueck, TITEL, sheetOffen } from './lib/nav.js';
  import { toast } from './lib/toast.js';
  import Heute from './views/Heute.svelte';
  import Kalender from './views/Kalender.svelte';
  import Plan from './views/Plan.svelte';
  import Uebungen from './views/Uebungen.svelte';
  import Messwerte from './views/Messwerte.svelte';
  import Mehr from './views/Mehr.svelte';
  import Tagebuch from './views/Tagebuch.svelte';
  import Shop from './views/Shop.svelte';
  import Briefe from './views/Briefe.svelte';
  import Daten from './views/Daten.svelte';
  import Betreuer from './views/Betreuer.svelte';
  import PdfImport from './views/PdfImport.svelte';
  import Ziele from './views/Ziele.svelte';
  import Fortschritt from './views/Fortschritt.svelte';
  import Anlegen from './views/Anlegen.svelte';
  import Feier from './lib/Feier.svelte';

  // Icons: einfache Linien, 24er Raster
  const tabs = [
    { id: 'heute', label: 'Heute', icon: 'M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z' },
    { id: 'kalender', label: 'Kalender', icon: 'M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM4 10h16M8 4v4M16 4v4' },
    { id: 'anlegen', label: 'Anlegen', plus: true },
    { id: 'fortschritt', label: 'Fortschritt', icon: 'M4 19h16M6 15l4-4 3 3 6-7' },
    { id: 'mehr', label: 'Mehr', icon: 'M6 12h.01M12 12h.01M18 12h.01' }
  ];
  const gruppe = { plan: 'anlegen', uebungen: 'anlegen', pdfimport: 'anlegen', ziele: 'anlegen', messwerte: 'anlegen', tagebuch: 'mehr', briefe: 'mehr', shop: 'mehr', daten: 'mehr', betreuer: 'mehr' };

  $: seite = $ansicht.seite;
  $: params = $ansicht.params;
  $: aktiv = seite === 'uebungen' && params.datum ? 'kalender' : gruppe[seite] || seite;
  $: vorher = $verlauf[$verlauf.length - 1];

  // Als installierte App (Home-Bildschirm) gibt es keine Browser-Geste: Wischen vom linken Rand geht zurück.
  const standalone = typeof window !== 'undefined' && (window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches);
  let wisch = null;
  let wischX = 0;
  function randStart(ev) {
    if (!standalone || !vorher || sheetOffen() || ev.touches[0].clientX > 24) return;
    wisch = { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
  }
  function randZug(ev) {
    if (!wisch) return;
    const dx = ev.touches[0].clientX - wisch.x;
    const dy = ev.touches[0].clientY - wisch.y;
    if (Math.abs(dy) > Math.abs(dx) && wischX === 0) {
      wisch = null;
      return;
    }
    wischX = Math.max(0, dx);
  }
  function randEnde() {
    if (!wisch) return;
    if (wischX > window.innerWidth * 0.3) zurueck();
    wisch = null;
    wischX = 0;
  }

  // Laptop: Esc geht eine Ebene zurück (Sheets fangen Esc selbst ab)
  function taste(ev) {
    if (ev.defaultPrevented || ev.key !== 'Escape' || sheetOffen()) return;
    if (ev.target.closest && ev.target.closest('input, textarea, select')) return;
    if (vorher) zurueck();
  }
</script>

<svelte:window on:touchstart|passive={randStart} on:touchmove|passive={randZug} on:touchend={randEnde} on:keydown={taste} />

{#if vorher}
  <div class="topbar">
    <button class="zurueck-knopf" on:click={zurueck}>
      <svg width="12" height="20" viewBox="0 0 12 20" aria-hidden="true"><path d="M10 2 2 10l8 8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
      {TITEL[vorher.seite] || 'Zurück'}
    </button>
  </div>
{/if}

<main style={wischX ? `transform: translateX(${wischX}px)` : ''} class:wischt={wischX > 0}>
  {#if seite === 'heute'}{#key params}<Heute {params} />{/key}
  {:else if seite === 'kalender'}<Kalender {params} />
  {:else if seite === 'plan'}<Plan {params} />
  {:else if seite === 'uebungen'}<Uebungen {params} />
  {:else if seite === 'messwerte'}<Messwerte />
  {:else if seite === 'anlegen'}<Anlegen />
  {:else if seite === 'ziele'}{#key params}<Ziele {params} />{/key}
  {:else if seite === 'fortschritt'}<Fortschritt />
  {:else if seite === 'mehr'}<Mehr />
  {:else if seite === 'tagebuch'}<Tagebuch />
  {:else if seite === 'briefe'}<Briefe />
  {:else if seite === 'shop'}<Shop />
  {:else if seite === 'daten'}<Daten />
  {:else if seite === 'betreuer'}<Betreuer />
  {:else if seite === 'pdfimport'}<PdfImport {params} />
  {/if}
</main>

{#if $toast}
  {#key $toast.id}
    <div class="toast" role="status" transition:fly={{ y: 40, duration: 200 }}>
      <span>{$toast.text}</span>
      {#if $toast.rueckgaengig}<button class="link toast-knopf" on:click={$toast.rueckgaengig}>Rückgängig</button>{/if}
    </div>
  {/key}
{/if}

<Feier />

<nav class="tabs" aria-label="Hauptmenü">
  <span class="tabs-marke" aria-hidden="true">Reha</span>
  {#each tabs as t}
    {#if t.plus}
      <button class="plus-tab" class:aktiv={aktiv === t.id} aria-label="Anlegen: Plan, Ziel oder Messwert" aria-current={aktiv === t.id ? 'page' : undefined} on:click={() => gehe(t.id)}>
        <span class="plus-kreis" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 22 22"><path d="M11 4v14M4 11h14" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" /></svg>
        </span>
        <span class="tab-label plus-label">Anlegen</span>
      </button>
    {:else}
      <button class:aktiv={aktiv === t.id} aria-current={aktiv === t.id ? 'page' : undefined} on:click={() => gehe(t.id)}>
        <svg class="tab-icon" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d={t.icon} fill="none" stroke="currentColor" stroke-width={t.id === 'mehr' ? 3.2 : 1.8} stroke-linecap="round" stroke-linejoin="round" /></svg>
        <span class="tab-label">{t.label}</span>
      </button>
    {/if}
  {/each}
</nav>
