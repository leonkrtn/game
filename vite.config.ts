import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `--mode single` bundles everything into one self-contained index.html.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [viteSingleFile()] : [],
  build: { outDir: mode === 'single' ? 'dist-single' : 'dist' },
}));
