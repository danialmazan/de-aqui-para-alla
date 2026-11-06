/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served from GitHub Pages at danielalmazan.com/de-aqui-para-alla/. Two HTML
// entries so shared links carry their own language's preview (title,
// description, image) without JavaScript: / is Spanish, /en/ is English.
export default defineConfig({
  base: '/de-aqui-para-alla/',
  plugins: [react()],
  build: {
    target: 'es2022',
    sourcemap: false,
    rolldownOptions: { input: { es: 'index.html', en: 'en/index.html' } },
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
