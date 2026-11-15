<script>
  import { youtubeId, youtubeStart } from './youtube.js';

  export let url = '';

  // Das Video wird erst nach Tippen geladen. Vorher geht keine Anfrage an YouTube.
  let an = false;
  $: id = youtubeId(url);
  $: start = youtubeStart(url);
  $: src = id ? `https://www.youtube-nocookie.com/embed/${id}?playsinline=1&rel=0&modestbranding=1${start ? `&start=${start}` : ''}` : '';
</script>

{#if id}
  {#if an}
    <div class="video">
      <iframe
        {src}
        title="Übungsvideo"
        allow="encrypted-media; picture-in-picture; fullscreen"
        allowfullscreen
        referrerpolicy="strict-origin-when-cross-origin"
      ></iframe>
    </div>
    <button class="link" on:click={() => (an = false)}>Video schließen</button>
  {:else}
    <button class="sek breit" on:click={() => (an = true)}>▶ Video ansehen</button>
    <p class="muted" style="margin: 6px 0 0">Wird von YouTube geladen und braucht Internet.</p>
  {/if}
{:else if url}
  <p class="muted" style="margin: 0">Kein YouTube-Link erkannt. <a href={url} target="_blank" rel="noopener noreferrer">Link öffnen</a></p>
{/if}
