import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/newsreader/opsz.css';
import '@fontsource-variable/newsreader/opsz-italic.css';
import '@fontsource-variable/hanken-grotesk';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles/tokens.css';
import './styles/app.css';
import { App } from './App.tsx';

// Focus rings are for keyboard users. Browsers also show them after a click on
// a select or slider, so track the last kind of input and hide them after a pointer.
const root = document.documentElement;
addEventListener('pointerdown', () => { root.dataset.input = 'pointer'; }, true);
addEventListener('keydown', (e) => { if (!e.metaKey && !e.ctrlKey && !e.altKey) root.dataset.input = 'key'; }, true);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
