<script>
  // Abzeichen-Medaille: Band, goldener Rand, schwarze Mitte mit dem roten IRONKIM-„M“ samt Punkt (aus public/icon.svg).
  // erreicht = false: grau. animation: '' | 'flip' (einmal drehen) | 'feier' (herabfallen, pendeln, glänzen)
  export let groesse = 56;
  export let erreicht = true;
  export let animation = '';
  export let glanz = false; // ab und zu ein Lichtreflex

  const id = 'm' + Math.random().toString(36).slice(2, 9);
  $: f = erreicht
    ? { band1: '#e2231a', band2: '#1f1f1f', rand1: '#f7d774', rand2: '#c98a1e', rand3: '#8a5a12', mitte: '#111', m: '#e2231a' }
    : { band1: '#cfcac0', band2: '#b3ada2', rand1: '#e8e5de', rand2: '#d2cec5', rand3: '#bdb8ae', mitte: '#efece6', m: '#c9c4b9' };
</script>

<span class="medaille {animation}" class:glanz={glanz && erreicht} style="--g: {groesse}px" aria-hidden="true">
  <svg viewBox="0 0 100 116" width={groesse} height={groesse * 1.16}>
    <defs>
      <linearGradient id="{id}-rand" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color={f.rand1} />
        <stop offset="0.55" stop-color={f.rand2} />
        <stop offset="1" stop-color={f.rand3} />
      </linearGradient>
      <clipPath id="{id}-kreis"><circle cx="50" cy="72" r="40" /></clipPath>
    </defs>
    <!-- Band -->
    <path d="M58 0h18L58 40H40z" fill={f.band2} />
    <path d="M24 0h18l18 40H42z" fill={f.band1} />
    <!-- Medaille -->
    <circle cx="50" cy="72" r="40" fill="url(#{id}-rand)" />
    <circle cx="50" cy="72" r="34.5" fill="none" stroke={erreicht ? '#fff3c4' : '#f7f5f0'} stroke-opacity="0.7" stroke-width="1.2" />
    <circle cx="50" cy="72" r="31" fill={f.mitte} />
    <!-- IRONKIM-M mit Punkt -->
    <g transform="translate(51 74) scale(0.155) translate(-845 -512)" fill={f.m}>
      <path d="M822.9 476.3c2.4 0 4.3 2.2 3.7 4.8l-32.1 139.2c-.6 2.6-3.3 4.8-6 4.8H758c-2.6 0-4.3-2.2-3.7-4.8l32.2-139.2c.6-2.6 3.2-4.8 5.9-4.8z" />
      <path d="M931.5 476.3c2.4 0 4.3 2.2 3.7 4.8l-32.1 139.2c-.6 2.6-3.3 4.8-6 4.8h-30.4c-2.6 0-4.3-2.2-3.7-4.8l32.2-139.2c.6-2.6 3.2-4.8 5.9-4.8z" />
      <path d="M787.6 476.3h45l24.4 119H812z" />
      <path d="M891.4 476.3h45L857 595.3h-45z" />
      <circle cx="862" cy="428.7" r="29.8" />
    </g>
    <!-- Lichtreflex -->
    <g clip-path="url(#{id}-kreis)">
      <g class="medaille-licht"><rect x="-80" y="20" width="18" height="110" fill="#fff" opacity="0.45" transform="rotate(25 50 72)" /></g>
    </g>
  </svg>
</span>
