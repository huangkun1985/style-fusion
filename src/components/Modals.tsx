// 風格詳情、導出、分享
import { Download, Link2, Loader2, Minus, Plus, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { audioEngine } from '../audio/engine';
import type { Stereo } from '../audio/dsp';
import { MCAT_NAME, VCAT_NAME } from '../data/categories';
import { MOTION_MAP } from '../data/motion';
import type { MCat, MotionStyle, VCat, VisualStyle } from '../data/schema';
import { VISUAL_MAP } from '../data/visual';
import { FX } from '../engine/fx';
import { SUBJECTS, SUBJECT_ORDER } from '../engine/subjects';
import type { SubjectId } from '../engine/types';
import { canMp4, estimateFrames, runExport, type ExportFormat } from '../lib/exporter';
import { inArtifact, saveBlob } from '../lib/platform';
import { styleSpec, useLookMove } from '../store/hooks';
import { encodeMix } from '../store/share';
import { useStore } from '../store/store';
import { SUBJECT_ICON } from './icons';
import { ASPECT } from './Stage';
import { Thumb } from './Thumb';
import { Button, CodeBlock, CopyButton, Kf, Modal, SectionTitle, Segmented } from './ui';

export function StyleDetailModal() {
  const detail = useStore((s) => s.detail);
  const set = useStore((s) => s.set);
  const toggle = useStore((s) => s.toggle);
  const v = useStore((s) => s.v);
  const m = useStore((s) => s.m);
  const tune = useStore((s) => s.tune);
  const [subj, setSubj] = useState<SubjectId | 'demo'>('demo');
  useEffect(() => setSubj('demo'), [detail?.id]);
  if (!detail) return null;
  const kind = detail.kind;
  const s: VisualStyle | MotionStyle | undefined = kind === 'v' ? VISUAL_MAP[detail.id] : MOTION_MAP[detail.id];
  if (!s) return null;
  const selected = (kind === 'v' ? v : m).some((x) => x.id === s.id);
  const subject = subj === 'demo' ? (s.demo ?? 'mascot') : subj;
  const catName = kind === 'v' ? VCAT_NAME[s.cat as VCat] : MCAT_NAME[s.cat as MCat];
  const ms = kind === 'm' ? (s as MotionStyle) : null;
  const vs = kind === 'v' ? (s as VisualStyle) : null;
  const pairs = (s.pairs ?? []).map((id) => ({ id, s: VISUAL_MAP[id] ?? MOTION_MAP[id], k: (VISUAL_MAP[id] ? 'v' : 'm') as 'v' | 'm' })).filter((p) => p.s);
  return (
    <Modal
      open
      wide
      onClose={() => set({ detail: null })}
      title={
        <span className="flex items-center gap-2">
          <Kf kind={kind} />
          {s.name}
          <span className="text-sm font-normal text-fg-3">{s.en}</span>
        </span>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-fg-3">
            {kind === 'v' ? '圖像風格' : '動效風格'} · {catName}
          </span>
          <Button variant={selected ? 'outline' : 'primary'} onClick={() => toggle(kind, s.id)}>
            {selected ? <Minus size={15} /> : <Plus size={15} />}
            {selected ? '從混合移除' : '加入混合'}
          </Button>
        </div>
      }
    >
      <div className="grid gap-5 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="aspect-[16/10] w-full overflow-hidden rounded-xl bg-stage ring-1 ring-line">
            <Thumb spec={() => styleSpec(kind, s.id, 'subject', { v, m, subject, tune })} specKey={`${s.id}|${subject}`} />
          </div>
          <div className="scroll-x flex gap-1 pb-1">
            <button type="button" onClick={() => setSubj('demo')} className={`shrink-0 rounded-md px-2 py-1 text-xs ${subj === 'demo' ? 'bg-fg text-bg' : 'bg-panel-2 text-fg-2'}`}>
              示範
            </button>
            {SUBJECT_ORDER.map((id) => {
              const Icon = SUBJECT_ICON[id];
              return (
                <button key={id} type="button" onClick={() => setSubj(id)} className={`flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs ${subj === id ? 'bg-fg text-bg' : 'bg-panel-2 text-fg-2'}`}>
                  <Icon size={12} />
                  {SUBJECTS[id].name}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <p className="text-[15px] leading-relaxed">{s.desc}</p>
          <div>
            <SectionTitle>要點</SectionTitle>
            <ul className="space-y-1 text-[13px] text-fg-2">
              {s.tips.map((t) => (
                <li key={t} className="flex gap-2">
                  <span className="mt-[7px] size-1 shrink-0 rounded-full bg-fg-3" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          {ms?.dur && (
            <div>
              <SectionTitle>建議節奏</SectionTitle>
              <p className="num text-[13px] text-fg-2">{ms.dur}</p>
            </div>
          )}
          {vs && vs.look.post && vs.look.post.length > 0 && (
            <div>
              <SectionTitle>後期鏈</SectionTitle>
              <div className="flex flex-wrap gap-1">
                {vs.look.post.map((p, i) => (
                  <span key={i} className="rounded bg-vis-soft px-1.5 py-0.5 text-xs text-vis">
                    {FX[p.fx]?.name ?? p.fx}
                  </span>
                ))}
              </div>
            </div>
          )}
          {vs?.look.pal && (
            <div>
              <SectionTitle>代表色</SectionTitle>
              <div className="flex gap-1">
                {(['bg', 'p', 's', 'a', 'q', 'ink'] as const).map((k) => (
                  <span key={k} className="h-6 flex-1 rounded border border-line" style={{ background: vs.look.pal?.[k] ?? 'transparent' }} title={vs.look.pal?.[k]} />
                ))}
              </div>
            </div>
          )}
          <div>
            <SectionTitle>英文關鍵詞</SectionTitle>
            <p className="select-all text-xs leading-relaxed text-fg-3">{s.kw}</p>
          </div>
          {pairs.length > 0 && (
            <div>
              <SectionTitle>推薦搭配</SectionTitle>
              <div className="flex flex-wrap gap-1">
                {pairs.map((p) => (
                  <button key={p.id} type="button" onClick={() => set({ detail: { kind: p.k, id: p.id } })} className="flex items-center gap-1 rounded-md bg-panel-2 px-2 py-1 text-xs text-fg-2 hover:text-fg">
                    <Kf kind={p.k} />
                    {p.s.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {ms?.ae && (
            <div>
              <SectionTitle right={<CopyButton size="xs" text={ms.ae} />}>After Effects 表達式</SectionTitle>
              <CodeBlock code={ms.ae} maxH={220} />
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

const FORMATS: { id: ExportFormat; name: string; note: string }[] = [
  { id: 'gif', name: 'GIF 動圖', note: '社群、貼圖、簡報，自動循環' },
  { id: 'mp4', name: 'MP4 影片', note: 'H.264，可直接放進剪輯軟體' },
  { id: 'webm', name: 'WebM 影片', note: '不支援 MP4 編碼時的替代（即時錄製）' },
  { id: 'zip', name: 'PNG 序列', note: '逐幀 PNG 打包成 ZIP，可匯入 AE' },
  { id: 'sprite', name: '精靈圖', note: '所有幀排成一張大圖，給遊戲引擎' },
  { id: 'png', name: '單張 PNG', note: '目前這一幀' },
];

export function ExportModal() {
  const open = useStore((s) => s.exportOpen);
  const set = useStore((s) => s.set);
  const subject = useStore((s) => s.subject);
  const aspect = useStore((s) => s.aspect);
  const audioPrefs = useStore((s) => s.audio);
  const { look, move, tune } = useLookMove();
  const [fmt, setFmt] = useState<ExportFormat>('gif');
  const [short, setShort] = useState('480');
  const [fps, setFps] = useState('24');
  const [loops, setLoops] = useState('1');
  const [transparent, setTransparent] = useState(false);
  const [withAudio, setWithAudio] = useState(true);
  const [phase, setPhase] = useState('');
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState(0);
  const [err, setErr] = useState('');
  const [result, setResult] = useState<{ url: string; name: string; size: number; note?: string } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const ar = ASPECT[aspect];
  const sh = parseInt(short);
  const w = Math.round(ar >= 1 ? sh * ar : sh);
  const h = Math.round(ar >= 1 ? sh : sh / ar);
  const frames = estimateFrames({ subject, move, tune, fps: parseInt(fps), loops: parseInt(loops) });
  const close = () => {
    abort.current?.abort();
    set({ exportOpen: false });
    setBusy(false);
  };
  useEffect(() => {
    if (!open) {
      setResult(null);
      setErr('');
      setProg(0);
      setPhase('');
    } else setWithAudio(useStore.getState().audio.on);
  }, [open]);
  const hasSound = audioPrefs.bgm || audioPrefs.sfx;
  const audioWanted = fmt === 'mp4' && withAudio && hasSound;
  const start = async () => {
    setBusy(true);
    setErr('');
    setResult(null);
    setProg(0);
    abort.current = new AbortController();
    try {
      let audio: Stereo | null = null;
      if (audioWanted) {
        // 先把音樂渲染好並混出與影片等長的音軌（含動畫提示點的音效）
        setPhase('正在渲染音樂…');
        audio = await audioEngine.exportMix(frames / parseInt(fps));
        if (abort.current.signal.aborted) throw new Error('已取消');
      }
      setPhase(audio ? '逐幀渲染並封裝影音…' : '');
      const { blob, name, note } = await runExport(
        { format: fmt, subject, look, move, tune, w: w - (w % 2), h: h - (h % 2), fps: parseInt(fps), loops: parseInt(loops), transparent: transparent && ['png', 'zip', 'sprite'].includes(fmt), audio },
        setProg,
        abort.current.signal,
      );
      const url = URL.createObjectURL(blob);
      setResult({ url, name, size: blob.size, note });
      saveBlob(blob, name);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
      setPhase('');
    }
  };
  const disabled = (fmt === 'mp4' && !canMp4) || (fmt === 'webm' && typeof MediaRecorder === 'undefined');
  return (
    <Modal
      open={open}
      onClose={close}
      title="導出動畫"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="num text-xs text-fg-3">
            {w}×{h} · {fmt === 'png' ? '1 幀' : `${frames} 幀 · ${(frames / parseInt(fps)).toFixed(2)}s`}
          </span>
          <div className="flex gap-2">
            {busy ? (
              <Button variant="outline" onClick={() => abort.current?.abort()}>
                取消
              </Button>
            ) : (
              <Button variant="primary" onClick={start} disabled={disabled}>
                <Download size={15} /> 開始導出
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {FORMATS.map((f) => {
            const na = (f.id === 'mp4' && !canMp4) || (f.id === 'webm' && typeof MediaRecorder === 'undefined');
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={fmt === f.id}
                onClick={() => setFmt(f.id)}
                className={`rounded-lg border p-2.5 text-left transition-colors ${fmt === f.id ? 'border-mot bg-mot-soft' : 'border-line bg-panel-2 hover:border-line-2'} ${na ? 'opacity-50' : ''}`}
              >
                <div className="text-[13px] font-semibold">{f.name}</div>
                <div className="mt-0.5 text-[11px] leading-snug text-fg-3">{na ? '此瀏覽器不支援' : f.note}</div>
              </button>
            );
          })}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-fg-2">短邊尺寸</span>
            <Segmented id="ex-size" size="sm" value={short} onChange={setShort} options={['360', '480', '720', '1080'].map((x) => ({ value: x, label: x }))} />
          </div>
          {fmt !== 'png' && (
            <>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-fg-2">幀率</span>
                <Segmented id="ex-fps" size="sm" value={fps} onChange={setFps} options={['12', '24', '30', '60'].map((x) => ({ value: x, label: x }))} />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-fg-2">循環次數</span>
                <Segmented id="ex-loops" size="sm" value={loops} onChange={setLoops} options={['1', '2', '3'].map((x) => ({ value: x, label: `${x} 次` }))} />
              </div>
            </>
          )}
        </div>
        {fmt === 'mp4' && (
          <div className="flex flex-col gap-1">
            <label htmlFor="ex-audio" className="flex items-center gap-2 text-[13px] text-fg-2">
              <input id="ex-audio" type="checkbox" checked={withAudio && hasSound} disabled={!hasSound} onChange={(e) => setWithAudio(e.target.checked)} className="size-4 accent-[var(--mot)]" />
              加入音樂與音效（用「聲音」分頁目前的設定）
            </label>
            <p className="pl-6 text-[11px] leading-relaxed text-fg-3">{hasSound ? '音樂會從影片第 0 秒起對齊動畫，循環次數越多就重複越多次。' : '「聲音」分頁裡音樂與音效都已關閉，所以影片會是無聲的。'} GIF／WebM 沒有聲音軌。</p>
          </div>
        )}
        {['png', 'zip', 'sprite'].includes(fmt) && (
          <label htmlFor="ex-transparent" className="flex items-center gap-2 text-[13px] text-fg-2">
            <input id="ex-transparent" type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} className="size-4 accent-[var(--mot)]" />
            透明背景（只輸出主體與特效，不含背景與後期）
          </label>
        )}
        <p className="text-xs leading-relaxed text-fg-3">
          導出是逐幀離線渲染：不管電腦快慢，幀與幀之間的時間都精確。{move.fps ? `目前動效為 ${move.fps}fps 步進，導出幀率建議設為 ${move.fps} 的倍數。` : ''}
          {inArtifact && ' 在 claude.ai 的預覽框裡，瀏覽器可能會擋下自動下載；若沒有出現檔案，請在本地版本導出。'}
        </p>
        {busy && phase && <p className="text-xs text-fg-2">{phase}</p>}
        {(busy || prog > 0) && (
          <div className="flex items-center gap-3">
            {busy && <Loader2 size={16} className="animate-spin text-mot" />}
            <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-line">
              <div className="absolute inset-y-0 left-0 rounded-full bg-mot transition-[width]" style={{ width: `${prog * 100}%` }} />
            </div>
            <span className="num w-10 text-right text-xs text-fg-2">{Math.round(prog * 100)}%</span>
          </div>
        )}
        {err && <p className="rounded-lg bg-danger/10 px-3 py-2 text-[13px] text-danger">{err}</p>}
        {result && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ok/40 bg-ok/10 px-3 py-2 text-[13px]">
            <span>
              已完成 <span className="num">{result.name}</span>（{(result.size / 1024 / 1024).toFixed(2)} MB）
            </span>
            <a href={result.url} download={result.name} className="font-semibold text-ok underline">
              再次下載
            </a>
            {result.note && <p className="w-full text-xs text-fg-2">{result.note}</p>}
          </div>
        )}
      </div>
    </Modal>
  );
}

export function ShareModal() {
  const open = useStore((s) => s.shareOpen);
  const set = useStore((s) => s.set);
  const v = useStore((s) => s.v);
  const m = useStore((s) => s.m);
  const subject = useStore((s) => s.subject);
  const tune = useStore((s) => s.tune);
  const importCode = useStore((s) => s.importCode);
  const showToast = useStore((s) => s.showToast);
  const [paste, setPaste] = useState('');
  const code = useMemo(() => encodeMix({ v, m, s: subject, t: tune }), [v, m, subject, tune]);
  const link = `${location.origin}${location.pathname}#mix=${code}`;
  return (
    <Modal open={open} onClose={() => set({ shareOpen: false })} title="配方碼與分享">
      <div className="flex flex-col gap-4">
        <div>
          <SectionTitle right={<CopyButton size="xs" text={code} label="複製配方碼" />}>目前混合的配方碼</SectionTitle>
          <textarea id="share-code" readOnly value={code} rows={3} className="num w-full resize-none rounded-lg border border-line bg-panel-2 p-2 text-[11px] text-fg-2 outline-none" onFocus={(e) => e.target.select()} />
          <p className="mt-1 text-xs text-fg-3">配方碼包含全部風格、權重、主體與微調參數。貼給同事，或在「我的收藏」貼上即可還原。</p>
        </div>
        {!inArtifact && (
          <div>
            <SectionTitle right={<CopyButton size="xs" text={link} label="複製連結" />}>分享連結</SectionTitle>
            <p className="flex items-center gap-2 truncate rounded-lg border border-line bg-panel-2 px-2 py-1.5 text-xs text-fg-3">
              <Link2 size={13} className="shrink-0" />
              <span className="truncate">{link}</span>
            </p>
          </div>
        )}
        <div>
          <SectionTitle>載入別人的配方碼</SectionTitle>
          <div className="flex gap-2">
            <input id="share-import" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="SF1.xxxxxxxx" className="num h-9 min-w-0 flex-1 rounded-lg border border-line-2 bg-panel-2 px-3 text-xs outline-none focus:border-mot" />
            <Button
              variant="soft"
              onClick={() => {
                if (importCode(paste)) {
                  setPaste('');
                  set({ shareOpen: false });
                  showToast('已載入配方');
                } else showToast('配方碼格式不正確');
              }}
            >
              <Upload size={15} /> 載入
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
