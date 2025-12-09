import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        itt: resolve(__dirname, 'itt.html'),
        tti: resolve(__dirname, 'tti.html'),
        history: resolve(__dirname, 'history.html')
      }
    }
  },
  server: {
    port: 5173
  }
})
