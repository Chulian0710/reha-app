<script>
  // Liniendiagramm mit Fadenkreuz. series: [{ name, punkte: [{ datum, wert }], farbe, gestrichelt }]
  // Tippen oder Zeigen wählt den nächsten Tag, die Werte stehen über dem Diagramm. Pfeiltasten gehen auch.
  import { kurz, parse } from './datum.js';

  export let series = [];
  export let einheit = '';
  export let hoehe = 170;

  const B = 320, PL = 36, PR = 12, PT = 12, PB = 22;
  $: H = hoehe;

  $: alle = series.flatMap((s) => s.punkte);
  $: tage = [...new Set(alle.map((p) => p.datum))].sort();
  $: rohMin = alle.length ? Math.min(...alle.map((p) => p.wert)) : 0;
  $: rohMax = alle.length ? Math.max(...alle.map((p) => p.wert)) : 1;
  $: rand = (rohMax - rohMin || Math.abs(rohMax) || 1) * 0.12;
  $: minW = rohMin - rand;
  $: maxW = rohMax + rand;
  $: t0 = tage.length ? parse(tage[0]).getTime() : 0;
  $: t1 = tage.length ? parse(tage[tage.length - 1]).getTime() : 1;

  function x(datum, t0, t1) {
    if (t1 === t0) return (PL + B - PR) / 2;
    return PL + ((parse(datum).getTime() - t0) / (t1 - t0)) * (B - PL - PR);
  }
  function y(wert, minW, maxW, H) {
    return H - PB - ((wert - minW) / (maxW - minW || 1)) * (H - PT - PB);
  }

  $: pfade = series.map((s) => {
    const punkte = s.punkte
      .slice()
      .sort((a, b) => a.datum.localeCompare(b.datum))
      .map((p) => ({ ...p, cx: x(p.datum, t0, t1), cy: y(p.wert, minW, maxW, H) }));
    return { ...s, punkte, d: punkte.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.cx.toFixed(1)},${p.cy.toFixed(1)}`).join(' ') };
  });

  // Hilfslinien bei Minimum, Mitte und Maximum
  $: hilfslinien = !alle.length ? [] : rohMin === rohMax ? [rohMin] : [rohMin, (rohMin + rohMax) / 2, rohMax];

  let svg;
  let aktiv = null;
  $: if (aktiv && !tage.includes(aktiv)) aktiv = null;
  $: zeigeTag = aktiv ?? tage[tage.length - 1];
  $: readout = series.map((s) => ({ ...s, p: s.punkte.find((p) => p.datum === zeigeTag) }));

  function zeigen(ev) {
    if (!tage.length) return;
    const r = svg.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * B;
    let best = tage[0];
    for (const d of tage) if (Math.abs(x(d, t0, t1) - px) < Math.abs(x(best, t0, t1) - px)) best = d;
    aktiv = best;
  }
  function taste(ev) {
    const i = tage.indexOf(zeigeTag);
    if (ev.key === 'ArrowLeft' && i > 0) aktiv = tage[i - 1];
    else if (ev.key === 'ArrowRight' && i < tage.length - 1) aktiv = tage[i + 1];
    else return;
    ev.preventDefault();
  }

  const zahl = (v) => String(Math.round(v * 10) / 10).replace('.', ',');
</script>

{#if alle.length === 0}
  <p class="muted" style="margin: 0">Noch keine Werte für ein Diagramm.</p>
{:else}
  <div class="lc-readout" aria-live="polite">
    <span class="muted">{kurz(zeigeTag)}{aktiv ? '' : ' · zuletzt'}</span>
    {#each readout as s}
      <span class="lc-wert">
        <svg width="16" height="8" aria-hidden="true"><line x1="0" y1="4" x2="16" y2="4" stroke={s.farbe} stroke-width="2.5" stroke-dasharray={s.gestrichelt ? '4 3' : null} /></svg>
        <strong>{s.p ? zahl(s.p.wert) : '–'}</strong>{#if s.p && einheit}&nbsp;{einheit}{/if}
        {#if series.length > 1}<span class="muted">{s.name}</span>{/if}
      </span>
    {/each}
  </div>
  <svg
    bind:this={svg}
    class="lc"
    viewBox="0 0 {B} {H}"
    width="100%"
    role="slider"
    tabindex="0"
    aria-label="Verlauf von {kurz(tage[0])} bis {kurz(tage[tage.length - 1])}, Werte von {zahl(rohMin)} bis {zahl(rohMax)}{einheit ? ' ' + einheit : ''}. Mit Pfeiltasten Tage wählen."
    aria-valuemin="1"
    aria-valuemax={tage.length}
    aria-valuenow={tage.indexOf(zeigeTag) + 1}
    aria-valuetext="{kurz(zeigeTag)}: {readout.map((s) => (s.p ? zahl(s.p.wert) : 'kein Wert') + (series.length > 1 ? ' ' + s.name : '')).join(', ')}"
    on:pointermove={zeigen}
    on:pointerdown={zeigen}
    on:keydown={taste}
  >
    {#each hilfslinien as w}
      <line x1={PL} x2={B - PR} y1={y(w, minW, maxW, H)} y2={y(w, minW, maxW, H)} stroke="var(--line)" stroke-width="1" />
      <text x={PL - 6} y={y(w, minW, maxW, H) + 3.5} font-size="10" text-anchor="end" fill="var(--muted)">{zahl(w)}</text>
    {/each}
    <line x1={PL} y1={H - PB} x2={B - PR} y2={H - PB} stroke="var(--field)" stroke-width="1" />
    <text x={PL} y={H - 6} font-size="10" fill="var(--muted)">{kurz(tage[0])}</text>
    {#if tage.length > 1}<text x={B - PR} y={H - 6} font-size="10" text-anchor="end" fill="var(--muted)">{kurz(tage[tage.length - 1])}</text>{/if}

    <line x1={x(zeigeTag, t0, t1)} x2={x(zeigeTag, t0, t1)} y1={PT - 4} y2={H - PB} stroke="var(--muted)" stroke-width="1" stroke-dasharray="2 3" />

    {#each pfade as s}
      <path d={s.d} fill="none" stroke={s.farbe} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray={s.gestrichelt ? '6 4' : null} />
      {#each s.punkte as p}
        {@const an = p.datum === zeigeTag}
        {#if s.gestrichelt}
          <rect x={p.cx - (an ? 5 : 4)} y={p.cy - (an ? 5 : 4)} width={an ? 10 : 8} height={an ? 10 : 8} rx="1.5" fill={s.farbe} stroke="var(--card)" stroke-width="2" />
        {:else}
          <circle cx={p.cx} cy={p.cy} r={an ? 5.5 : 4} fill={s.farbe} stroke="var(--card)" stroke-width="2" />
        {/if}
      {/each}
    {/each}
  </svg>
  {#if series.length > 1}
    <div class="row muted" style="font-size: 0.85rem">
      {#each series as s}
        <span class="row" style="gap: 6px; flex-wrap: nowrap">
          <svg width="24" height="8" aria-hidden="true"><line x1="0" y1="4" x2="24" y2="4" stroke={s.farbe} stroke-width="2.5" stroke-dasharray={s.gestrichelt ? '6 4' : null} /></svg>
          {s.name}
        </span>
      {/each}
    </div>
  {/if}
{/if}
