import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  // listen on every interface: localhost, 127.0.0.1, the LAN IP (phones on the same Wi-Fi)
  server: { host: true, port: 5174 },
  preview: { host: true, port: 5174 },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'), // lobby + Crystal Rave (lazy chunk)
        venue: resolve(import.meta.dirname, 'venue.html'), // Rap Việt seating map
      },
      output: {
        // three.js in its own long-cacheable chunk shared by both pages
        manualChunks: (id) => (id.includes('node_modules/three/build') ? 'three' : undefined),
      },
    },
  },
});
