import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    open: false,
    proxy: {
      '/api': 'http://127.0.0.1:3010',
    },
  },
});
