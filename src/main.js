import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { bitteUmDauerhaftenSpeicher } from './lib/db.js';
import { ersteinrichtung } from './lib/abzeichen.js';

bitteUmDauerhaftenSpeicher();
ersteinrichtung();

// Kurzes Einfärben beim Antippen, damit man sieht, dass der Klick angekommen ist.
// :active allein ist auf dem Handy oft zu kurz sichtbar.
document.addEventListener(
  'pointerdown',
  (ev) => {
    const b = ev.target.closest && ev.target.closest('button');
    if (!b || b.disabled) return;
    b.classList.add('gedrueckt');
    setTimeout(() => b.classList.remove('gedrueckt'), 220);
  },
  { passive: true }
);

const app = mount(App, { target: document.getElementById('app') });

export default app;
