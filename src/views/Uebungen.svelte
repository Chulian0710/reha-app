<script>
  import { liveQuery } from 'dexie';
  import { db } from '../lib/db.js';
  import { BIBLIOTHEK, KATEGORIEN } from '../lib/bibliothek.js';
  import { EINHEITEN, streckeEinheit } from '../lib/ausdauer.js';
  import { TAGE_LANG, anzeige } from '../lib/datum.js';
  import { gehe } from '../lib/nav.js';
  import { tagesplan } from '../lib/plan.js';
  import { zeigeToast } from '../lib/toast.js';
  import { sxrLesen } from '../lib/pdfparse.js';
  import Sheet from '../lib/Sheet.svelte';

  export let params = {};

  const gespeichert = liveQuery(() => db.uebungen.toArray());

  // Für einen Plantag oder ein Datum wählt man mehrere Übungen aus und fügt sie auf einmal hinzu.
  const mehrfach = !!(params.planId || params.datum);
  const schluessel = (u) => (u.istGespeichert ? 'g' + u.id : 'b' + u.bibId);
  let auswahl = new Map(); // Schlüssel → Übung, bleibt beim Suchen und Filtern erhalten
  function umschalten(u) {
    const k = schluessel(u);
    if (auswahl.has(k)) auswahl.delete(k);
    else auswahl.set(k, u);
    auswahl = auswahl;
  }

  // Übungen, die an dem Tag schon drin sind (nur als Hinweis, doppelt geht trotzdem)
  const schonDa = liveQuery(async () => {
    if (params.planId) {
      const es = await db.planEintraege.where('planId').equals(params.planId).toArray();
      return new Set(es.filter((e) => e.wochentag === params.wochentag).map((e) => e.uebungId));
    }
    if (params.datum) return new Set((await tagesplan(params.datum)).eintraege.map((e) => e.uebungId));
    return new Set();
  });

  let suche = '';
  let filter = 'alle';
  let hinweis = '';

  $: namen = new Set(($gespeichert || []).map((u) => u.name.toLowerCase()));
  $: alle = [
    ...($gespeichert || []).map((u) => ({ ...u, istGespeichert: true })),
    ...BIBLIOTHEK.filter((b) => !namen.has(b.name.toLowerCase())).map((b) => ({ ...b, istGespeichert: false }))
  ];
  $: treffer = alle
    .filter((u) => {
      if (filter === 'eigene') return u.quelle === 'eigen';
      if (filter === 'physio') return u.quelle === 'physio';
      if (filter !== 'alle' && u.kategorie !== filter) return false;
      return true;
    })
    .filter((u) => {
      const s = suche.trim().toLowerCase();
      return !s || u.name.toLowerCase().includes(s) || (u.bereich || '').toLowerCase().includes(s);
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));

  // Speichert die Übung (falls nötig) und gibt ihre ID zurück
  async function sichern(u) {
    return u.istGespeichert
      ? u.id
      : await db.uebungen.add({ name: u.name, kategorie: u.kategorie, bereich: u.bereich || '', quelle: 'bibliothek', ...(u.einheit ? { einheit: u.einheit } : {}) });
  }

  async function eintragen(u) {
    const id = await sichern(u);
    // Vorgabe aus dem Physio-Plan übernehmen, sonst 3 × 10 (Ausdauer: ohne Sätze)
    const sxr = u.vorgabe ? sxrLesen(u.vorgabe) : null;
    const ausdauer = u.kategorie === 'ausdauer';
    const vorgabe = {
      saetze: u.vorgabe ? (sxr ? sxr.saetze : null) : ausdauer ? null : 3,
      wdh: u.vorgabe ? (sxr ? sxr.wdh : null) : ausdauer ? null : 10,
      vorgabe: u.vorgabe || null,
      notiz: u.notiz || null,
      gewicht: null,
      xp: null
    };
    if (params.planId) await db.planEintraege.add({ planId: params.planId, wochentag: params.wochentag, uebungId: id, ...vorgabe });
    // einmalige Zusatzübung nur an diesem Tag
    else await db.planEintraege.add({ planId: null, wochentag: null, datum: params.datum, uebungId: id, ...vorgabe });
  }

  let speichert = false;
  async function hinzufuegen() {
    if (!auswahl.size || speichert) return;
    speichert = true;
    const n = auswahl.size;
    for (const u of auswahl.values()) await eintragen(u);
    zeigeToast(`${n === 1 ? '1 Übung' : `${n} Übungen`} ${params.datum ? 'eingeplant' : 'hinzugefügt'}`);
    fertig();
  }

  function fertig() {
    if (params.planId) gehe('plan', { planId: params.planId, wochentag: params.wochentag });
    else if (params.von === 'heute') gehe('heute', { datum: params.datum });
    else gehe('kalender', { datum: params.datum });
  }

  async function speichern(u) {
    await sichern(u);
    hinweis = `„${u.name}“ gespeichert.`;
  }

  // eigene Übung
  let zeigeEigene = false;
  let eName = '';
  let eKategorie = 'reha';
  let eBereich = '';
  let eVideo = '';
  let eEinheit = 'km';
  async function eigeneAnlegen() {
    if (!eName.trim()) return;
    const u = { name: eName.trim(), kategorie: eKategorie, bereich: eBereich.trim(), quelle: 'eigen', video: eVideo.trim() || null };
    if (eKategorie === 'ausdauer') u.einheit = eEinheit;
    const id = await db.uebungen.add(u);
    eName = '';
    eBereich = '';
    eVideo = '';
    zeigeEigene = false;
    if (mehrfach) {
      auswahl.set('g' + id, { ...u, id, istGespeichert: true });
      auswahl = auswahl;
      hinweis = `„${u.name}“ angelegt und ausgewählt.`;
    } else hinweis = `„${u.name}“ gespeichert.`;
  }

  const filterListe = [['alle', 'Alle'], ['kraft', 'Kraft'], ['ausdauer', 'Ausdauer'], ['mobility', 'Mobility'], ['reha', 'Reha'], ['physio', 'Physio'], ['eigene', 'Eigene']];
</script>

<h1>Übung hinzufügen</h1>
{#if params.planId}<p class="muted" style="margin-top: -8px">für {TAGE_LANG[params.wochentag - 1]} · mehrere auswählen möglich</p>{/if}
{#if params.datum}<p class="muted" style="margin-top: -8px">einmalig einplanen für {anzeige(params.datum)} · mehrere auswählen möglich</p>{/if}

<label for="suche">Suche in der Übungsbibliothek</label>
<input id="suche" type="search" bind:value={suche} placeholder="z. B. Wade, Knie, Brücke" />

<div class="chips" style="margin: 12px 0" role="group" aria-label="Filter">
  {#each filterListe as [id, label]}
    <button class="chip" class:an={filter === id} aria-pressed={filter === id} on:click={() => (filter = id)}>{label}</button>
  {/each}
</div>

{#if hinweis}<p class="hinweis">{hinweis}</p>{/if}

<div class="card">
  {#if treffer.length === 0}
    <p class="muted" style="margin: 0">Nichts gefunden.</p>
  {/if}
  {#each treffer.slice(0, 60) as u (schluessel(u))}
    {#if mehrfach}
      <label class="zeile waehlbar">
        <input type="checkbox" checked={auswahl.has(schluessel(u))} on:change={() => umschalten(u)} />
        <span class="zeile-text">{u.name}<br /><span class="muted">{@render details(u)}</span></span>
      </label>
    {:else}
      <div class="zeile">
        <span class="zeile-text">{u.name}<br /><span class="muted">{@render details(u)}</span></span>
        <button class="sek klein" on:click={() => speichern(u)}>Speichern</button>
      </div>
    {/if}
  {/each}
</div>

{#snippet details(u)}{[u.istGespeichert && $schonDa?.has(u.id) ? (params.datum ? 'schon eingeplant' : 'schon an dem Tag') : '', u.bereich, KATEGORIEN[u.kategorie], u.quelle === 'eigen' ? 'eigene' : u.quelle === 'physio' ? 'vom Physio' : '', u.kategorie === 'ausdauer' ? `Minuten und ${streckeEinheit(u) === 'm' ? 'Meter' : 'km'}` : '', u.vorgabe].filter(Boolean).join(' · ')}{/snippet}

{#if mehrfach && auswahl.size}
  <div class="auswahl-leiste">
    <button on:click={hinzufuegen} disabled={speichert}>
      {auswahl.size === 1 ? '1 Übung' : `${auswahl.size} Übungen`} {params.datum ? 'einplanen' : 'hinzufügen'}
    </button>
  </div>
{/if}

<p class="hinweis">Nichts Passendes? Reha-Übungen vom Physio legst du am besten selbst an. Die Liste enthält nur Namen, die Ausführung zeigt dein Physio.</p>

<button class={mehrfach ? 'sek breit' : 'breit'} on:click={() => (zeigeEigene = true)}>Eigene Übung anlegen</button>

<Sheet offen={zeigeEigene} titel="Eigene Übung" onclose={() => (zeigeEigene = false)}>
    <label for="ename">Name</label>
    <input id="ename" bind:value={eName} />
    <label for="ekat">Art</label>
    <select id="ekat" bind:value={eKategorie}>
      {#each Object.entries(KATEGORIEN) as [id, label]}<option value={id}>{label}</option>{/each}
    </select>
    {#if eKategorie === 'ausdauer'}
      <label for="eeinheit">Strecke messen in</label>
      <select id="eeinheit" bind:value={eEinheit}>
        {#each Object.entries(EINHEITEN) as [id, label]}<option value={id}>{label}</option>{/each}
      </select>
      <p class="muted" style="margin: 6px 0 0">Im Training trägst du dann Dauer (Minuten) und Strecke ein, keine Sätze und kein Gewicht.</p>
    {/if}
    <label for="ebereich">Körperbereich (optional)</label>
    <input id="ebereich" bind:value={eBereich} />
    <label for="evideo">YouTube-Link aus dem Plan (optional)</label>
    <input id="evideo" type="url" inputmode="url" bind:value={eVideo} placeholder="https://youtu.be/…" />
    <div class="sheet-aktionen"><button on:click={eigeneAnlegen} disabled={!eName.trim()}>Anlegen{mehrfach ? ' und auswählen' : ''}</button></div>
</Sheet>

{#if mehrfach}
  <button class="sek breit" style="margin-top: 10px" on:click={fertig}>
    {auswahl.size ? 'Abbrechen' : params.planId ? 'Zurück zum Plan' : params.von === 'heute' ? 'Zurück zu Heute' : 'Zurück zum Kalender'}
  </button>
{/if}
