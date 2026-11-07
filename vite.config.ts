import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const aiProxyPort = Number(process.env.AI_PROXY_PORT || 8080);

export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: {
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: `http://localhost:${aiProxyPort}`,
        changeOrigin: true,
        timeout: 120000,
        proxyTimeout: 120000,
      },
    },
  },
});
