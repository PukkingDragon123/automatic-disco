import { defineConfig } from 'vite';

// Relative base so the build works from any static host path.
export default defineConfig({
  base: './',
  // NOHMR=1: no hot reload (stable headless screenshots while files change)
  server: { host: true, port: 5180, hmr: process.env.NOHMR ? false : undefined },
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 0,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 6000,
  },
});
