/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Future GitHub Pages path. Publishing is out of scope; this only keeps every
// asset URL base-relative from day one.
export default defineConfig({
  base: '/de-aqui-para-alla/',
  plugins: [react()],
  build: {
    target: 'es2022',
    sourcemap: false,
    rolldownOptions: { input: { es: 'index.html', en: 'en/index.html', specimen: 'specimen.html' } },
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
