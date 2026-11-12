// 真實音效（2.0 β，F11b）：「聲音」分頁的音效區塊——這一場用到的每一種音效一列（合成／真實、試聽、換成真實音效、還原）。
// 「換成真實音效」打開搜尋視窗：關鍵字已經帶好（英文），候選清單照 sound skill 的判斷方式排序（下載數高的優先；評分人數比平均分可信；
// 描述看得出錄音來源的優先），你用耳朵試聽後選一個；選定後下載、修剪靜音、對齊音量，存進專案。
// 只有 start.bat 開時能搜尋與下載（要靠本機伺服器代抓）；已經存進專案的音效任何開法都能播放與導出。
import { Loader2, Play, RotateCcw, Search, Square } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { bridgePost, connectBridge, AgentError } from '../agent/bridge';
import { CueTracker } from '../audio/cues';
import { audioEngine } from '../audio/engine';
import { bytesToB64, decodeToMono, encodeWav16, prepareSfx, STORE_SR } from '../audio/realSfx';
import { SFX_KINDS } from '../audio/sfx';
import type { SfxKind } from '../audio/types';
import { useLookMove } from '../store/hooks';
import { MAX_SOUNDS, newId, type SoundAsset } from '../store/project';
import { useStore } from '../store/store';
import { Button, Modal, SectionTitle } from './ui';

/** 每一種音效的建議英文關鍵字（Freesound 的描述多半是英文） */
export const SFX_QUERY: Record<SfxKind, string> = {
  jump: 'cartoon jump',
  land: 'soft thud landing',
  bounce: 'rubber ball bounce',
  pop: 'bubble pop',
  click: 'ui click',
  toggle: 'switch toggle click',
  whoosh: 'whoosh swish',
  tick: 'clock tick',
  ping: 'notification ping',
  sparkle: 'magic sparkle chime',
  impact: 'impact hit',
  step: 'footstep',
  notify: 'notification chime',
  rise: 'riser swell',
  drop: 'falling whistle',
  flip: 'page flip',
  blip: 'short blip beep',
  splash: 'water splash',
  quack: 'duck quack',
};
const KIND_NAME = Object.fromEntries(SFX_KINDS.map((k) => [k.id, k.name])) as Record<SfxKind, string>;

interface Row {
  id: string;
  title: string;
  dur: number;
  author: string;
  license: string;
  downloads: number;
  rating: number | null;
  votes: number;
  desc: string;
  preview: string;
  page: string;
}

/** 聲音分頁裡的「真實音效」區塊 */
export function RealSfxSection() {
  const subject = useStore((s) => s.subject);
  const sfxMap = useStore((s) => s.sfxMap);
  const sounds = useStore((s) => s.sounds);
  const pack = useStore((s) => s.audio.pack);
  const { look, move, tune } = useLookMove();
  const [pick, setPick] = useState<SfxKind | null>(null);
  // 這一場會觸發的音效種類，加上已經換過的種類
  const kinds = useMemo(() => {
    let used: SfxKind[] = [];
    try {
      used = [...new Set(new CueTracker(subject, move, tune, look).cues.map((c) => c.kind))];
    } catch {
      used = [];
    }
    for (const k of Object.keys(sfxMap) as SfxKind[]) if (!used.includes(k)) used.push(k);
    return used;
  }, [subject, move, tune, look, sfxMap]);
  const set = (k: SfxKind, id: string | null) => {
    const next = { ...useStore.getState().sfxMap };
    if (id) next[k] = id;
    else delete next[k];
    useStore.setState({ sfxMap: next });
  };
  return (
    <div>
      <SectionTitle>真實音效</SectionTitle>
      <p className="mb-1.5 text-[11px] leading-relaxed text-fg-3">把程式合成的音效換成真的錄音（Freesound，預設只搜 CC0 可自由使用的）。整個專案共用：換了「落地」，每一場的落地都會用它。{pack === 'off' ? '目前音效包是「關閉」，換了也不會出聲。' : ''}</p>
      {kinds.length === 0 && <p className="text-[12px] text-fg-3">這一場沒有音效點。</p>}
      <div className="flex flex-col gap-1">
        {kinds.map((k) => {
          const a = sounds.find((x) => x.id === sfxMap[k]);
          return (
            <div key={k} className="flex h-9 items-center gap-1.5 rounded-md border border-line bg-panel-2 pl-2 pr-1 text-[12px]">
              <span className="w-12 shrink-0 text-fg">{KIND_NAME[k]}</span>
              <span className={`min-w-0 flex-1 truncate ${a ? 'text-fg' : 'text-fg-3'}`} title={a ? `${a.name}（${a.author}，${a.license}）` : '程式合成（跟著音效包）'}>
                {a ? `真實：${a.name}` : '合成'}
              </span>
              <button
                type="button"
                className="flex size-7 shrink-0 items-center justify-center rounded text-fg-2 hover:bg-raise hover:text-fg"
                title={`試聽現在的「${KIND_NAME[k]}」`}
                aria-label={`試聽${KIND_NAME[k]}`}
                onClick={async () => {
                  await audioEngine.unlock();
                  audioEngine.playSfx(k, 1, 1);
                }}
              >
                <Play size={12} />
              </button>
              <button type="button" className="h-7 shrink-0 rounded border border-line-2 px-2 text-fg hover:bg-raise" title="換成真實音效：到 Freesound 搜尋錄音，試聽後選一個（只有 start.bat 開時能用）" onClick={() => setPick(k)}>
                {a ? '更換' : '換成真實'}
              </button>
              <button type="button" disabled={!a} className="flex size-7 shrink-0 items-center justify-center rounded text-fg-2 hover:bg-raise hover:text-fg disabled:opacity-30" title="還原成程式合成的音效（可以 Ctrl+Z）" aria-label="還原成合成" onClick={() => set(k, null)}>
                <RotateCcw size={12} />
              </button>
            </div>
          );
        })}
      </div>
      {pick && <RealSfxModal kind={pick} onClose={() => setPick(null)} onPicked={(id) => set(pick, id)} />}
    </div>
  );
}

type Lic = 'cc0' | 'by' | 'any';

function RealSfxModal({ kind, onClose, onPicked }: { kind: SfxKind; onClose: () => void; onPicked: (id: string) => void }) {
  const [q, setQ] = useState(SFX_QUERY[kind]);
  const [lic, setLic] = useState<Lic>('cc0');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<'search' | string | null>(null);
  const [err, setErr] = useState('');
  const [bridge, setBridge] = useState<'checking' | 'ok' | 'none'>('checking');
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    void connectBridge().then((b) => setBridge(b.state === 'none' ? 'none' : 'ok'));
    return () => {
      audio.current?.pause();
      abort.current?.abort();
    };
  }, []);
  const search = async () => {
    setBusy('search');
    setErr('');
    abort.current?.abort();
    abort.current = new AbortController();
    try {
      const r = await bridgePost('sfx-search', { q, license: lic }, abort.current.signal);
      const o = (await r.json()) as { rows: Row[] };
      // 音效點要的是短的一下：3 秒以內的排前面（各組裡照下載數）。長的錄音常是一整段環境音或連續好幾下
      setRows([...o.rows.filter((x) => x.dur <= 3), ...o.rows.filter((x) => x.dur > 3)]);
    } catch (e) {
      if ((e as AgentError).code !== 'aborted') setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  useEffect(() => {
    if (bridge === 'ok') void search();
    // 只在第一次連上時自動搜一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge]);
  const play = (r: Row) => {
    audio.current?.pause();
    if (playing === r.id) {
      setPlaying(null);
      return;
    }
    const a = new Audio(r.preview);
    a.volume = 0.8;
    a.onended = () => setPlaying((p) => (p === r.id ? null : p));
    a.onerror = () => {
      setPlaying(null);
      setErr('試聽檔載入失敗（Freesound 可能暫時連不上）');
    };
    audio.current = a;
    setPlaying(r.id);
    void a.play().catch(() => setPlaying(null));
  };
  const choose = async (r: Row) => {
    const st = useStore.getState();
    const dup = st.sounds.find((x) => x.page === r.page);
    if (dup) {
      onPicked(dup.id);
      onClose();
      return;
    }
    if (st.sounds.length >= MAX_SOUNDS) {
      setErr(`一個專案最多 ${MAX_SOUNDS} 個真實音效；先把用不到的還原成合成`);
      return;
    }
    setBusy(r.id);
    setErr('');
    audio.current?.pause();
    try {
      const res = await bridgePost('sfx-fetch', { url: r.preview });
      const { x, sr } = await decodeToMono(await res.arrayBuffer());
      const { pcm, dur } = prepareSfx(x, sr);
      const asset: SoundAsset = { id: newId(), name: r.title.replace(/\.(wav|mp3|ogg|flac|aiff?)$/i, '').slice(0, 80), author: r.author, license: r.license === 'CC0' || r.license === 'BY' || r.license === 'BY-NC' ? r.license : 'BY', page: r.page, dur, b64: bytesToB64(encodeWav16(pcm, STORE_SR)) };
      useStore.setState((s) => ({ sounds: [...s.sounds, asset] }));
      onPicked(asset.id);
      await audioEngine.unlock();
      onClose();
      setTimeout(() => audioEngine.playSfx(kind, 1, 1), 60);
    } catch (e) {
      setErr((e as Error).message || '下載或解碼失敗');
    } finally {
      setBusy(null);
    }
  };
  return (
    <Modal open wide onClose={onClose} title={`換成真實音效：${KIND_NAME[kind]}`}>
      <div className="flex flex-col gap-3">
        {bridge === 'none' ? (
          <p className="rounded-lg bg-raise px-3 py-2 text-[13px] leading-relaxed text-fg-2">
            搜尋與下載只有用 <b>start.bat</b>（或 start-dev.bat）開的時候才能用：瀏覽器不能直接讀 Freesound，要靠那個視窗裡的本機伺服器代抓。已經存進專案的音效在任何開法都能播放與導出。
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="sfx-q" className="sr-only">搜尋關鍵字（英文）</label>
              <input
                id="sfx-q"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void search()}
                title="搜尋關鍵字：用英文描述聲音的來源與動作（例如 ceramic cup set down），比單一個字準"
                className="h-9 min-w-[200px] flex-1 rounded-lg border border-line-2 bg-panel-2 px-3 text-[13px] outline-none focus:border-mot"
              />
              <select
                value={lic}
                onChange={(e) => setLic(e.target.value as Lic)}
                title="授權：CC0 可以自由使用（預設）；BY 要標示作者（風格包的讀我與規格頁會自動列出）；BY-NC 不可商用"
                className="h-9 rounded-lg border border-line-2 bg-panel-2 px-2 text-[13px]"
              >
                <option value="cc0">只要 CC0（可自由使用）</option>
                <option value="by">CC0＋BY（要標示作者）</option>
                <option value="any">全部（含 BY-NC，不可商用）</option>
              </select>
              <Button variant="soft" onClick={() => void search()} disabled={busy === 'search'}>
                {busy === 'search' ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />} 搜尋
              </Button>
            </div>
            <p className="text-[11px] leading-relaxed text-fg-3">排序：3 秒以內的短音效在前面，同一組裡下載數多的在前面。評分看人數——★4.4（380 人）比 ★4.9（6 人）可靠；描述裡看得出錄音來源（錄音器材、真實物件）的通常比較好。<b>我聽不到聲音，請你試聽後再選。</b>選定後會下載、只留第一下（修剪前後的靜音）、把音量對齊，存進專案（最長 4 秒）。</p>
          </>
        )}
        {err && <p className="rounded-lg bg-danger/10 px-3 py-2 text-[13px] text-danger">{err}</p>}
        {rows && rows.length === 0 && <p className="text-[13px] text-fg-3">沒有找到。換個說法試試（例如加上材質或動作）。</p>}
        {rows && rows.length > 0 && (
          <div className="flex max-h-[52vh] flex-col gap-1 overflow-y-auto">
            {rows.map((r) => (
              <div key={r.id} className="flex items-start gap-2 rounded-lg border border-line bg-panel-2 p-2">
                <button
                  type="button"
                  onClick={() => play(r)}
                  aria-label={playing === r.id ? '停止試聽' : '試聽'}
                  title={playing === r.id ? '停止試聽' : '試聽（直接播放 Freesound 的試聽檔，不會存進專案）'}
                  className="flex size-8 shrink-0 items-center justify-center rounded-md bg-raise text-fg hover:bg-line-2"
                >
                  {playing === r.id ? <Square size={13} /> : <Play size={13} />}
                </button>
                <div className="min-w-0 flex-1 leading-[18px]">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className="truncate text-[13px] text-fg">{r.title}</span>
                    <span className={`shrink-0 rounded px-1 text-[11px] ${r.license === 'CC0' ? 'border border-line-2 text-fg-2' : r.license === 'BY' ? 'bg-raise text-fg' : 'bg-danger/15 text-danger'}`}>{r.license}</span>
                  </div>
                  <div className="num text-[11px] text-fg-2">
                    {r.dur.toFixed(1)}s · ↓{r.downloads.toLocaleString()} · {r.rating !== null ? `★${r.rating}（${r.votes} 人）` : '★ 沒有評分'} · {r.author}
                    {r.dur > 3 && <span className="text-fg-3">（很長：只取第一下，最多 4 秒）</span>}
                  </div>
                  {r.desc && <div className="truncate text-[11px] text-fg-3" title={r.desc}>{r.desc}</div>}
                </div>
                <Button variant="soft" size="sm" disabled={!!busy} onClick={() => void choose(r)} title={r.license === 'BY-NC' ? '選這個（注意：BY-NC 不可商用）' : r.license === 'BY' ? '選這個（要標示作者，風格包會自動列出）' : '選這個：下載、修剪、對齊音量，存進專案'}>
                  {busy === r.id ? <Loader2 size={14} className="animate-spin" /> : '選這個'}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
