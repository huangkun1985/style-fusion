// 全域播放時鐘（不放進 React state，避免每幀重繪元件）
type Fn = () => void;

class Clock {
  t = 0;
  playing = true;
  rate = 1;
  private last = 0;
  private subs = new Set<Fn>();

  tick(now: number) {
    if (this.last === 0) this.last = now;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.playing) this.t += dt * this.rate;
  }
  set(t: number) {
    this.t = Math.max(0, t);
    this.emit();
  }
  play(v = !this.playing) {
    this.playing = v;
    this.emit();
  }
  step(dt: number) {
    this.playing = false;
    this.t = Math.max(0, this.t + dt);
    this.emit();
  }
  setRate(r: number) {
    this.rate = r;
    this.emit();
  }
  on(fn: Fn) {
    this.subs.add(fn);
    return () => {
      this.subs.delete(fn);
    };
  }
  emit() {
    for (const f of this.subs) f();
  }
}

export const clock = new Clock();
