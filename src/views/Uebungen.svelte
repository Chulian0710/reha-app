<script>
  import { liveQuery } from 'dexie';
  import { db } from '../lib/db.js';
  import { BIBLIOTHEK, KATEGORIEN } from '../lib/bibliothek.js';
  import { EINHEITEN, streckeEinheit } from '../lib/ausdauer.js';
  import { TAGE_LANG, anzeige } from '../lib/datum.js';
  import { gehe } from '../lib/nav.js';
  import { tagesplan } from '../lib/plan.js';
  import { zeigeToast, toast } from '../lib/toast.js';
  import { heute } from '../lib/db.js';
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

  // auch gelöschte Namen, damit eine gelöschte eingebaute Übung ausgeblendet bleibt
  $: namen = new Set(($gespeichert || []).map((u) => u.name.toLowerCase()));
  $: alle = [
    ...($gespeichert || []).filter((u) => !u.geloescht).map((u) => ({ ...u, istGespeichert: true })),
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

  // Formular für eigene Übungen, auch zum Bearbeiten (alt = Übung aus der Liste) und Löschen
  let form = null;
  function formLeer() {
    form = { alt: null, name: '', kategorie: 'reha', einheit: 'km', bereich: '', vorgabe: '', notiz: '', video: '' };
  }
  async function formAus(u) {
    form = {
      alt: u,
      name: u.name,
      kategorie: u.kategorie,
      einheit: streckeEinheit(u),
      bereich: u.bereich || '',
      vorgabe: u.vorgabe || '',
      notiz: u.notiz || '',
      video: u.video || '',
      imPlan: u.istGespeichert ? (await zukuenftigeEintraege(u.id)).length : 0
    };
  }
  function formDaten() {
    return {
      name: form.name.trim(),
      kategorie: form.kategorie,
      einheit: form.kategorie === 'ausdauer' ? form.einheit : null,
      bereich: form.bereich.trim(),
      vorgabe: form.vorgabe.trim() || null,
      notiz: form.notiz.trim() || null,
      video: form.video.trim() || null
    };
  }

  async function eigeneAnlegen() {
    if (!form.name.trim()) return;
    const u = { ...formDaten(), quelle: 'eigen' };
    const id = await db.uebungen.add(u);
    form = null;
    if (mehrfach) {
      auswahl.set('g' + id, { ...u, id, istGespeichert: true });
      auswahl = auswahl;
      hinweis = `„${u.name}“ angelegt und ausgewählt.`;
    } else hinweis = `„${u.name}“ gespeichert.`;
  }

  async function bearbeitungSpeichern() {
    if (!form.name.trim()) return;
    const alt = form.alt;
    const neu = formDaten();
    let id = alt.istGespeichert ? alt.id : null;
    if (id) {
      await db.uebungen.update(id, neu);
      // Planeinträge, deren Vorgabe/Anmerkung noch der alten der Übung entspricht, bekommen die neue
      const vorgabeNeu = (alt.vorgabe || null) !== neu.vorgabe;
      const sxr = vorgabeNeu && neu.vorgabe ? sxrLesen(neu.vorgabe) : null;
      await db.planEintraege.where('uebungId').equals(id).modify((e) => {
        if ((e.notiz || null) === (alt.notiz || null)) e.notiz = neu.notiz;
        if (vorgabeNeu && (e.vorgabe || null) === (alt.vorgabe || null)) {
          e.vorgabe = neu.vorgabe;
          if (sxr) {
            e.saetze = sxr.saetze;
            e.wdh = sxr.wdh;
          }
        }
      });
    } else {
      // Übung aus der eingebauten Liste: wird beim Bearbeiten gespeichert und ersetzt dann den Listeneintrag
      id = await db.uebungen.add({ ...neu, quelle: 'bibliothek' });
    }
    const k = schluessel(alt);
    if (auswahl.has(k)) {
      auswahl.delete(k);
      auswahl.set('g' + id, { ...neu, id, istGespeichert: true });
      auswahl = auswahl;
    }
    hinweis = `„${neu.name}“ gespeichert.`;
    form = null;
  }

  // Planeinträge, die beim Löschen mitgehen: Wochenplan und ab heute eingeplante Tage. Vergangenes bleibt.
  async function zukuenftigeEintraege(id) {
    const h = heute();
    return (await db.planEintraege.where('uebungId').equals(id).toArray()).filter((e) => !e.datum || e.datum >= h);
  }

  // Gelöschte Übungen bleiben als „geloescht“ gespeichert, damit Verlauf, Abzeichen und
  // vergangene Tage ihren Namen behalten. Eine eingebaute Übung wird so auch ausgeblendet.
  async function loeschen() {
    const u = form.alt;
    form = null;
    let id;
    let warNeu = false;
    if (u.istGespeichert) {
      id = u.id;
      await db.uebungen.update(id, { geloescht: true });
    } else {
      id = await db.uebungen.add({ name: u.name, kategorie: u.kategorie, bereich: u.bereich || '', quelle: 'bibliothek', geloescht: true, ...(u.einheit ? { einheit: u.einheit } : {}) });
      warNeu = true;
    }
    const eintraege = warNeu ? [] : await zukuenftigeEintraege(id);
    if (eintraege.length) await db.planEintraege.bulkDelete(eintraege.map((e) => e.id));
    if (auswahl.delete(schluessel(u))) auswahl = auswahl;
    hinweis = '';
    zeigeToast(`„${u.name}“ gelöscht${eintraege.length ? ' und aus dem Plan entfernt' : ''}`, async () => {
      if (warNeu) await db.uebungen.delete(id);
      else await db.uebungen.update(id, { geloescht: false });
      if (eintraege.length) await db.planEintraege.bulkPut(eintraege);
      toast.set(null);
    });
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
      <div class="zeile">
        <label class="waehlbar-inhalt">
          <input type="checkbox" checked={auswahl.has(schluessel(u))} on:change={() => umschalten(u)} />
          <span class="zeile-text">{u.name}<br /><span class="muted">{@render details(u)}</span></span>
        </label>
        <button class="sek klein" aria-label="„{u.name}“ bearbeiten" on:click={() => formAus(u)}>Bearbeiten</button>
      </div>
    {:else}
      <div class="zeile">
        <span class="zeile-text">{u.name}<br /><span class="muted">{@render details(u)}</span></span>
        <button class="sek klein" on:click={() => formAus(u)}>Bearbeiten</button>
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

<button class={mehrfach ? 'sek breit' : 'breit'} on:click={formLeer}>Eigene Übung anlegen</button>

<Sheet offen={form !== null} titel={form?.alt ? 'Übung bearbeiten' : 'Eigene Übung'} onclose={() => (form = null)}>
  {#if form}
    <label for="ename">Name</label>
    <input id="ename" bind:value={form.name} />
    <label for="ekat">Art</label>
    <select id="ekat" bind:value={form.kategorie}>
      {#each Object.entries(KATEGORIEN) as [id, label]}<option value={id}>{label}</option>{/each}
    </select>
    {#if form.kategorie === 'ausdauer'}
      <label for="eeinheit">Strecke messen in</label>
      <select id="eeinheit" bind:value={form.einheit}>
        {#each Object.entries(EINHEITEN) as [id, label]}<option value={id}>{label}</option>{/each}
      </select>
      <p class="muted" style="margin: 6px 0 0">Im Training trägst du dann Dauer (Minuten) und Strecke ein, keine Sätze und kein Gewicht.</p>
    {/if}
    <label for="ebereich">Körperbereich (optional)</label>
    <input id="ebereich" bind:value={form.bereich} />
    <label for="evorgabe">Vorgabe (optional, z. B. {form.kategorie === 'ausdauer' ? '„locker, Puls unter 130“' : '„3 × 30 Sek“'})</label>
    <input id="evorgabe" bind:value={form.vorgabe} />
    <label for="enotiz">Anmerkung (optional)</label>
    <textarea id="enotiz" bind:value={form.notiz} style="min-height: 64px" placeholder="z. B. Hohlkreuz vermeiden, langsam ausführen"></textarea>
    <label for="evideo">YouTube-Link (optional)</label>
    <input id="evideo" type="url" inputmode="url" bind:value={form.video} placeholder="https://youtu.be/…" />
    {#if form.alt}
      {#if form.imPlan}<p class="muted" style="margin: 10px 0 0">Steht {form.imPlan === 1 ? 'einmal' : `${form.imPlan}-mal`} im Plan. Beim Löschen wird sie dort auch entfernt, vergangene Tage bleiben.</p>{/if}
      <div class="sheet-aktionen">
        <button class="sek gefahr" on:click={loeschen}>Löschen</button>
        <button on:click={bearbeitungSpeichern} disabled={!form.name.trim()}>Speichern</button>
      </div>
    {:else}
      <div class="sheet-aktionen"><button on:click={eigeneAnlegen} disabled={!form.name.trim()}>Anlegen{mehrfach ? ' und auswählen' : ''}</button></div>
    {/if}
  {/if}
</Sheet>

{#if mehrfach}
  <button class="sek breit" style="margin-top: 10px" on:click={fertig}>
    {auswahl.size ? 'Abbrechen' : params.planId ? 'Zurück zum Plan' : params.von === 'heute' ? 'Zurück zu Heute' : 'Zurück zum Kalender'}
  </button>
{/if}
