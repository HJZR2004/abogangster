import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

const shared = { '@shared': resolve('src/shared') }

export default defineConfig({
  main: {
    resolve: { alias: shared }
  },
  preload: {
    resolve: { alias: shared },
    build: {
      // Sandboxed preload scripts must be CommonJS.
      rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } }
    }
  },
  renderer: {
    resolve: { alias: { ...shared, '@renderer': resolve('src/renderer/src') } },
    plugins: [react(), tailwindcss()]
  }
})
