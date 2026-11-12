// 整支片子（2.0 β，F10）：把所有場景接成一支片子——每一場放多久、從哪一秒開始、怎麼轉場、配樂怎麼跟著場景走。
//
// - 每一場的長度：場景自己設的 dur（沒設＝一個動畫循環）。動畫是時間的純函數，所以一場放得比一個循環長，動畫就在裡面繼續循環。
// - 配樂：整支片子用第 1 場的音樂設定作一首「配樂」，每一場是一個段落（前奏、展開、高潮、回落…），段落邊界就是場景交界。
//   決定表第 15 項：預設「畫面遷就音樂」——每一場的長度吸到整數小節；可以切成「音樂遷就畫面」——長度不動，速度微調（最多 ±6%）讓總長剛好是整數小節。
//   名曲與匯入的 MIDI 照原曲循環（不能重新編排段落），場景一樣吸到它的小節線。
// - 淡轉場：進到某一場時，上一場繼續播、新的一場從 0 秒開始疊上來，fade 秒內由透明到不透明。
// - 這裡只算資料（純函數＋快取），畫圖在 drawFilmFrame，播放在 Stage 與 AudioBridge，導出在 exporter。
import { CueTracker } from '../audio/cues';
import { tempoFor } from '../audio/compose';
import { SECTION_NAME } from '../audio/arrange';
import { planAudio, sanitizeAudioPrefs, type AudioPlan } from '../audio/plan';
import { profileFor } from '../audio/profile';
import type { Cue, SectionKind } from '../audio/types';
import { MOTION_MAP } from '../data/motion';
import { VISUAL_MAP } from '../data/visual';
import { inScope, loopSeconds, Renderer, type FrameScope, type FrameSpec } from '../engine/renderer';
import { resolveLook, resolveMove } from '../engine/resolve';
import { SUBJECTS, subjectVersion } from '../engine/subjects';
import { themeOf, themes } from '../engine/themes';
import type { Look, Move, SubjectId, Tune } from '../engine/types';
import { FILM_DEFAULT, newId, SCENE_DUR, MAX_MARKERS, type FilmSettings, type Marker, type Scene } from './project';
import { anchorAt, markerTime } from './markers';
import { stashActive } from './scenes';
import { useStore } from './store';

type St = ReturnType<typeof useStore.getState>;

export interface FilmShot {
  id: string;
  name: string;
  index: number;
  /** 在片子裡的開始時間與長度（秒；已經吸到小節線） */
  start: number;
  dur: number;
  /** 使用者要的長度（吸附之前） */
  want: number;
  /** 一個動畫循環的秒數 */
  loop: number;
  trans: 'cut' | 'fade';
  /** 配樂的段落（小節數、名稱） */
  bars: number;
  section: string;
  subject: SubjectId;
  look: Look;
  move: Move;
  tune: Tune;
  scope?: FrameScope;
}

export interface FilmModel {
  shots: FilmShot[];
  total: number;
  fade: number;
  sync: FilmSettings['sync'];
  plan: AudioPlan;
  bpm: number;
  meter: 3 | 4;
  barSec: number;
  /** 配樂是否依場景重新編排段落（名曲與匯入的 MIDI 不行：照原曲循環） */
  scored: boolean;
  /** 「音樂遷就畫面」時速度改了多少（0.03＝快 3%） */
  drift: number;
  /** 給介面看的說明（例如速度改太多、退回畫面遷就音樂） */
  note: string;
  key: string;
  /** 標記算好的時間（黏在場景上的跟著場景走），依時間排好 */
  markers: { id: string; t: number; label: string; scene?: string }[];
}

const MAX_DRIFT = 0.06;

/** 段落種類：第一場前奏、最後一場回落，中間前半展開、後半高潮 */
function kindsFor(n: number): SectionKind[] {
  if (n === 1) return ['peak'];
  if (n === 2) return ['build2', 'outro'];
  if (n === 3) return ['intro', 'peak', 'outro'];
  const mid = n - 2;
  const out: SectionKind[] = ['intro'];
  for (let i = 0; i < mid; i++) out.push(i < Math.ceil(mid / 2) ? (i === 0 ? 'build' : 'build2') : 'peak');
  out.push('outro');
  return out;
}

/** 一個場景的畫面規格（看、動、微調、內容範圍） */
function shotSpec(sc: Scene, live: boolean, s: St): { subject: SubjectId; look: Look; move: Move; tune: Tune; scope?: FrameScope; loop: number } {
  const mx = sc.mix;
  const theme = mx.subject === 'custom' ? (live ? themes.current() : themeOf(sc.theme)) : null;
  const subject: SubjectId = mx.subject === 'custom' && !theme ? 'mascot' : mx.subject;
  const tune = mx.tune;
  const move = resolveMove(mx.m, MOTION_MAP, tune);
  const look = resolveLook(mx.v, VISUAL_MAP, tune, theme?.palette);
  // 目前場景的內容在全域那一份（不用另外指定）；其他場景用自己的
  const scope: FrameScope | undefined = live ? undefined : { content: mx.content ?? {}, ...(subject === 'custom' ? { theme } : {}) };
  const loop = inScope(scope, () => loopSeconds(SUBJECTS[subject], move, tune));
  void s;
  return { subject, look, move, tune, scope, loop };
}

let memo: { deps: unknown[]; model: FilmModel } | null = null;

/** 目前 store 的整支片子（有快取：同樣的內容不重算） */
export function filmModel(s: St = useStore.getState()): FilmModel {
  const deps = [s.scenes, s.activeScene, s.v, s.m, s.subject, s.tune, s.content, s.audio, s.film, s.themeRev, s.midiRev, subjectVersion(), themes.rev()];
  if (memo && memo.deps.length === deps.length && memo.deps.every((d, i) => d === deps[i])) return memo.model;
  const model = buildFilm(s);
  memo = { deps, model };
  return model;
}

function buildFilm(s: St): FilmModel {
  const film = s.film ?? FILM_DEFAULT;
  const scenes = stashActive(s);
  const specs = scenes.map((sc) => shotSpec(sc, sc.id === s.activeScene, s));
  const want = scenes.map((sc, i) => clampDur(sc.dur ?? specs[i].loop));
  const first = scenes[0].mix;
  const prefs = sanitizeAudioPrefs({ ...s.audio, ...first.music });
  const baseMove = resolveMove(first.m, MOTION_MAP, first.tune);
  const generated = prefs.piece === 'off';
  const n = scenes.length;
  let note = '';
  let sync = film.sync;
  let durs: number[];
  let bars: number[];
  let bpm: number;
  let meter: 3 | 4;
  let plan: AudioPlan;
  let drift = 0;
  if (generated) {
    const prof = profileFor(first.v, first.m, first.subject);
    const genre = prefs.genre === 'auto' ? prof.genre : prefs.genre;
    ({ bpm, meter } = tempoFor({ genre, seed: prefs.seed, tempo: prefs.tempo, bpmMul: prof.tempoMul, energyMul: prof.energyMul }));
    const barSec = (meter * 60) / bpm;
    if (sync === 'music') {
      const T = want.reduce((a, b) => a + b, 0);
      const N = Math.max(n, Math.round(T / barSec));
      const bpm2 = (N * meter * 60) / T;
      drift = bpm2 / bpm - 1;
      if (Math.abs(drift) > MAX_DRIFT) {
        note = `要讓音樂剛好配上畫面，速度得改 ${(drift * 100).toFixed(1)}%，超過 ±6%，所以這次改用「畫面遷就音樂」`;
        sync = 'picture';
        drift = 0;
      } else {
        bpm = bpm2;
        const bs = T / N;
        // 每一場的段落邊界吸到最近的小節線（每段至少 1 小節），畫面長度不動
        bars = [];
        let cum = 0;
        let prevB = 0;
        for (let i = 0; i < n; i++) {
          cum += want[i];
          const left = n - 1 - i;
          const b = i === n - 1 ? N : Math.min(N - left, Math.max(prevB + 1, Math.round(cum / bs)));
          bars.push(b - prevB);
          prevB = b;
        }
        durs = want.slice();
      }
    }
    if (sync === 'picture') {
      bars = want.map((w) => Math.max(1, Math.round(w / barSec)));
      durs = bars.map((b) => b * barSec);
    }
    const kinds = kindsFor(n);
    const parts = n === 1 ? [{ bars: bars![0], kind: 'peak' as SectionKind, name: SECTION_NAME.peak }] : bars!.map((b, i) => ({ bars: b, kind: kinds[i], name: SECTION_NAME[kinds[i]] }));
    plan = planAudio({ v: first.v, m: first.m, subject: first.subject, tune: first.tune, prefs, baseMove, film: { bpm, parts } });
    // 段落的實際總長＝整數小節；畫面遷就音樂時兩者相同，音樂遷就畫面時差在浮點誤差
    if (sync === 'picture') durs = bars!.map((b) => (b * plan.song.seconds) / plan.song.bars);
  } else {
    // 名曲／匯入的 MIDI：照原曲循環；場景吸到它的小節線
    plan = planAudio({ v: first.v, m: first.m, subject: first.subject, tune: first.tune, prefs, baseMove });
    bpm = plan.song.bpm;
    meter = plan.song.meter;
    const barSec = plan.song.seconds / plan.song.bars;
    bars = want.map((w) => Math.max(1, Math.round(w / barSec)));
    durs = bars.map((b) => b * barSec);
    if (film.sync === 'music') note = '名曲與匯入的 MIDI 照原曲演奏，不能改速度配合畫面；這次用「畫面遷就音樂」';
    sync = 'picture';
  }
  const kinds = generated ? kindsFor(n) : [];
  let t = 0;
  const shots: FilmShot[] = scenes.map((sc, i) => {
    const sp = specs[i];
    // 音樂的節拍脈動：和配樂的速度一致
    const move = sp.move.beat + sp.move.zoomPunch > 0.05 ? { ...sp.move, bpm } : sp.move;
    // 沒改過名（場景 N）的場景用內容的名字（和場景帶一樣）
    const contentName = sp.subject === 'custom' ? (sp.scope?.theme?.name ?? themes.current()?.name ?? SUBJECTS.custom.name) : SUBJECTS[sp.subject].name;
    const shot: FilmShot = {
      id: sc.id,
      name: /^場景 \d+$/.test(sc.name) ? contentName : sc.name,
      index: i,
      start: t,
      dur: durs[i],
      want: want[i],
      loop: sp.loop,
      trans: i > 0 && sc.trans === 'fade' ? 'fade' : 'cut',
      bars: bars[i],
      section: generated ? (n === 1 ? SECTION_NAME.peak : SECTION_NAME[kinds[i]]) : '原曲循環',
      subject: sp.subject,
      look: sp.look,
      move,
      tune: sp.tune,
      scope: sp.scope,
    };
    t += durs[i];
    return shot;
  });
  const barSec = plan.song.seconds / plan.song.bars;
  const markers = film.markers.map((m) => ({ id: m.id, label: m.label, scene: m.scene, t: markerTime(shots, t, m) })).sort((a, b) => a.t - b.t);
  return { shots, total: t, fade: film.fade, sync, plan, bpm, meter, barSec, scored: generated, drift, note, markers, key: `${plan.musicKey}|${shots.map((x) => `${x.id}:${x.dur.toFixed(3)}:${x.trans}`).join(',')}` };
}

export { anchorAt, markerTime };

export const clampDur = (x: number) => Math.min(SCENE_DUR.max, Math.max(SCENE_DUR.min, x));

/** 片子時間 t 的畫面：主要那一場、局部時間；淡轉場時另一場與它的不透明度 */
export function filmAt(model: FilmModel, t: number): { a: FilmShot; la: number; b: FilmShot | null; lb: number; k: number } {
  const T = model.total;
  const tt = T > 0 ? ((t % T) + T) % T : 0;
  let i = model.shots.findIndex((x) => tt >= x.start && tt < x.start + x.dur);
  if (i < 0) i = model.shots.length - 1;
  const cur = model.shots[i];
  const local = tt - cur.start;
  // 這一場是淡入的、而且還在淡入的時間內：上一場繼續播（局部時間接著走），這一場疊在上面
  if (cur.trans === 'fade' && i > 0 && local < model.fade) {
    const prev = model.shots[i - 1];
    const k = smoothstep(local / model.fade);
    return { a: prev, la: tt - prev.start, b: cur, lb: local, k };
  }
  return { a: cur, la: local, b: null, lb: 0, k: 0 };
}

const smoothstep = (x: number) => {
  const c = Math.max(0, Math.min(1, x));
  return c * c * (3 - 2 * c);
};

export const shotFrame = (sh: FilmShot, time: number, extra: Partial<FrameSpec> = {}): FrameSpec => ({ subject: sh.subject, look: sh.look, move: sh.move, tune: sh.tune, time, scope: sh.scope, ...extra });

/** 畫整支片子的一格（淡轉場時畫兩場再疊）。tmp 是暫存畫布（同尺寸，可重複用） */
export function drawFilmFrame(r: Renderer, ctx: CanvasRenderingContext2D, W: number, H: number, model: FilmModel, t: number, tmp: HTMLCanvasElement, extra: Partial<FrameSpec> = {}) {
  const f = filmAt(model, t);
  r.render(ctx, W, H, shotFrame(f.a, f.la, extra));
  if (f.b && f.k > 0.001) {
    if (tmp.width !== W) tmp.width = W;
    if (tmp.height !== H) tmp.height = H;
    const tc = tmp.getContext('2d');
    if (!tc) return;
    r.render(tc, W, H, shotFrame(f.b, f.lb, extra));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = f.k;
    ctx.drawImage(tmp, 0, 0, W, H);
    ctx.globalAlpha = 1;
  }
}

/** 3D 主體要先載入（導出前） */
export async function filmReady(r: Renderer, model: FilmModel) {
  for (const sh of model.shots) await r.ready(sh.subject);
}

// ---------- 音效提示點 ----------
/** 整支片子的音效：每一場各自的提示點，換到片子的時間。淡轉場期間兩場都可能觸發 */
export class FilmCues {
  private trackers: CueTracker[];
  constructor(
    private model: FilmModel,
    aspect: number,
  ) {
    this.trackers = model.shots.map((sh) => inScope(sh.scope, () => new CueTracker(sh.subject, sh.move, sh.tune, sh.look, aspect)));
  }
  /** 從 t0 走到 t1（片子的秒數）經過的提示點；跨過片尾或跳太遠就不觸發 */
  hits(t0: number, t1: number): Cue[] {
    const T = this.model.total;
    if (!(T > 0) || t1 <= t0 || t1 - t0 > 0.25) return [];
    const a = ((t0 % T) + T) % T;
    const b = a + (t1 - t0);
    if (b >= T) return [];
    const out: Cue[] = [];
    this.model.shots.forEach((sh, i) => {
      const end = sh.start + sh.dur + (this.model.shots[i + 1]?.trans === 'fade' ? this.model.fade : 0);
      if (b <= sh.start || a >= end) return;
      const tr = this.trackers[i];
      const l0 = Math.max(0, a - sh.start);
      const l1 = Math.min(end - sh.start, b - sh.start);
      if (l1 > l0) out.push(...tr.scan(tr.u(l0), tr.u(l1)));
    });
    return out;
  }
  /** 整支片子所有提示點（離線混音用） */
  timeline(seconds: number): { t: number; cue: Cue }[] {
    const out: { t: number; cue: Cue }[] = [];
    this.model.shots.forEach((sh, i) => {
      const end = sh.dur + (this.model.shots[i + 1]?.trans === 'fade' ? this.model.fade : 0);
      for (const h of this.trackers[i].timeline(end)) if (sh.start + h.t < seconds) out.push({ t: sh.start + h.t, cue: h.cue });
    });
    return out.sort((x, y) => x.t - y.t);
  }
}

// ---------- 編輯（都是一般的 store 變動，所以都進復原歷史） ----------
/** 改一場的長度（秒）；null＝回到一個動畫循環 */
export function setSceneDur(id: string, dur: number | null) {
  const s = useStore.getState();
  const scenes = stashActive(s).map((sc) => {
    if (sc.id !== id) return sc;
    const { dur: _d, ...rest } = sc;
    return dur === null ? rest : { ...rest, dur: Math.round(clampDur(dur) * 100) / 100 };
  });
  useStore.setState({ scenes });
}

export function setSceneTrans(id: string, trans: 'cut' | 'fade') {
  const s = useStore.getState();
  const scenes = stashActive(s).map((sc) => {
    if (sc.id !== id) return sc;
    const { trans: _t, ...rest } = sc;
    return trans === 'fade' ? { ...rest, trans } : rest;
  });
  useStore.setState({ scenes });
}

export function setFilm(p: Partial<FilmSettings>) {
  const s = useStore.getState();
  useStore.setState({ film: { ...s.film, ...p } });
}

export function addMarker(t: number, label = ''): string | null {
  const s = useStore.getState();
  if (s.film.markers.length >= MAX_MARKERS) return `標記最多 ${MAX_MARKERS} 個`;
  const model = filmModel(s);
  const tt = Math.round(Math.max(0, Math.min(t, model.total - 0.01)) * 100) / 100;
  if (model.markers.some((m) => Math.abs(m.t - tt) < 0.05)) return '這個時間已經有標記了';
  const markers = [...s.film.markers, { id: newId(), t: tt, label: label || `標記 ${s.film.markers.length + 1}`, ...anchorAt(model, tt) }].sort((a, b) => a.t - b.t);
  setFilm({ markers });
  return null;
}

/** 改標記：t＝搬到片子的這個時間（重新黏到那個時間所在的場景）；label＝改名 */
export function updateMarker(id: string, p: { t?: number; label?: string }) {
  const s = useStore.getState();
  const model = p.t !== undefined ? filmModel(s) : null;
  const markers = s.film.markers
    .map((m) => {
      if (m.id !== id) return m;
      let next: Marker = { ...m };
      if (p.t !== undefined && model) {
        const tt = Math.round(Math.max(0, Math.min(p.t, model.total - 0.01)) * 100) / 100;
        const { scene: _s, off: _o, ...rest } = next;
        next = { ...rest, t: tt, ...anchorAt(model, tt) };
      }
      if (p.label !== undefined) next.label = p.label.slice(0, 40);
      return next;
    })
    .sort((a, b) => a.t - b.t);
  setFilm({ markers });
}

export function deleteMarker(id: string) {
  const s = useStore.getState();
  setFilm({ markers: s.film.markers.filter((m) => m.id !== id) });
}

/** 片子時間 t 落在哪一場、那一場的局部時間 */
export function shotAt(model: FilmModel, t: number) {
  const f = filmAt(model, t);
  return f.b ?? f.a;
}

export const mmss = (x: number) => `${String(Math.floor(x / 60)).padStart(2, '0')}:${(x % 60).toFixed(2).padStart(5, '0')}`;
