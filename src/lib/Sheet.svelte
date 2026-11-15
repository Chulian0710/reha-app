<script>
  // Pop-up: auf dem Handy ein Blatt, das von unten hochfährt (zum Schließen nach unten ziehen),
  // auf dem Laptop ein Dialog in der Mitte. Schließen über „Abbrechen“, Hintergrund, Esc oder Zurück.
  import { onDestroy, tick } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import { sheetAuf, sheetZu, zurueck, istOberstesSheet } from './nav.js';

  export let offen = false;
  export let titel = '';
  export let onclose = () => {};

  let eintrag = null;
  let box;
  $: if (offen && !eintrag) oeffnen();
  $: if (!offen && eintrag) {
    sheetZu(eintrag);
    eintrag = null;
  }
  onDestroy(() => eintrag && sheetZu(eintrag));

  async function oeffnen() {
    eintrag = sheetAuf(() => {
      eintrag = null;
      onclose();
    });
    await tick();
    box?.focus({ preventScroll: true });
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

  // nach unten ziehen zum Schließen (nur Touch)
  let dy = 0;
  let startY = null;
  function ziehStart(ev) {
    if (ev.pointerType === 'mouse' || ev.target.closest('button')) return;
    startY = ev.clientY;
    ev.currentTarget.setPointerCapture(ev.pointerId);
  }
  function ziehen(ev) {
    if (startY === null) return;
    dy = Math.max(0, ev.clientY - startY);
  }
  function ziehEnde() {
    if (startY === null) return;
    startY = null;
    if (dy > 110) schliessen();
    dy = 0;
  }
</script>

<svelte:window on:keydown={taste} />

{#if offen}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="sheet-hg" transition:fade={{ duration: 180 }} on:click={schliessen}></div>
  <div
    class="sheet"
    class:zieht={startY !== null}
    role="dialog"
    aria-modal="true"
    aria-label={titel}
    tabindex="-1"
    bind:this={box}
    style={dy ? `transform: translateY(${dy}px)` : ''}
    transition:fly={{ y: 500, duration: 260, opacity: 1 }}
  >
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="sheet-kopf" on:pointerdown={ziehStart} on:pointermove={ziehen} on:pointerup={ziehEnde} on:pointercancel={ziehEnde}>
      <span class="sheet-griff" aria-hidden="true"></span>
      <button class="link sheet-abbrechen" on:click={schliessen}>Abbrechen</button>
      <strong class="sheet-titel">{titel}</strong>
      <span class="sheet-platz"></span>
    </div>
    <div class="sheet-inhalt">
      <slot />
    </div>
  </div>
{/if}
