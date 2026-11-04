// Shared control grammar (family pattern: track + raised active chip,
// aria-pressed, ≥44px targets).

import type { ReactNode } from 'react';

export function Segmented<T extends string>({ label, options, value, onChange }: {
  label: string;
  options: { value: T; label: ReactNode; tone?: 'aqui' | 'alla' }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          data-tone={o.tone}
          onClick={() => onChange(o.value)}
        >
          {o.tone && <span className="seg-dot" aria-hidden="true" />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function PlayButton({ playing, onToggle, size = 56 }: { playing: boolean; onToggle: () => void; size?: number }) {
  return (
    <button className="play" style={{ width: size, height: size }} aria-label={playing ? 'Pausar' : 'Reproducir'} aria-pressed={playing} onClick={onToggle}>
      {playing
        ? <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="6" width="3.2" height="12" rx="1" /><rect x="13.8" y="6" width="3.2" height="12" rx="1" /></svg>
        : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" /></svg>}
    </button>
  );
}

export function Icon({ name }: { name: 'search' | 'close' | 'chevron' | 'sliders' | 'info' }) {
  const paths = {
    search: <><circle cx="10.5" cy="10.5" r="6" /><path d="m15 15 5 5" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    chevron: <path d="m7 10 5 5 5-5" />,
    sliders: <><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></>,
  };
  return (
    <svg className="icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}
