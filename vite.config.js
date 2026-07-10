import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        itt: resolve(__dirname, 'itt.html'),
        tti: resolve(__dirname, 'tti.html'),
        history: resolve(__dirname, 'history.html'),
        booth: resolve(__dirname, 'booth.html'),
        'booth-tti': resolve(__dirname, 'booth-tti.html'),
        'booth-gallery': resolve(__dirname, 'booth-gallery.html')
      }
    }
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    strictPort: true,
    allowedHosts: ['.ngrok-free.app', '.ngrok.io'], // Allow all ngrok domains
    // hmr: {
    //   clientPort: 443
    // }
  }
})
