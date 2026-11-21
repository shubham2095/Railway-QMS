import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The React dev server proxies /api to the Express backend, so the session cookie
// is same-origin and no CORS setup is needed.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: process.env.VITE_API_TARGET || 'http://localhost:5000', changeOrigin: false },
    },
  },
});
