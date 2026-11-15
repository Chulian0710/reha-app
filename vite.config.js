import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

// Für GitHub Pages wird BASE_PATH im Workflow gesetzt (z. B. /reha-app/).
const base = process.env.BASE_PATH || '/';

export default defineConfig({
  base,
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      // pdf.js ist groß, soll aber offline verfügbar sein
      workbox: { maximumFileSizeToCacheInBytes: 5 * 1024 * 1024 },
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Reha',
        short_name: 'Reha',
        description: 'Reha- und Motivations-App. Alle Daten bleiben auf deinem Gerät.',
        lang: 'de',
        theme_color: '#2f6f6a',
        background_color: '#f6f4ef',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ]
});
