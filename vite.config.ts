import { defineConfig } from 'vite';

// In development, /api goes to the account server (npm run server, or the Docker "api" service).
export default defineConfig({
  server: {
    proxy: {
      '/api': { target: process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3000' },
    },
  },
});
