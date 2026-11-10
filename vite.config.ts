import { defineConfig } from 'vite';

// Relative base so the build works under https://<user>.github.io/<repo>/
export default defineConfig({
  base: './',
  build: {
    // The 3D view's Three.js chunk is large on purpose: it loads only when the 3D view is chosen.
    chunkSizeWarningLimit: 700,
  },
});
