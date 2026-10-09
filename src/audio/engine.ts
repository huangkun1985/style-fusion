// 播放引擎：Web Audio。BGM 先渲染成 AudioBuffer 再循環播放，並跟著動畫時間軸對齊；
// 音效在動畫經過提示點時觸發。時間軸拖曳、暫停、慢放都會即時跟上。
import type { Look, Move, SubjectId, Tune } from '../engine/types';
import { subjectVersion } from '../engine/subjects';
import { themes } from '../engine/themes';
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
  /** 從排程到喇叭真正出聲的延遲（秒）：畫面要跟聲音對拍時用（音樂視覺化） */
  latency(): number {
    const c = this.ctx as (AudioContext & { outputLatency?: number }) | null;
    if (!c || c.state !== 'running') return 0;
    return (c.outputLatency || 0) + (c.baseLatency || 0);
  }
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
  private auditionGain: GainNode | null = null;
  private auditionTimer: ReturnType<typeof setTimeout> | null = null;
  /** 最近渲染過的音樂（BGM 與試聽共用，同一首歌不會算兩次；也讓來回切換曲風時秒切） */
  private renders = new Map<string, { p: Promise<Stereo>; ms: number }>();
  private listeners = new Set<() => void>();
  private waiting: Array<() => void> = [];
  status: EngineStatus = { building: false, ready: false, error: null, renderMs: 0, ctxState: 'none', scheme: null, audition: null };
  private auditionTok = 0;
  /** 下一次換歌時，讓試聽改用新計畫的聲音方案（靈感骰子用） */
  snapAudition = false;

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
    this.auditionGain?.gain.setTargetAtTime(this.prefs.bgmVol, t, 0.03);
    this.sfxGain.gain.setTargetAtTime(on && this.prefs.sfx ? this.prefs.sfxVol : 0, t, 0.03);
  }

  configure(s: ScenePatch) {
    const prevPlan = this.plan;
    const wasOn = this.prefs.on;
    this.scene = s;
    this.prefs = s.prefs;
    this.plan = s.plan;
    // 自訂主題的音效點來自主題檔：匯入、切換、刪除主題後要重新建立（themes.rev 每次變動都會加一）
    const tk = [s.subject, s.move, s.tune, s.look, s.aspect, themes.rev(), subjectVersion()];
    if (!this.tracker || tk.some((x, i) => x !== this.trackerKey[i])) {
      this.tracker = new CueTracker(s.subject, s.move, s.tune, s.look, s.aspect);
      this.trackerKey = tk;
    }
    this.applyGains();
    // 試聽中換了曲風、調性、速度、種子…：試聽跟著換成新的歌，不必先停止再重按
    if (prevPlan && prevPlan.songKey !== s.plan.songKey && this.status.audition) {
      // 靈感骰子：試聽的方案跟著新抽到的聲音方案走，不然會一直停在按下試聽的那個方案（例如永遠是 8-bit）
      if (this.snapAudition) this.setStatus({ audition: s.plan.scheme });
      this.followAudition();
    }
    this.snapAudition = false;
    // 主開關從開變關：連試聽一起停
    if (wasOn && !s.prefs.on && this.status.audition) this.stopAudition();
    const wantBgm = s.prefs.on && s.prefs.bgm;
    if (!wantBgm) {
      this.stopBgm();
    } else if (!prevPlan || prevPlan.musicKey !== s.plan.musicKey || this.pcmKey !== s.plan.musicKey) {
      this.scheduleBuild();
    }
  }

  // ---------- 渲染（含快取） ----------
  /** 把這首歌用指定的聲音方案渲染出來。同一首歌 + 同一方案只算一次（有最近 4 筆的快取） */
  private renderFor(plan: AudioPlan, scheme: SchemeId): { p: Promise<Stereo>; ms: number } {
    const key = `${plan.songKey}|${scheme}`;
    const hit = this.renders.get(key);
    if (hit) {
      this.renders.delete(key);
      this.renders.set(key, hit);
      return hit;
    }
    const entry = { p: null as unknown as Promise<Stereo>, ms: 0 };
    const t0 = performance.now();
    entry.p = renderScheme(plan.song, scheme, { sr: SAMPLE_RATE, seed: this.prefs.seed, yieldEvery: true }).then((pcm) => {
      entry.ms = Math.round(performance.now() - t0);
      return pcm;
    });
    this.renders.set(key, entry);
    entry.p.catch(() => this.renders.delete(key));
    while (this.renders.size > 4) this.renders.delete(this.renders.keys().next().value as string);
    return entry;
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
    if (this.pcm && this.pcmKey === plan.musicKey) {
      this.setStatus({ building: false, ready: true });
      return this.pcm;
    }
    const token = ++this.token;
    this.setStatus({ building: true, error: null });
    try {
      const r = this.renderFor(plan, plan.scheme);
      const pcm = await r.p;
      if (token !== this.token) return null;
      this.pcm = pcm;
      this.pcmKey = plan.musicKey;
      this.pcmScheme = plan.scheme;
      this.buf = null;
      if (this.ctx) this.makeBuffer(pcm);
      this.stopBgm(true);
      this.setStatus({ building: false, ready: true, renderMs: r.ms, scheme: plan.scheme });
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
    return this.pcm && this.plan && this.pcmKey === this.plan.musicKey ? { pcm: this.pcm, plan: this.plan } : null;
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
   * 試聽（播放／暫停切換）：不看時間軸，直接把目前這首歌用指定的聲音方案循環播放，主畫面暫停時也能單獨聽。
   * 再按一次同一個方案就停止；按另一個方案則換過去。試聽中如果換了曲風、調性、速度或重新作曲，
   * 會自動改播新的那首（見 followAudition），不需要先停止再重按。
   */
  async auditionScheme(scheme: SchemeId): Promise<void> {
    if (!this.plan || !this.ctx || !this.master) return;
    if (this.status.audition === scheme) {
      this.stopAudition();
      return;
    }
    await this.runAudition(scheme);
  }

  /** 渲染並開始播放試聽；如果已經有試聽在播，新的淡入、舊的淡出 */
  private async runAudition(scheme: SchemeId): Promise<void> {
    const plan = this.plan;
    const ctx = this.ctx;
    if (!plan || !ctx || !this.master) return;
    const tok = ++this.auditionTok;
    this.setStatus({ building: true, error: null, audition: scheme });
    try {
      const pcm = await this.renderFor(plan, scheme).p;
      if (tok !== this.auditionTok) return; // 渲染期間被取消，或歌又換了
      const b = ctx.createBuffer(2, pcm.l.length, SAMPLE_RATE);
      b.copyToChannel(pcm.l as Float32Array<ArrayBuffer>, 0);
      b.copyToChannel(pcm.r as Float32Array<ArrayBuffer>, 1);
      const node = ctx.createBufferSource();
      node.buffer = b;
      node.loop = true;
      const g = ctx.createGain();
      g.gain.value = 0;
      g.gain.setTargetAtTime(this.prefs.bgmVol, ctx.currentTime, 0.012);
      node.connect(g).connect(this.master);
      node.start();
      node.onended = () => {
        if (this.audition === node) {
          this.audition = null;
          this.auditionGain = null;
          this.setStatus({ audition: null });
        }
      };
      this.fadeOutAudition();
      this.audition = node;
      this.auditionGain = g;
      this.stopBgm();
    } catch (e) {
      if (tok === this.auditionTok) {
        this.fadeOutAudition();
        this.setStatus({ error: `試聽失敗：${(e as Error).message}`, audition: null });
      }
    } finally {
      if (tok === this.auditionTok) this.setStatus({ building: false });
    }
  }

  /** 試聽中歌換了：稍等一下（拖曳速度滑桿時不要每動一格就重算），再用同一個方案播新的歌 */
  private followAudition() {
    const scheme = this.status.audition;
    if (!scheme) return;
    this.auditionTok++; // 讓還在渲染的舊歌作廢，舊的聲音繼續播到新的準備好為止
    this.setStatus({ building: true });
    if (this.auditionTimer) clearTimeout(this.auditionTimer);
    this.auditionTimer = setTimeout(() => {
      this.auditionTimer = null;
      if (this.status.audition === scheme) void this.runAudition(scheme);
    }, 200);
  }

  /** 把目前的試聽聲音淡出並停掉（不會有「啪」一聲） */
  private fadeOutAudition() {
    const node = this.audition;
    const g = this.auditionGain;
    this.audition = null;
    this.auditionGain = null;
    if (!node) return;
    try {
      if (this.ctx && g) {
        g.gain.cancelScheduledValues(this.ctx.currentTime);
        g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.015);
        node.stop(this.ctx.currentTime + 0.1);
      } else node.stop();
    } catch {
      /* 已停止 */
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
    if (this.auditionTimer) {
      clearTimeout(this.auditionTimer);
      this.auditionTimer = null;
    }
    this.fadeOutAudition();
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

/** 靈感骰子抽完音樂後呼叫：正在試聽的話，試聽改播新抽到的方案 */
export function snapAuditionToPlan() {
  if (audioEngine.status.audition) audioEngine.snapAudition = true;
}
