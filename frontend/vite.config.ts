import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // In dev, /api is forwarded to the Express backend (see ../backend).
  server: { port: 5173, open: false, proxy: { '/api': { target: 'http://localhost:8000', changeOrigin: true } } },
  build: {
    rollupOptions: {
      output: {
        // Keep heavy vendor libs in their own chunks for faster first paint.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          motion: ['framer-motion'],
          charts: ['recharts'],
        },
      },
    },
  },
});
