<script context="module">
  import { writable } from 'svelte/store';
  // Es ist immer nur eine Zeile aufgewischt.
  const offeneZeile = writable(null);
</script>

<script>
  // Zeile mit Aktionen wie in iOS: nach links wischen zeigt die Knöpfe, ganz durchwischen führt die erste aus.
  // Auf dem Laptop (Maus) erscheinen die Knöpfe beim Darüberfahren rechts in der Zeile.
  // aktionen: [{ label, aktion, art: 'loeschen' | 'neutral' }]
  export let aktionen = [];

  const ich = {};
  const BREITE = 84;
  $: gesamt = aktionen.length * BREITE;

  let el;
  let x = 0;
  let animiert = true;
  let start = null;
  let richtung = null;
  let klickSchlucken = false;

  $: if ($offeneZeile !== ich && x !== 0 && start === null && !weg) x = 0;
  let weg = false;

  function runter(ev) {
    if (ev.pointerType === 'mouse' || !aktionen.length || weg) return;
    if (ev.target.closest('input, textarea, select')) return;
    start = { x: ev.clientX, y: ev.clientY, x0: x };
    richtung = null;
  }
  function bewegen(ev) {
    if (!start) return;
    const dx = ev.clientX - start.x;
    const dy = ev.clientY - start.y;
    if (!richtung) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      richtung = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
      if (richtung === 'h') {
        el.setPointerCapture(ev.pointerId);
        offeneZeile.set(ich);
        animiert = false;
      }
    }
    if (richtung !== 'h') return;
    let nx = start.x0 + dx;
    if (nx > 0) nx = nx / 5;
    x = Math.max(-el.offsetWidth, nx);
  }
  function hoch() {
    if (!start) return;
    start = null;
    animiert = true;
    if (richtung !== 'h') return;
    klickSchlucken = true;
    setTimeout(() => (klickSchlucken = false), 0);
    if (x < -el.offsetWidth * 0.55 && aktionen[0]) {
      ausfuehren(aktionen[0]);
      return;
    }
    x = x < -gesamt / 2 ? -gesamt : 0;
    if (x === 0) offeneZeile.update((z) => (z === ich ? null : z));
  }
  function klick(ev) {
    // Nach dem Wischen oder bei offener Zeile: Tippen schließt nur
    if (klickSchlucken || (x !== 0 && !ev.target.closest('.swipe-hinter'))) {
      ev.stopPropagation();
      ev.preventDefault();
      if (!klickSchlucken) {
        x = 0;
        offeneZeile.set(null);
      }
    }
  }
  function ausfuehren(a) {
    if (a.art === 'loeschen') {
      weg = true;
      x = -el.offsetWidth;
      setTimeout(() => {
        a.aktion();
        offeneZeile.set(null);
        // falls die Zeile bleibt (z. B. abgebrochen), wieder zeigen
        setTimeout(() => {
          weg = false;
          x = 0;
        }, 300);
      }, 180);
    } else {
      x = 0;
      offeneZeile.set(null);
      a.aktion();
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
  class="swipe"
  bind:this={el}
  on:pointerdown={runter}
  on:pointermove={bewegen}
  on:pointerup={hoch}
  on:pointercancel={hoch}
  on:click|capture={klick}
>
  {#if aktionen.length}
    <div class="swipe-hinter" style="width: {Math.max(gesamt, -x)}px" aria-hidden={x === 0}>
      {#each aktionen as a, i}
        <button class="swipe-knopf {a.art || 'neutral'}" class:erster={i === 0} tabindex={x === 0 ? -1 : 0} on:click={() => ausfuehren(a)}>{a.label}</button>
      {/each}
    </div>
  {/if}
  <div class="swipe-vorn" class:animiert style={x ? `transform: translateX(${x}px)` : ''}>
    <div class="swipe-slot"><slot /></div>
    {#if aktionen.length}
      <div class="swipe-maus">
        {#each aktionen as a}
          <button class="sek klein {a.art === 'loeschen' ? 'gefahr' : ''}" on:click={() => ausfuehren(a)}>{a.label}</button>
        {/each}
      </div>
    {/if}
  </div>
</div>
