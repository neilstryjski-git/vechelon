import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// W192: the Rail 3 staging fleet build (VITE_RAIL3_FLEET_ENABLED=true) self-
// destructs its service worker so frequent redeploys are never masked by a stale
// PWA cache — selfDestroying emits a SW that unregisters itself and clears caches.
// Production builds (flag unset) keep the normal offline PWA untouched.
const STAGING_FLEET_BUILD = process.env.VITE_RAIL3_FLEET_ENABLED === 'true'

// https://vite.dev/config/
export default defineConfig({
  base: '/portal/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      selfDestroying: STAGING_FLEET_BUILD,
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'VEcheLOn Admin',
        short_name: 'VEcheLOn',
        description: 'Tactical Command Centre for Group Rides',
        theme_color: '#000000',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
})
