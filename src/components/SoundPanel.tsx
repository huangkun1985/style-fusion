// 「聲音」分頁：BGM／音效開關與音量、聲音方案、曲風、節奏、音效包、鋼琴捲簾預覽與導出。
import { Dices, Download, Loader2, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CueTracker } from '../audio/cues';
import { audioEngine } from '../audio/engine';
import { makeAudioFile, type AudioFileKind } from '../audio/files';
import { GENRES } from '../audio/genres';
import { SCHEME_INFO } from '../audio/render';
import { PACK_INFO, SFX_KINDS } from '../audio/sfx';
import { NOTE_NAMES, type GenreId, type PackId, type SchemeId, type Song, type TrackRole } from '../audio/types';
import { clock } from '../engine/clock';
import { saveBlob } from '../lib/platform';
import { toggleSound, useEngineStatus } from '../lib/sound';
import { useAudioPlan, useLookMove } from '../store/hooks';
import { useStore } from '../store/store';
import { ASPECT } from './Stage';
import { Button, SectionTitle, Slider } from './ui';

const ROLE_COLOR: Record<TrackRole, string> = {
  lead: '#6cd4ff',
  counter: '#9aa5ff',
  arp: '#ffb648',
  bass: '#ff6b57',
  pad: '#5fe0a8',
  chord: '#e58bff',
  perc: '#cfd3e1',
};
/** 曲風分組（每個曲風只出現一次；順序固定，點選不會改變排版） */
const GENRE_GROUPS: { name: string; ids: GenreId[] }[] = [
  { name: '流行與人聲系', ids: ['pop', 'kpop', 'jpop', 'cpop', 'kawaii', 'ballad', 'rnb', 'citypop', 'acoustic'] },
  { name: '舞曲與電子', ids: ['house', 'disco', 'trap', 'hiphop', 'funk', 'synthwave', 'techno', 'cyber', 'vapor'] },
  { name: '搖滾、爵士與世界', ids: ['rock', 'jazz', 'bossa', 'reggae', 'latin', 'lofi', 'folk', 'ragtime'] },
  { name: '管弦、氛圍與東方', ids: ['cinematic', 'classical', 'wonder', 'hero', 'ambient', 'eastern'] },
  { name: '遊戲與復古', ids: ['chipAdventure', 'chipDark'] },
];

const ROLE_NAME: Record<TrackRole, string> = { lead: '主旋律', counter: '和聲', arp: '琶音', bass: '低音', pad: '鋪底', chord: '和弦', perc: '打擊' };

// ---------- 鋼琴捲簾 ----------
function PianoRoll({ song }: { song: Song }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { look, move, tune } = useLookMove();
  const subject = useStore((s) => s.subject);
  const aspect = useStore((s) => s.aspect);
  const cues = useMemo(() => new CueTracker(subject, move, tune, look, ASPECT[aspect]).cues, [subject, move, tune, look, aspect]);
  const stRef = useRef({ song, cues });
  stRef.current = { song, cues };

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const { song: sg, cues: cs } = stRef.current;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = cv.clientWidth;
      const H = cv.clientHeight;
      if (cv.width !== Math.round(W * dpr)) cv.width = Math.round(W * dpr);
      if (cv.height !== Math.round(H * dpr)) cv.height = Math.round(H * dpr);
      const g = cv.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      const css = getComputedStyle(document.documentElement);
      const line = css.getPropertyValue('--line').trim() || '#333';
      const fg3 = css.getPropertyValue('--fg-3').trim() || '#888';
      const top = 14;
      const cueH = 12;
      const drumH = 14;
      const noteH = H - top - cueH - drumH - 4;
      const X = (step: number) => (step / sg.steps) * W;
      // 小節線與和弦
      g.font = '9px "JetBrains Mono", monospace';
      g.textBaseline = 'top';
      for (let b = 0; b <= sg.bars; b++) {
        g.strokeStyle = line;
        g.lineWidth = b % 4 === 0 ? 1.2 : 0.6;
        g.beginPath();
        g.moveTo(X(b * sg.stepsPerBar), top);
        g.lineTo(X(b * sg.stepsPerBar), H);
        g.stroke();
      }
      g.fillStyle = fg3;
      for (const c of sg.chords) g.fillText(c.label, X(c.bar * sg.stepsPerBar + c.step) + 3, 2);
      // 旋律音符
      let lo = 127;
      let hi = 0;
      for (const t of sg.tracks) if (!t.drum) for (const n of t.notes) {
        lo = Math.min(lo, n.pitch);
        hi = Math.max(hi, n.pitch);
      }
      if (hi <= lo) hi = lo + 12;
      const Y = (p: number) => top + noteH - ((p - lo) / (hi - lo)) * (noteH - 4) - 3;
      for (const t of sg.tracks) {
        if (t.drum) continue;
        g.fillStyle = ROLE_COLOR[t.role];
        g.globalAlpha = t.role === 'pad' ? 0.35 : 0.9;
        for (const n of t.notes) g.fillRect(X(n.t), Y(n.pitch), Math.max(1.5, X(n.dur) - 0.6), t.role === 'pad' ? 2 : 3);
      }
      g.globalAlpha = 1;
      // 鼓
      const dy = top + noteH + 3;
      g.fillStyle = ROLE_COLOR.perc;
      for (const t of sg.tracks) {
        if (!t.drum) continue;
        for (const n of t.notes) {
          const row = n.pitch <= 36 ? 0 : n.pitch <= 40 ? 1 : 2;
          g.globalAlpha = 0.4 + n.vel * 0.5;
          g.fillRect(X(n.t), dy + row * 4, 2, 3);
        }
      }
      g.globalAlpha = 1;
      // 動畫提示點
      const cy = H - cueH + 1;
      g.fillStyle = '#ffb648';
      const k = Math.max(1, sg.animLoops || 1);
      for (let i = 0; i < k; i++)
        for (const c of cs) {
          const x = ((i + c.u) / k) * W;
          g.beginPath();
          g.moveTo(x, cy);
          g.lineTo(x + 3.5, cy + 8);
          g.lineTo(x - 3.5, cy + 8);
          g.closePath();
          g.fill();
        }
      // 播放頭
      const x = ((clock.t % sg.seconds) / sg.seconds) * W;
      g.strokeStyle = '#ffffff';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, H);
      g.stroke();
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="h-[132px] w-full rounded-lg border border-line bg-panel-2" aria-label="歌曲預覽：音符、和弦與動畫音效提示點" role="img" />;
}

// ---------- 主面板 ----------
export function SoundTab() {
  const { plan, prefs } = useAudioPlan();
  const setAudio = useStore((s) => s.setAudio);
  const showToast = useStore((s) => s.showToast);
  const status = useEngineStatus();
  const [busy, setBusy] = useState<string | null>(null);
  const song = plan.song;
  const effScheme = plan.scheme;

  const exportFile = async (kind: AudioFileKind) => {
    setBusy(kind);
    try {
      const { blob, name } = await makeAudioFile(kind, plan, song.seconds * Math.max(1, Math.ceil(8 / song.seconds)));
      saveBlob(blob, name);
      showToast(`已導出 ${name}`);
    } catch (e) {
      showToast(`導出失敗：${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const schemeIds = Object.keys(SCHEME_INFO) as SchemeId[];
  const packIds = Object.keys(PACK_INFO) as PackId[];
  const total = song.animLoops ? `${song.animLoops} 次動畫循環 = ${song.bars} 小節` : `${song.bars} 小節（未與動畫對齊）`;

  return (
    <div className="flex flex-col gap-5 pb-4">
      {/* 主開關 */}
      <div className="flex flex-col gap-3 rounded-xl border border-line bg-panel-2 p-3">
        <div className="flex items-center justify-between gap-3">
          <Button variant={prefs.on ? 'primary' : 'outline'} onClick={() => void toggleSound()}>
            {prefs.on ? <Volume2 size={16} /> : <VolumeX size={16} />}
            聲音 {prefs.on ? '已開啟' : '已關閉'}
          </Button>
          <div className="min-w-0 text-right text-[11px] text-fg-3">
            {status.error ? <span className="text-danger">{status.error}</span> : status.building ? <span className="inline-flex items-center gap-1"><Loader2 size={12} className="animate-spin" />作曲渲染中…</span> : prefs.on && status.ctxState !== 'running' ? '點上方按鈕啟動音訊' : status.ready ? `已就緒 · 渲染 ${status.renderMs}ms` : ''}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <label htmlFor="snd-bgm" className="flex items-center gap-2 text-[13px]">
            <input id="snd-bgm" type="checkbox" checked={prefs.bgm} onChange={(e) => setAudio({ bgm: e.target.checked })} className="size-4 accent-[var(--mot)]" />
            背景音樂
          </label>
          <label htmlFor="snd-sfx" className="flex items-center gap-2 text-[13px]">
            <input id="snd-sfx" type="checkbox" checked={prefs.sfx} onChange={(e) => setAudio({ sfx: e.target.checked })} className="size-4 accent-[var(--mot)]" />
            動畫音效
          </label>
          <Slider id="snd-bgm-vol" label="音樂音量" min={0} max={1} step={0.02} value={prefs.bgmVol} onChange={(x) => setAudio({ bgmVol: x })} format={(x) => `${Math.round(x * 100)}%`} tone="mot" />
          <Slider id="snd-sfx-vol" label="音效音量" min={0} max={1} step={0.02} value={prefs.sfxVol} onChange={(x) => setAudio({ sfxVol: x })} format={(x) => `${Math.round(x * 100)}%`} tone="mot" />
        </div>
      </div>

      {/* 目前的歌 */}
      <div>
        <SectionTitle right={<span className="num text-[11px] text-fg-3">{total}</span>}>目前的音樂</SectionTitle>
        <p className="font-display text-[15px] font-bold leading-snug">{song.title}</p>
        <div className="mt-2">
          <PianoRoll song={song} />
        </div>
        <div className="mt-1.5 flex min-h-[2.6rem] flex-wrap content-start gap-x-3 gap-y-1 text-[11px] text-fg-3">
          {(['lead', 'counter', 'arp', 'bass', 'pad', 'chord', 'perc'] as TrackRole[])
            .filter((r) => song.tracks.some((t) => t.role === r))
            .map((r) => (
              <span key={r} className="flex items-center gap-1">
                <span className="inline-block size-2 rounded-sm" style={{ background: ROLE_COLOR[r] }} />
                {ROLE_NAME[r]}
              </span>
            ))}
          <span className="flex items-center gap-1">
            <span className="inline-block h-0 w-0 border-x-[4px] border-b-[7px] border-x-transparent border-b-mot" />
            動畫音效點
          </span>
        </div>
        <ul className="mt-2 min-h-[4.5rem] space-y-0.5 text-[12px] leading-relaxed text-fg-2">
          {plan.profile.reasons.map((r) => (
            <li key={r} className="flex gap-2">
              <span className="mt-[7px] size-1 shrink-0 rounded-full bg-fg-3" />
              {r}
            </li>
          ))}
        </ul>
      </div>

      {/* 聲音方案 */}
      <div>
        <SectionTitle>聲音方案</SectionTitle>
        <AutoRow on={prefs.scheme === 'auto'} onClick={() => setAudio({ scheme: 'auto' })} now={SCHEME_INFO[effScheme].name} />
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          {schemeIds.map((id) => {
            const playing = status.audition === id;
            const loading = playing && status.building;
            return (
              <div key={id} className={`relative rounded-lg border p-2 transition-colors ${prefs.scheme === id ? 'border-mot bg-mot-soft' : 'border-line bg-panel-2 hover:border-line-2'}`}>
                <button type="button" aria-pressed={prefs.scheme === id} onClick={() => setAudio({ scheme: id })} className="block w-full pr-8 text-left">
                  <div className="text-[13px] font-semibold">{SCHEME_INFO[id].name}</div>
                  <div className="text-[11px] leading-snug text-fg-3">{SCHEME_INFO[id].tag}</div>
                </button>
                <button
                  type="button"
                  aria-label={playing ? `停止試聽 ${SCHEME_INFO[id].name}` : `試聽 ${SCHEME_INFO[id].name}`}
                  aria-pressed={playing}
                  title={playing ? '停止試聽' : '試聽這個方案演奏目前這首歌（主畫面暫停時也能單獨聽）'}
                  onClick={async () => {
                    await audioEngine.unlock();
                    void audioEngine.auditionScheme(id);
                  }}
                  className={`absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-md transition-colors ${playing ? 'bg-mot text-on-mot' : 'bg-raise text-fg-2 hover:text-fg'}`}
                >
                  {loading ? <Loader2 size={13} className="animate-spin" /> : playing ? <Pause size={13} /> : <Play size={13} />}
                </button>
              </div>
            );
          })}
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-fg-3">{SCHEME_INFO[effScheme].desc}</p>
      </div>

      {/* 曲風：自動選項獨立一行，下面的標籤位置固定，點選不會改變排版 */}
      <div>
        <SectionTitle>曲風</SectionTitle>
        <AutoRow on={prefs.genre === 'auto'} onClick={() => setAudio({ genre: 'auto' })} now={GENRES[plan.genre]?.name ?? ''} />
        <div className="mt-2 flex flex-col gap-2">
          {GENRE_GROUPS.map((g) => (
            <div key={g.name}>
              <div className="mb-1 text-[11px] text-fg-3">{g.name}</div>
              <div className="flex flex-wrap gap-1">
                {g.ids.map((id) => (
                  <Chip key={id} on={prefs.genre === id} onClick={() => setAudio({ genre: id })} label={GENRES[id].name} title={GENRES[id].desc} />
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-fg-3">{GENRES[plan.genre]?.desc}</p>
      </div>

      {/* 節奏與調性 */}
      <div className="flex flex-col gap-3">
        <SectionTitle>節奏與調性</SectionTitle>
        <label htmlFor="snd-sync" className="flex items-center justify-between gap-2 text-[13px]">
          <span>音樂長度與動畫循環對齊</span>
          <input id="snd-sync" type="checkbox" checked={prefs.sync} onChange={(e) => setAudio({ sync: e.target.checked })} className="size-4 accent-[var(--mot)]" />
        </label>
        <Slider id="snd-tempo" label="速度偏好" min={0.7} max={1.4} step={0.02} value={prefs.tempo} onChange={(x) => setAudio({ tempo: x })} format={(x) => `${x.toFixed(2)}× → ${Math.round(song.bpm)} BPM`} tone="mot" />
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-fg-2">調性</span>
          <AutoRow on={prefs.key < 0} onClick={() => setAudio({ key: -1 })} now={NOTE_NAMES[song.key]} />
          <div className="flex flex-wrap gap-1">
            {NOTE_NAMES.map((n, i) => (
              <Chip key={n} on={prefs.key === i} onClick={() => setAudio({ key: i })} label={n} />
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-fg-2">不喜歡這一版？換個旋律</span>
          <Button size="xs" variant="soft" onClick={() => setAudio({ seed: Math.floor(Math.random() * 9999) })}>
            <Dices size={13} /> 重新作曲 <span className="num">#{prefs.seed}</span>
          </Button>
        </div>
      </div>

      {/* 音效 */}
      <div>
        <SectionTitle>音效包</SectionTitle>
        <AutoRow on={prefs.pack === 'auto'} onClick={() => setAudio({ pack: 'auto' })} now={plan.pack ? PACK_INFO[plan.pack].name : '關閉'} />
        <div className="mt-1.5 flex flex-wrap gap-1">
          {packIds.map((id) => (
            <Chip key={id} on={prefs.pack === id} onClick={() => setAudio({ pack: id })} label={PACK_INFO[id].name} title={PACK_INFO[id].desc} />
          ))}
          <Chip on={prefs.pack === 'off'} onClick={() => setAudio({ pack: 'off' })} label="關閉音效" />
        </div>
        {plan.pack && <p className="mt-1.5 text-[11px] leading-relaxed text-fg-3">{PACK_INFO[plan.pack].desc}。動畫經過起跳、落地、彈出等瞬間時自動觸發。</p>}
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {SFX_KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              disabled={!plan.pack}
              onClick={async () => {
                await audioEngine.unlock();
                audioEngine.playSfx(k.id, 1, 1);
              }}
              className="flex items-center justify-between gap-1 rounded-md border border-line bg-panel-2 px-2 py-1.5 text-xs text-fg-2 hover:text-fg disabled:opacity-40"
              title={`試聽「${k.name}」`}
            >
              {k.name}
              <Play size={11} />
            </button>
          ))}
        </div>
      </div>

      {/* 導出 */}
      <div>
        <SectionTitle>導出音訊</SectionTitle>
        <div className="grid grid-cols-2 gap-1.5">
          <ExportBtn busy={busy === 'wav'} onClick={() => void exportFile('wav')} title="WAV 混音" sub="音樂＋音效，約 8 秒以上" />
          <ExportBtn busy={busy === 'bgm-wav'} onClick={() => void exportFile('bgm-wav')} title="WAV 循環" sub="只有音樂，可無縫循環" />
          <ExportBtn busy={busy === 'mid'} onClick={() => void exportFile('mid')} title="MIDI (.mid)" sub="標準 MIDI，GM 音色" />
          <ExportBtn busy={busy === 'xm'} onClick={() => void exportFile('xm')} title="XM 模組 (.xm)" sub="用 OpenMPT 等追蹤器開啟" />
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-fg-3">影片導出（MP4）時，會自動把這裡的音樂與音效一起封裝進去。.xm 的速度必須是整數 BPM，所以長度可能和動畫有 0.5% 內的差異。</p>
      </div>
    </div>
  );
}

function Chip({ on, onClick, label, title }: { on: boolean; onClick: () => void; label: string; title?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      title={title}
      onClick={onClick}
      className={`rounded-md px-2 py-1 text-xs transition-colors ${on ? 'bg-mot text-on-mot font-semibold' : 'bg-panel-2 text-fg-2 hover:text-fg'}`}
    >
      {label}
    </button>
  );
}

/** 「自動」選項：獨立一行，文字固定；目前實際用的是什麼顯示在右邊 */
function AutoRow({ on, onClick, now }: { on: boolean; onClick: () => void; now: string }) {
  return (
    <div className="flex items-center gap-2">
      <Chip on={on} onClick={onClick} label="自動（跟隨風格）" />
      <span className="min-w-0 truncate text-[11px] text-fg-3">目前：{now}</span>
    </div>
  );
}

function ExportBtn({ title, sub, onClick, busy }: { title: string; sub: string; onClick: () => void; busy: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={busy} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-panel-2 p-2 text-left transition-colors hover:border-line-2 disabled:opacity-60">
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold">{title}</span>
        <span className="block truncate text-[11px] text-fg-3">{sub}</span>
      </span>
      {busy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} className="shrink-0 text-fg-3" />}
    </button>
  );
}

