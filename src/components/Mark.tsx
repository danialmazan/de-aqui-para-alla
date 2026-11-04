// The symbol: here (amber) → there (aqua), a dotted arc, and — when animated —
// one particle travelling between them. Also used as the loading indicator.

export function Mark({ size = 32, tile = true, animate = false, label }: { size?: number; tile?: boolean; animate?: boolean; label?: string }) {
  const arc = 'M9 22 Q9 8 23 11';
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {tile && <rect width="32" height="32" rx="6" fill="var(--night-0)" />}
      <path d={arc} fill="none" stroke="var(--muted)" strokeWidth={size < 24 ? 1.8 : 1.2} strokeLinecap="round" strokeDasharray={size < 24 ? undefined : '0 2.6'} opacity="0.8" />
      <circle cx="9" cy="22" r="3" fill="var(--aqui)" />
      <circle cx="23" cy="11" r="4.2" fill="var(--alla)" />
      {animate && (
        <circle r="1.5" fill="var(--ink)">
          <animateMotion path={arc} dur="1.6s" repeatCount="indefinite" calcMode="spline" keyPoints="0;1" keyTimes="0;1" keySplines="0.45 0 0.3 1" />
        </circle>
      )}
    </svg>
  );
}
