<script>
  import { liveQuery } from 'dexie';
  import { db, heute } from '../lib/db.js';
  import { kurz, TAGE } from '../lib/datum.js';
  import { plaeneAusListe } from '../lib/plan.js';
  import { gehe } from '../lib/nav.js';

  // Ein Ort für alles, was man anlegt: Plan, Ziele, Messwerte. Mit kurzem Stand, damit man weiß, wo man steht.
  const stand = liveQuery(async () => {
    const plaene = plaeneAusListe(await db.plaene.toArray(), heute());
    const texte = [];
    for (const plan of plaene) {
      const tage = [...new Set((await db.planEintraege.where('planId').equals(plan.id).toArray()).map((e) => e.wochentag))].sort();
      texte.push(`${plan.name} · ${tage.length ? tage.map((t) => TAGE[t - 1]).join(', ') : 'noch keine Übungen'}`);
    }
    const ziele = await db.ziele.toArray();
    const letzte = (await db.werte.orderBy('datum').last()) || null;
    return {
      plan: texte.length ? texte.join(' | ') : 'Noch kein Plan',
      ziele: ziele.length ? `${ziele.filter((z) => !z.erreicht).length} offen · ${ziele.filter((z) => z.erreicht).length} erreicht` : 'Noch keine Ziele',
      messung: letzte ? `Letzte Messung am ${kurz(letzte.datum)}` : 'Noch keine Messung'
    };
  });

  const eintraege = [
    { seite: 'plan', params: {}, titel: 'Plan', text: 'Übungen je Wochentag, Plan vom Physio als PDF', key: 'plan', icon: 'M5 4h10M5 10h10M5 16h6' },
    { seite: 'ziele', params: { neu: true }, titel: 'Ziel', text: 'Mit Messwert (z. B. 12 kg) oder ohne (z. B. erster Sprung)', key: 'ziele', icon: 'M10 3a7 7 0 100 14 7 7 0 000-14zm0 4a3 3 0 100 6 3 3 0 000-6z' },
    { seite: 'messwerte', params: {}, titel: 'Messwert', text: 'Umfang links und rechts, Beweglichkeit, Schmerz', key: 'messung', icon: 'M3 14l4-4 3 3 7-7' }
  ];
</script>

<h1>Anlegen</h1>

<div class="anlegen">
  {#each eintraege as e}
    <button class="anlegen-kachel" on:click={() => gehe(e.seite, e.params)}>
      <span class="anlegen-icon" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d={e.icon} /></svg>
      </span>
      <span class="anlegen-text">
        <strong>{e.titel}</strong>
        <span class="muted">{e.text}</span>
        {#if $stand}<span class="anlegen-stand">{$stand[e.key]}</span>{/if}
      </span>
      <span class="muted" aria-hidden="true">›</span>
    </button>
  {/each}
</div>
