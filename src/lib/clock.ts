// The shared 24-hour clock. One requestAnimationFrame loop advances it; the map
// layer reads `clock.hour` every frame and React subscribes for UI.

export const SECONDS_PER_HOUR = 2.4;

type Listener = () => void;

class Clock {
  hour = 8;
  playing = true;
  private listeners = new Set<Listener>();
  private last = 0;
  private raf = 0;

  start() {
    const tick = (t: number) => {
      if (this.last && this.playing) {
        const dt = Math.min(0.1, (t - this.last) / 1000);
        this.hour = (this.hour + dt / SECONDS_PER_HOUR) % 24;
        this.emit();
      }
      this.last = t;
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
    const onVisibility = () => { if (document.hidden) this.last = 0; };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelAnimationFrame(this.raf);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }

  setPlaying(playing: boolean) {
    this.playing = playing;
    this.emit();
  }

  /** Manual selection pauses playback (plan §5). */
  seek(hour: number) {
    this.hour = ((hour % 24) + 24) % 24;
    this.playing = false;
    this.emit();
  }

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  private emit() {
    this.listeners.forEach((l) => l());
  }
}

export const clock = new Clock();
