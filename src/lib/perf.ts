// Frame-time sampler for the `?perf` overlay and Playwright benchmarks. Results
// are mirrored onto <html data-*> attributes so tests can read them.

export type PerfSnapshot = { fps: number; p50: number; p95: number; frames: number };

export function startPerfSampler(onSample: (s: PerfSnapshot) => void, windowFrames = 180) {
  const samples: number[] = [];
  let last = 0;
  let raf = 0;
  let frames = 0;
  const tick = (t: number) => {
    if (last) {
      samples.push(t - last);
      if (samples.length > windowFrames) samples.shift();
      frames++;
      if (frames % 30 === 0) {
        const sorted = [...samples].sort((a, b) => a - b);
        const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
        const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
        const snap = { fps: 1000 / mean, p50: q(0.5), p95: q(0.95), frames };
        const root = document.documentElement.dataset;
        root.p50FrameMs = snap.p50.toFixed(2);
        root.p95FrameMs = snap.p95.toFixed(2);
        root.fps = snap.fps.toFixed(1);
        onSample(snap);
      }
    }
    last = t;
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
