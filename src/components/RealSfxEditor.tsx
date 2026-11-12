// 真實音效的片段與音量（2.0 正式）：換成真實音效之後，可以自己選用錄音的哪一段、調大小聲。
// - 波形：有原始錄音（start.bat 開、而且這個音效是 2.0 正式之後選的）就顯示整段原始錄音，可以選任何一段；
//   沒有的話顯示存在專案裡的那一段，只能從裡面再剪短。
// - 拖兩邊的把手改開頭、結尾；拖中間整段搬；點空白處把這一段搬過去。最長 4 秒。
// - 音量：在「對齊到合成音效的響度」之後再加減（−12～+12 dB），整個專案這種音效都跟著變。
// - 「套用」才寫進專案（一步，可以 Ctrl+Z）；「試聽」用的是套用後會聽到的聲音（含對齊與音量）。
import { Loader2, Play, Wand2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { bridgePost } from '../agent/bridge';
import { audioEngine } from '../audio/engine';
import { autoRange, b64ToBytes, bytesToB64, cutSfx, decodeToMono, decodeWav16, encodeWav16, levelMatched, MAX_SFX_SEC, STORE_SR, upsample } from '../audio/realSfx';
import { synthSfx } from '../audio/sfx';
import { SAMPLE_RATE, type SfxKind } from '../audio/types';
import type { SoundAsset } from '../store/project';
import { useStore } from '../store/store';
import { Button, Modal, Slider } from './ui';

const MIN_SEC = 0.03;
const HANDLE_PX = 8;

interface Src {
  x: Float32Array;
  sr: number;
  /** original＝Freesound 的原始錄音；clip＝存在專案裡的那一段 */
  from: 'original' | 'clip';
}

export function RealSfxEditor({ kind, kindName, asset, onClose }: { kind: SfxKind; kindName: string; asset: SoundAsset; onClose: () => void }) {
  const [src, setSrc] = useState<Src | null>(null);
  const [note, setNote] = useState('');
  const [sel, setSel] = useState<[number, number]>([0, asset.dur]);
  const [gain, setGain] = useState(asset.gain ?? 0);
  const init = useRef<[number, number]>([0, asset.dur]);
  useEffect(() => {
    let dead = false;
    const clip = (): Src => ({ x: decodeWav16(b64ToBytes(asset.b64)), sr: STORE_SR, from: 'clip' });
    (async () => {
      let s: Src;
      if (asset.preview) {
        try {
          const res = await bridgePost('sfx-fetch', { url: asset.preview });
          const d = await decodeToMono(await res.arrayBuffer());
          // 很長的錄音只看前 30 秒
          s = { x: d.x.length > d.sr * 30 ? d.x.slice(0, d.sr * 30) : d.x, sr: d.sr, from: 'original' };
        } catch {
          s = clip();
          if (!dead) setNote('抓不到原始錄音（要用 start.bat 開、而且 Freesound 連得上），先顯示存在專案裡的這一段：只能從裡面再剪短。');
        }
      } else {
        s = clip();
        setNote('這個音效是舊版選的，專案裡只存了剪好的那一段：只能從裡面再剪短。想選別段，用「更換」重新選一次同一個錄音。');
      }
      if (dead) return;
      const r: [number, number] = s.from === 'original' ? (asset.range ?? autoRange(s.x, s.sr)) : [0, s.x.length / s.sr];
      init.current = r;
      setSel(r);
      setSrc(s);
    })();
    return () => {
      dead = true;
    };
  }, [asset]);
  const dur = src ? src.x.length / src.sr : 0;
  const len = sel[1] - sel[0];
  const changed = Math.abs(sel[0] - init.current[0]) > 0.001 || Math.abs(sel[1] - init.current[1]) > 0.001;
  /** 套用後會聽到的聲音（對齊響度＋音量），取樣率 SAMPLE_RATE */
  const rendered = (): Float32Array | null => {
    if (!src) return null;
    const { pcm } = cutSfx(src.x, src.sr, sel[0], sel[1]);
    const up = upsample(pcm, STORE_SR, SAMPLE_RATE);
    const pack = audioEngine.currentPack();
    // 每次試聽是新的陣列，對齊的快取不會留著
    return !pack ? up : levelMatched(up, synthSfx(pack, kind, SAMPLE_RATE, 0), `${pack}|${kind}`, gain);
  };
  const play = async () => {
    await audioEngine.unlock();
    const d = rendered();
    if (d) audioEngine.playPcm(d);
  };
  const apply = () => {
    if (!src) return;
    let next: SoundAsset = { ...asset };
    if (changed) {
      const { pcm, dur: d } = cutSfx(src.x, src.sr, sel[0], sel[1]);
      const range: [number, number] | undefined = src.from === 'original' ? [round3(sel[0]), round3(sel[1])] : asset.range ? [round3(asset.range[0] + sel[0]), round3(asset.range[0] + sel[1])] : undefined;
      const { range: _r, ...rest } = next;
      next = { ...rest, b64: bytesToB64(encodeWav16(pcm, STORE_SR)), dur: d, ...(range ? { range } : {}) };
    }
    const { gain: _g, ...rest } = next;
    next = gain ? { ...rest, gain } : rest;
    useStore.setState((s) => ({ sounds: s.sounds.map((x) => (x.id === asset.id ? next : x)) }));
    onClose();
  };
  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={`調整真實音效：${kindName}（${asset.name}）`}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} title="不改，關掉">
            取消
          </Button>
          <Button variant="primary" disabled={!src || (!changed && gain === (asset.gain ?? 0))} onClick={apply} title="把選的片段與音量寫進專案（可以 Ctrl+Z）">
            套用
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-[12px] leading-relaxed text-fg-3">
          {src?.from === 'original' ? `原始錄音（${dur.toFixed(1)} 秒${dur >= 29.9 ? '，只顯示前 30 秒' : ''}）。` : ''}拖兩邊的把手改開頭、結尾，拖中間整段搬，點空白處把這一段搬過去；最長 {MAX_SFX_SEC} 秒。<b>我聽不到聲音，請你試聽後再套用。</b>
        </p>
        {note && <p className="rounded-lg bg-raise px-3 py-2 text-[12px] leading-relaxed text-fg-2">{note}</p>}
        <div className="relative h-[120px] rounded-lg border border-line bg-panel-2">
          {src ? <Wave src={src} sel={sel} onSel={setSel} /> : <div className="flex size-full items-center justify-center gap-2 text-[13px] text-fg-3"><Loader2 size={15} className="animate-spin" /> 載入錄音…</div>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="soft" disabled={!src} onClick={() => void play()} title="試聽選的這一段（含音量對齊與下面的音量），聽起來就是套用後的樣子">
            <Play size={14} /> 試聽這一段
          </Button>
          <Button variant="ghost" disabled={!src} onClick={() => src && setSel(src.from === 'original' ? autoRange(src.x, src.sr) : [0, dur])} title="自動選段：只留第一下（修剪前後的靜音）。選亂了想重來時用">
            <Wand2 size={14} /> 自動選段
          </Button>
          <span className="num w-[220px] text-[12px] text-fg-2">
            {sel[0].toFixed(2)}～{sel[1].toFixed(2)} 秒（{len.toFixed(2)} 秒）
          </span>
        </div>
        <div className="max-w-[420px]">
          <Slider id="sfx-gain" value={gain} min={-12} max={12} step={0.5} onChange={setGain} label="音量" format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`} />
          <p className="mt-1 text-[11px] leading-relaxed text-fg-3">已經自動對齊到合成音效的大小；覺得這個錄音太搶或太小再調。0 dB＝對齊後的大小。整個專案的「{kindName}」都會跟著變。</p>
        </div>
      </div>
    </Modal>
  );
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;

/** 波形與選取範圍（顏色取介面的色彩變數，跟著深淺色走） */
function Wave({ src, sel, onSel }: { src: Src; sel: [number, number]; onSel: (r: [number, number]) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [cw, setCw] = useState(600);
  const dur = src.x.length / src.sr;
  useEffect(() => {
    const el = ref.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(() => setCw(Math.max(200, el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // 每個像素欄的最大最小值（只算一次）
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  useEffect(() => {
    const n = Math.round(cw);
    const p = new Float32Array(n * 2);
    const per = src.x.length / n;
    for (let c = 0; c < n; c++) {
      let lo = 0;
      let hi = 0;
      const a = Math.floor(c * per);
      const b = Math.min(src.x.length, Math.floor((c + 1) * per) + 1);
      for (let i = a; i < b; i++) {
        const v = src.x[i];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      p[c * 2] = lo;
      p[c * 2 + 1] = hi;
    }
    let peak = 1e-9;
    for (let i = 0; i < p.length; i++) peak = Math.max(peak, Math.abs(p[i]));
    for (let i = 0; i < p.length; i++) p[i] /= peak;
    setPeaks(p);
  }, [src, cw]);
  useEffect(() => {
    const c = ref.current;
    if (!c || !peaks) return;
    const dpr = window.devicePixelRatio || 1;
    const H = 118;
    c.width = Math.round(cw * dpr);
    c.height = Math.round(H * dpr);
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(document.documentElement);
    const col = (v: string, fb: string) => css.getPropertyValue(v).trim() || fb;
    const x0 = (sel[0] / dur) * cw;
    const x1 = (sel[1] / dur) * cw;
    g.clearRect(0, 0, cw, H);
    g.fillStyle = col('--mot-soft', 'rgba(255,180,0,.15)');
    g.fillRect(x0, 0, x1 - x0, H);
    const n = peaks.length / 2;
    for (let i = 0; i < n; i++) {
      const inSel = i >= x0 && i <= x1;
      g.fillStyle = inSel ? col('--fg', '#ddd') : col('--fg-3', '#777');
      const lo = peaks[i * 2];
      const hi = peaks[i * 2 + 1];
      const y0 = H / 2 - hi * (H / 2 - 6);
      const y1 = H / 2 - lo * (H / 2 - 6);
      g.fillRect(i, y0, 1, Math.max(1, y1 - y0));
    }
    g.fillStyle = col('--accent', '#f5a524');
    g.fillRect(x0 - 1, 0, 2, H);
    g.fillRect(x1 - 1, 0, 2, H);
    g.fillRect(x0 - 4, 0, 8, 10);
    g.fillRect(x1 - 4, H - 10, 8, 10);
  }, [peaks, sel, cw, dur]);
  const drag = useRef<{ mode: 'a' | 'b' | 'move'; t0: number; s0: [number, number] } | null>(null);
  const tAt = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return Math.max(0, Math.min(dur, ((e.clientX - r.left) / r.width) * dur));
  };
  const clampSel = (a: number, b: number): [number, number] => {
    a = Math.max(0, Math.min(a, dur - MIN_SEC));
    b = Math.max(a + MIN_SEC, Math.min(b, dur, a + MAX_SFX_SEC));
    return [a, b];
  };
  return (
    <canvas
      ref={ref}
      className="block h-[118px] w-full cursor-ew-resize touch-none"
      style={{ width: cw }}
      aria-label="錄音波形：拖兩邊的把手選片段"
      onPointerDown={(e) => {
        const t = tAt(e);
        const px = (Math.abs(t - sel[0]) / dur) * cw;
        const pxB = (Math.abs(t - sel[1]) / dur) * cw;
        capture(e);
        if (px <= HANDLE_PX && px <= pxB) drag.current = { mode: 'a', t0: t, s0: sel };
        else if (pxB <= HANDLE_PX) drag.current = { mode: 'b', t0: t, s0: sel };
        else if (t > sel[0] && t < sel[1]) drag.current = { mode: 'move', t0: t, s0: sel };
        else {
          const L = sel[1] - sel[0];
          const ns = clampSel(Math.min(t, dur - L), Math.min(t, dur - L) + L);
          onSel(ns);
          drag.current = { mode: 'move', t0: t, s0: ns };
        }
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const t = tAt(e);
        if (d.mode === 'a') onSel(clampSel(Math.min(t, d.s0[1] - MIN_SEC), d.s0[1]));
        else if (d.mode === 'b') onSel(clampSel(d.s0[0], Math.max(t, d.s0[0] + MIN_SEC)));
        else {
          const L = d.s0[1] - d.s0[0];
          const a = Math.max(0, Math.min(dur - L, d.s0[0] + (t - d.t0)));
          onSel([a, a + L]);
        }
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
    />
  );
}

/** 拖動時抓住指標（觸控筆、某些瀏覽器會拒絕；拒絕時照樣能拖，只是滑出元素就停） */
function capture(e: React.PointerEvent) {
  try {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  } catch {
    /* 沒有作用中的指標 */
  }
}
