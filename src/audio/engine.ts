// 播放引擎：Web Audio。BGM 先渲染成 AudioBuffer 再循環播放，並跟著動畫時間軸對齊；
// 音效在動畫經過提示點時觸發。時間軸拖曳、暫停、慢放都會即時跟上。
import type { Look, Move, SubjectId, Tune } from '../engine/types';
import { CueTracker } from './cues';
import type { Stereo } from './dsp';
import { mixdown } from './mixdown';
import type { AudioPlan } from './plan';
import { renderScheme } from './render';
import { synthSfx } from './sfx';
import { AUDIO_DEFAULT, SAMPLE_RATE, type AudioPrefs, type SchemeId, type SfxKind } from './types';

export interface EngineStatus {
  building: boolean;
  ready: boolean;
  error: string | null;
  renderMs: number;
  ctxState: string;
  /** 目前正在播放的 BGM 方案 */
  scheme: SchemeId | null;
  /** 正在試聽（含渲染中）的方案；沒有就是 null */
  audition: SchemeId | null;
}

export interface ScenePatch {
  prefs: AudioPrefs;
  plan: AudioPlan;
  subject: SubjectId;
  move: Move;
  tune: Tune;
  look: Look;
  aspect: number;
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private prefs: AudioPrefs = { ...AUDIO_DEFAULT };
  private plan: AudioPlan | null = null;
  private scene: ScenePatch | null = null;
  private tracker: CueTracker | null = null;
  private trackerKey: unknown[] = [];
  private pcm: Stereo | null = null;
  private pcmKey = '';
  private pcmScheme: SchemeId | null = null;
  private buf: AudioBuffer | null = null;
  private token = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private src: { node: AudioBufferSourceNode; gain: GainNode; t0: number; off: number; rate: number } | null = null;
  private sfxCache = new Map<string, AudioBuffer>();
  private lastT = -1;
  private lastPlaying = false;
  private audition: AudioBufferSourceNode | null = null;
  private listeners = new Set<() => void>();
  private waiting: Array<() => void> = [];
  status: EngineStatus = { building: false, ready: false, error: null, renderMs: 0, ctxState: 'none', scheme: null, audition: null };
  private auditionTok = 0;

  // ---------- 訂閱 ----------
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getStatus = () => this.status;
  private setStatus(p: Partial<EngineStatus>) {
    this.status = { ...this.status, ...p };
    for (const f of this.listeners) f();
  }

  // ---------- 內容環境 ----------
  /** 必須在使用者手勢（點擊）內呼叫，瀏覽器才允許出聲 */
  async unlock(): Promise<boolean> {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new AC({ latencyHint: 'interactive' });
        this.master = this.ctx.createGain();
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -10;
        comp.knee.value = 12;
        comp.ratio.value = 4;
        comp.attack.value = 0.004;
        comp.release.value = 0.2;
        this.bgmGain = this.ctx.createGain();
        this.sfxGain = this.ctx.createGain();
        this.bgmGain.connect(this.master);
        this.sfxGain.connect(this.master);
        this.master.connect(comp).connect(this.ctx.destination);
        this.ctx.onstatechange = () => this.setStatus({ ctxState: this.ctx?.state ?? 'none' });
        this.applyGains();
      }
      if (this.ctx.state !== 'running') await this.ctx.resume();
      this.setStatus({ ctxState: this.ctx.state });
      if (this.pcm && !this.buf) this.makeBuffer(this.pcm);
      return this.ctx.state === 'running';
    } catch (e) {
      this.setStatus({ error: `無法啟動音訊：${(e as Error).message}` });
      return false;
    }
  }

  private applyGains() {
    if (!this.ctx || !this.bgmGain || !this.sfxGain) return;
    const on = this.prefs.on;
    const t = this.ctx.currentTime;
    this.bgmGain.gain.setTargetAtTime(on && this.prefs.bgm ? this.prefs.bgmVol : 0, t, 0.03);
    this.sfxGain.gain.setTargetAtTime(on && this.prefs.sfx ? this.prefs.sfxVol : 0, t, 0.03);
  }

  configure(s: ScenePatch) {
    const prevPlan = this.plan;
    this.scene = s;
    this.prefs = s.prefs;
    this.plan = s.plan;
    const tk = [s.subject, s.move, s.tune, s.look, s.aspect];
    if (!this.tracker || tk.some((x, i) => x !== this.trackerKey[i])) {
      this.tracker = new CueTracker(s.subject, s.move, s.tune, s.look, s.aspect);
      this.trackerKey = tk;
    }
    this.applyGains();
    const wantBgm = s.prefs.on && s.prefs.bgm;
    if (!wantBgm) {
      this.stopBgm();
    } else if (!prevPlan || prevPlan.key !== s.plan.key || this.pcmKey !== s.plan.key) {
      this.scheduleBuild();
    }
  }

  // ---------- 渲染 BGM ----------
  private scheduleBuild() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.build(), 320);
    this.setStatus({ building: true, error: null });
  }

  /** 渲染目前計畫的 BGM（供播放與導出共用） */
  async build(): Promise<Stereo | null> {
    const plan = this.plan;
    if (!plan) return null;
    if (this.pcm && this.pcmKey === plan.key) {
      this.setStatus({ building: false, ready: true });
      return this.pcm;
    }
    const token = ++this.token;
    this.setStatus({ building: true, error: null });
    try {
      const t0 = performance.now();
      const pcm = await renderScheme(plan.song, plan.scheme, { sr: SAMPLE_RATE, seed: this.prefs.seed, yieldEvery: true });
      if (token !== this.token) return null;
      this.pcm = pcm;
      this.pcmKey = plan.key;
      this.pcmScheme = plan.scheme;
      this.buf = null;
      if (this.ctx) this.makeBuffer(pcm);
      this.stopBgm(true);
      this.setStatus({ building: false, ready: true, renderMs: Math.round(performance.now() - t0), scheme: plan.scheme });
      const resolve = this.waiting.splice(0);
      resolve.forEach((f) => f());
      return pcm;
    } catch (e) {
      if (token === this.token) this.setStatus({ building: false, error: `音樂渲染失敗：${(e as Error).message}` });
      return null;
    }
  }

  private makeBuffer(pcm: Stereo) {
    if (!this.ctx) return;
    const b = this.ctx.createBuffer(2, pcm.l.length, SAMPLE_RATE);
    b.copyToChannel(pcm.l as Float32Array<ArrayBuffer>, 0);
    b.copyToChannel(pcm.r as Float32Array<ArrayBuffer>, 1);
    this.buf = b;
  }

  currentPcm(): { pcm: Stereo; plan: AudioPlan } | null {
    return this.pcm && this.plan && this.pcmKey === this.plan.key ? { pcm: this.pcm, plan: this.plan } : null;
  }

  /** 等到目前計畫的 BGM 渲染完成（導出用） */
  async ensurePcm(): Promise<{ pcm: Stereo; plan: AudioPlan } | null> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const plan = this.plan;
    if (!plan) return null;
    await this.build();
    return this.currentPcm();
  }

  // ---------- 每幀同步 ----------
  frame(t: number, playing: boolean, rate: number) {
    if (!this.ctx) return;
    const p = this.prefs;
    if (p.on && p.sfx && this.plan?.pack && this.tracker && playing && this.lastPlaying && this.lastT >= 0 && Math.abs(t - this.lastT) < 0.25 && this.ctx.state === 'running') {
      const u0 = this.tracker.u(this.lastT);
      const u1 = this.tracker.u(t);
      for (const c of this.tracker.scan(u0, u1)) this.playSfx(c.kind, c.k, rate);
    }
    this.lastT = t;
    this.lastPlaying = playing;
    this.syncBgm(t, playing && p.on && p.bgm, rate);
  }

  private syncBgm(t: number, want: boolean, rate: number) {
    const ctx = this.ctx;
    // 試聽期間讓出聲道，避免兩首歌疊在一起
    if (!ctx || !this.buf || !want || this.audition || ctx.state !== 'running') {
      if (this.src) this.stopBgm();
      return;
    }
    const dur = this.buf.duration;
    const desired = ((t % dur) + dur) % dur;
    if (this.src && this.src.rate === rate && this.src.node.buffer === this.buf) {
      const cur = (this.src.off + (ctx.currentTime - this.src.t0) * this.src.rate) % dur;
      const diff = Math.abs(cur - desired);
      if (Math.min(diff, dur - diff) < 0.09) return;
    }
    this.startBgm(desired, rate);
  }

  private startBgm(offset: number, rate: number) {
    const ctx = this.ctx;
    if (!ctx || !this.buf || !this.bgmGain) return;
    this.stopBgm();
    const node = ctx.createBufferSource();
    node.buffer = this.buf;
    node.loop = true;
    node.playbackRate.value = rate;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(1, ctx.currentTime, 0.012);
    node.connect(gain).connect(this.bgmGain);
    node.start(0, offset);
    this.src = { node, gain, t0: ctx.currentTime, off: offset, rate };
  }

  private stopBgm(hard = false) {
    const s = this.src;
    if (!s || !this.ctx) {
      this.src = null;
      return;
    }
    const t = this.ctx.currentTime;
    try {
      s.gain.gain.cancelScheduledValues(t);
      s.gain.gain.setTargetAtTime(0, t, hard ? 0.005 : 0.02);
      s.node.stop(t + (hard ? 0.03 : 0.12));
    } catch {
      /* 已停止 */
    }
    this.src = null;
  }

  // ---------- 音效 ----------
  private sfxBuffer(kind: SfxKind, variant: number): AudioBuffer | null {
    const pack = this.plan?.pack;
    if (!this.ctx || !pack) return null;
    const key = `${pack}|${kind}|${variant}`;
    let b = this.sfxCache.get(key);
    if (!b) {
      const data = synthSfx(pack, kind, SAMPLE_RATE, variant);
      b = this.ctx.createBuffer(1, data.length, SAMPLE_RATE);
      b.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
      this.sfxCache.set(key, b);
      if (this.sfxCache.size > 120) this.sfxCache.clear();
    }
    return b;
  }

  playSfx(kind: SfxKind, k = 1, rate = 1) {
    if (!this.ctx || !this.sfxGain) return;
    const b = this.sfxBuffer(kind, Math.random() < 0.5 ? 0 : 1);
    if (!b) return;
    const node = this.ctx.createBufferSource();
    node.buffer = b;
    node.playbackRate.value = rate * (1 + (Math.random() - 0.5) * 0.04);
    const g = this.ctx.createGain();
    g.gain.value = Math.min(1.2, 0.3 + k * 0.8);
    node.connect(g).connect(this.sfxGain);
    node.start();
  }

  /**
   * 試聽：不看時間軸，直接播一次目前這首（或指定方案的版本）。
   * 再按一次同一個方案就停止（所以介面上的按鈕是「播放 / 暫停」切換）。即使主畫面暫停，也可以單獨聽。
   */
  async auditionScheme(scheme: SchemeId): Promise<void> {
    const plan = this.plan;
    if (!plan || !this.ctx || !this.master) return;
    if (this.status.audition === scheme) {
      this.stopAudition();
      return;
    }
    this.stopAudition();
    const tok = ++this.auditionTok;
    this.setStatus({ building: true, error: null, audition: scheme });
    try {
      const pcm = scheme === plan.scheme && this.currentPcm() ? this.currentPcm()!.pcm : await renderScheme(plan.song, scheme, { sr: SAMPLE_RATE, seed: this.prefs.seed, yieldEvery: true });
      if (tok !== this.auditionTok) return; // 渲染期間被取消了
      const b = this.ctx.createBuffer(2, pcm.l.length, SAMPLE_RATE);
      b.copyToChannel(pcm.l as Float32Array<ArrayBuffer>, 0);
      b.copyToChannel(pcm.r as Float32Array<ArrayBuffer>, 1);
      const node = this.ctx.createBufferSource();
      node.buffer = b;
      this.stopBgm();
      const g = this.ctx.createGain();
      g.gain.value = this.prefs.bgmVol;
      node.connect(g).connect(this.master);
      node.start();
      node.onended = () => {
        if (this.audition === node) {
          this.audition = null;
          this.setStatus({ audition: null });
        }
      };
      this.audition = node;
    } catch (e) {
      if (tok === this.auditionTok) this.setStatus({ error: `試聽失敗：${(e as Error).message}`, audition: null });
    } finally {
      if (tok === this.auditionTok) this.setStatus({ building: false });
    }
  }
  /** 分頁隱藏時停掉聲音，避免背景裡一直響 */
  pauseAll() {
    this.stopBgm();
    this.stopAudition();
    this.lastPlaying = false;
  }
  stopAudition() {
    this.auditionTok++;
    try {
      this.audition?.stop();
    } catch {
      /* 已停止 */
    }
    this.audition = null;
    if (this.status.audition) this.setStatus({ audition: null, building: false });
  }

  // ---------- 導出 ----------
  /** 混出 seconds 秒的音訊（BGM＋音效），供 WAV／影片使用 */
  async exportMix(seconds: number): Promise<Stereo | null> {
    const got = await this.ensurePcm();
    if (!this.scene || !this.tracker) return null;
    const p = this.prefs;
    return mixdown({
      seconds,
      sr: SAMPLE_RATE,
      bgm: p.bgm ? (got?.pcm ?? null) : null,
      bgmVol: p.bgmVol,
      tracker: p.sfx ? this.tracker : null,
      pack: this.plan?.pack ?? null,
      sfxVol: p.sfxVol,
    });
  }
}

export const audioEngine = new AudioEngine();
