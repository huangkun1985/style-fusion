// 右側處方單：處方（色板／緩動／節奏／要點／推薦）、微調、代碼、AI 提示詞。
import { FileText, Plus, RotateCcw, Shuffle } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MotionStyle, VisualStyle } from '../data/schema';
import { aeCode, aiPrompts, briefMarkdown, claudePrompts, cssCode, gsapCode, jsonCode, makeBrief, suggestions, type SoundSpec } from '../lib/brief';
import { CueTracker } from '../audio/cues';
import { GENRES } from '../audio/genres';
import { SCHEME_INFO } from '../audio/render';
import { PACK_INFO } from '../audio/sfx';
import { MODE_NAME, type Mode } from '../audio/theory';
import { NOTE_NAMES } from '../audio/types';
import { round } from '../engine/util';
import { copyText } from '../lib/platform';
import { useAudioPlan, useLookMove } from '../store/hooks';
import { useStore, type InfoTab } from '../store/store';
import { EasingGraph } from './EasingGraph';
import { SoundTab } from './SoundPanel';
import { ASPECT } from './Stage';
import { Button, CodeBlock, CopyButton, Kf, SectionTitle, Segmented, Slider } from './ui';
import type { Palette } from '../engine/types';
import { PAL_KEYS } from '../engine/resolve';
import { ROLE_NAME } from '../lib/brief';

export function InfoPanel({ tab: forced }: { tab?: InfoTab }) {
  const tab = useStore((s) => s.infoTab);
  const set = useStore((s) => s.set);
  const cur = forced ?? tab;
  const scrollRef = useRef<HTMLDivElement>(null);
  // 換分頁時回到頂端，才看得到該分頁最上面的說明
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [cur]);
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {!forced && (
        <Segmented
          id="info-tab"
          value={tab}
          onChange={(t: InfoTab) => set({ infoTab: t })}
          className="w-full [&>button]:flex-1"
          options={[
            { value: 'brief', label: '處方' },
            { value: 'sound', label: '聲音' },
            { value: 'tune', label: '微調' },
            { value: 'code', label: '代碼' },
            { value: 'prompt', label: 'AI 提示詞' },
          ]}
        />
      )}
      <div ref={scrollRef} className="scroll-y -mr-1 min-h-0 flex-1 pr-1">
        {cur === 'brief' && <BriefTab />}
        {cur === 'tune' && <TuneTab />}
        {cur === 'sound' && <SoundTab />}
        {cur === 'code' && <CodeTab />}
        {cur === 'prompt' && <PromptTab />}
      </div>
    </div>
  );
}

function useBrief() {
  const { look, move, v, m, tune } = useLookMove();
  const subject = useStore((s) => s.subject);
  const brief = useMemo(() => makeBrief(v, m, look, move, subject, tune), [v, m, look, move, subject, tune]);
  return { brief, look, move, v, m, tune, subject };
}

function BriefTab() {
  const { brief, move, v, m } = useBrief();
  const showToast = useStore((s) => s.showToast);
  const add = useStore((s) => s.add);
  const set = useStore((s) => s.set);
  const sug = useMemo(() => suggestions(v, m, 4), [v, m]);
  return (
    <div className="flex flex-col gap-5 pb-4">
      <div>
        <p className="font-display text-[17px] font-bold leading-snug tracking-tight">{brief.title}</p>
        <div className="mt-2">
          <CopyButton text={briefMarkdown(brief)} label="複製完整處方（Markdown）" />
        </div>
      </div>

      <div>
        <SectionTitle>色板 · 點色塊複製</SectionTitle>
        <div className="grid grid-cols-5 gap-1.5">
          {brief.palette.map((p) => (
            <button
              key={p.role}
              type="button"
              title={`${p.name} ${p.hex}`}
              onClick={async () => showToast((await copyText(p.hex)) ? `已複製 ${p.hex}` : p.hex)}
              className="group flex flex-col overflow-hidden rounded-md border border-line text-left"
            >
              <span className="h-9 w-full" style={{ background: p.hex }} />
              <span className="bg-panel-2 px-1 py-0.5">
                <span className="block truncate text-[11px] text-fg-3">{p.name}</span>
                <span className="num block text-[11px] text-fg-2">{p.hex}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <SectionTitle right={<span className="num text-[11px] text-fg-3">{brief.fps}</span>}>緩動與節奏</SectionTitle>
        <div className="rounded-lg border border-line bg-panel p-2">
          <EasingGraph ease={move.ease} bz={brief.bezier} />
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-fg-3">
            <span className="flex items-center gap-1">
              <span className="inline-block h-0.5 w-4 rounded bg-mot" />
              減速（進場）
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-0.5 w-4 rounded bg-vis opacity-60" />
              兩端緩
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-4 border-t border-dashed border-fg-3" />
              cubic-bezier 近似
            </span>
          </div>
        </div>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[13px]">
          <dt className="text-fg-3">組成</dt>
          <dd className="text-fg-2">{brief.easeLabel}</dd>
          <dt className="text-fg-3">近似</dt>
          <dd className="num break-all text-[12px] text-fg">cubic-bezier({brief.bezier.join(', ')})</dd>
          <dt className="text-fg-3">時長</dt>
          <dd className="text-fg-2">
            單一動作 <span className="num text-fg">{brief.durMs}ms</span>・錯峰 <span className="num text-fg">{brief.staggerMs}ms</span>・循環 <span className="num text-fg">{brief.loopSec}s</span>
          </dd>
        </dl>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <CopyButton size="xs" text={`cubic-bezier(${brief.bezier.join(', ')})`} label="複製 cubic-bezier" />
          <CopyButton size="xs" text={brief.linear} label="複製 CSS linear()" />
        </div>
        {brief.durations.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-xs text-fg-3">
            {brief.durations.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <SectionTitle>動作參數</SectionTitle>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {brief.metrics.map((mt) => (
            <div key={mt.key} className="flex items-center gap-2 text-xs">
              <span className="w-16 shrink-0 text-fg-2">{mt.label}</span>
              <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                <span className="absolute inset-y-0 left-0 rounded-full bg-mot" style={{ width: `${mt.v * 100}%`, opacity: 0.4 + mt.v * 0.6 }} />
              </span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <SectionTitle>渲染與後期</SectionTitle>
        <ul className="space-y-0.5 text-[13px] text-fg-2">
          {brief.render.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        {brief.fx.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {brief.fx.map((f, i) => (
              <span key={f.id} className="flex items-center gap-1 text-xs">
                {i > 0 && <span className="text-fg-3">→</span>}
                <span className="rounded bg-vis-soft px-1.5 py-0.5 text-vis">{f.name}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {brief.tips.length > 0 && (
        <div>
          <SectionTitle>設計要點</SectionTitle>
          <ul className="space-y-1 text-[13px] leading-relaxed text-fg-2">
            {brief.tips.map((t) => (
              <li key={t} className="flex gap-2">
                <span className="mt-[7px] size-1 shrink-0 rounded-full bg-fg-3" />
                {t}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(sug.visual.length > 0 || sug.motion.length > 0) && (
        <div>
          <SectionTitle>推薦搭配</SectionTitle>
          <div className="flex flex-col gap-1">
            {sug.motion.map((s) => (
              <SugRow key={s.id} kind="m" s={s} onAdd={() => add('m', s.id)} onInfo={() => set({ detail: { kind: 'm', id: s.id } })} />
            ))}
            {sug.visual.map((s) => (
              <SugRow key={s.id} kind="v" s={s} onAdd={() => add('v', s.id)} onInfo={() => set({ detail: { kind: 'v', id: s.id } })} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SugRow({ kind, s, onAdd, onInfo }: { kind: 'v' | 'm'; s: VisualStyle | MotionStyle; onAdd: () => void; onInfo: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-line bg-panel-2 px-2 py-1.5">
      <Kf kind={kind} />
      <button type="button" className="min-w-0 flex-1 text-left" onClick={onInfo}>
        <span className="block truncate text-[13px]">{s.name}</span>
        <span className="block truncate text-[11px] text-fg-3">{s.desc}</span>
      </button>
      <Button size="xs" variant="soft" onClick={onAdd} aria-label={`加入 ${s.name}`}>
        <Plus size={13} />
        加入
      </Button>
    </div>
  );
}

function TuneTab() {
  const tune = useStore((s) => s.tune);
  const setTune = useStore((s) => s.setTune);
  const resetTune = useStore((s) => s.resetTune);
  const quality = useStore((s) => s.quality);
  const thumbsAnimate = useStore((s) => s.thumbsAnimate);
  const set = useStore((s) => s.set);
  const { look } = useLookMove();
  return (
    <div className="flex flex-col gap-5 pb-4">
      <div className="flex justify-end">
        <Button size="xs" variant="ghost" onClick={resetTune}>
          <RotateCcw size={13} />
          全部重設
        </Button>
      </div>
      <div className="flex flex-col gap-3">
        <SectionTitle>節奏</SectionTitle>
        <Slider id="t-speed" label="整體速度" min={0.25} max={2.5} step={0.05} value={tune.speed} onChange={(x) => setTune({ speed: x })} format={(x) => `${x.toFixed(2)}×`} tone="mot" />
        <Slider id="t-loop" label="循環長度" min={0.5} max={2.5} step={0.05} value={tune.loopMul} onChange={(x) => setTune({ loopMul: x })} format={(x) => `${x.toFixed(2)}×`} tone="mot" />
        <div className="flex flex-col gap-1">
          <span className="text-xs text-fg-2">幀率</span>
          <Segmented
            id="t-fps"
            size="sm"
            value={String(tune.fps)}
            onChange={(x) => setTune({ fps: parseInt(x) })}
            className="w-full [&>button]:flex-1"
            options={[
              { value: '0', label: '依風格' },
              { value: '-1', label: '60' },
              { value: '24', label: '24' },
              { value: '12', label: '12' },
              { value: '8', label: '8' },
              { value: '6', label: '6' },
            ]}
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-fg-2">隨機種子（抖動、粒子的變化）</span>
          <Button size="xs" variant="soft" onClick={() => setTune({ seed: Math.floor(Math.random() * 9999) })}>
            <Shuffle size={13} />
            <span className="num">{tune.seed}</span>
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <SectionTitle>畫面</SectionTitle>
        <Slider id="t-stroke" label="線條粗細" min={0} max={3} step={0.05} value={tune.strokeMul} onChange={(x) => setTune({ strokeMul: x })} format={(x) => `${x.toFixed(2)}×`} tone="vis" />
        <Slider id="t-fx" label="後期強度" min={0} max={1.5} step={0.05} value={tune.fxMul} onChange={(x) => setTune({ fxMul: x })} format={(x) => `${Math.round(x * 100)}%`} tone="vis" />
        <div className="flex flex-col gap-1">
          <span className="text-xs text-fg-2">多個配色風格時的色板策略</span>
          <Segmented
            id="t-pal"
            size="sm"
            value={tune.paletteMode}
            onChange={(x) => setTune({ paletteMode: x })}
            className="w-full [&>button]:flex-1"
            options={[
              { value: 'interleave', label: '交錯', title: '主風格給背景與主色，次風格給輔色與點綴' },
              { value: 'dominant', label: '只用主風格', title: '只使用主風格的色板' },
              { value: 'blend', label: '融合', title: '各角色在 OKLab 空間按權重混色' },
            ]}
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <SectionTitle right={Object.keys(tune.custom).length > 0 && <Button size="xs" variant="ghost" onClick={() => setTune({ custom: {} })}>還原色板</Button>}>
          自訂色板
        </SectionTitle>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-fg-2">遇到會換色的風格（白模、8-bit、積木…）</span>
          <Segmented
            id="t-keep"
            size="sm"
            value={tune.keepColors === false ? 'style' : 'mine'}
            onChange={(x) => setTune({ keepColors: x === 'mine' })}
            className="w-full [&>button]:flex-1"
            options={[
              { value: 'mine', label: '優先用我的顏色', title: '自訂色板與主題自帶的顏色蓋過風格的色板；8-bit、16-bit、積木等量化風格會把你的顏色加進它們的調色板，所以顏色不會被換掉' },
              { value: 'style', label: '以風格為準', title: '完全照風格的色板與調色板：白模變白、8-bit 換成它的 16 色（自訂色板暫時失效）' },
            ]}
          />
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {PAL_KEYS.map((k) => (
            <label key={k} htmlFor={`pal-${k}`} className="flex items-center gap-2 rounded-md border border-line bg-panel-2 px-2 py-1 text-xs">
              <input
                id={`pal-${k}`}
                type="color"
                value={look.pal[k as keyof Palette].slice(0, 7)}
                onChange={(e) => setTune({ custom: { ...tune.custom, [k]: e.target.value } })}
                className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
              />
              <span className="flex-1 text-fg-2">{ROLE_NAME[k as keyof Palette]}</span>
              {tune.custom[k as keyof Palette] && <span className="size-1.5 rounded-full bg-mot" title="已自訂" />}
            </label>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <SectionTitle>效能</SectionTitle>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-fg-2">預覽畫質</span>
          <Segmented
            id="t-quality"
            size="sm"
            value={String(quality)}
            onChange={(x) => set({ quality: parseInt(x) as 0 | 1 | 2 })}
            className="w-full [&>button]:flex-1"
            options={[
              { value: '0', label: '高' },
              { value: '1', label: '標準' },
              { value: '2', label: '省電' },
            ]}
          />
        </div>
        <label htmlFor="t-thumbs" className="flex items-center justify-between gap-2 text-xs text-fg-2">
          風格庫縮圖持續播放
          <input id="t-thumbs" type="checkbox" checked={thumbsAnimate} onChange={(e) => set({ thumbsAnimate: e.target.checked })} className="size-4 accent-[var(--mot)]" />
        </label>
      </div>
    </div>
  );
}

/** 目前混合對應的聲音規格（給 JSON 與 Claude 提示詞用） */
function useSoundSpec(): SoundSpec | null {
  const { plan } = useAudioPlan();
  const { look, move, tune } = useLookMove();
  const subject = useStore((s) => s.subject);
  const aspect = useStore((s) => s.aspect);
  return useMemo(() => {
    const L = plan.animSeconds;
    const cues = plan.pack ? new CueTracker(subject, move, tune, look, ASPECT[aspect]).cues.map((c) => ({ t: round(c.u * L, 2), kind: c.kind })) : [];
    return {
      title: plan.song.title,
      genre: plan.genreLabel,
      scheme: SCHEME_INFO[plan.scheme].name,
      pack: plan.pack ? PACK_INFO[plan.pack].name : null,
      bpm: Math.round(plan.song.bpm),
      key: `${NOTE_NAMES[plan.song.key]} ${MODE_NAME[plan.song.mode as Mode] ?? plan.song.mode}`,
      cues,
    };
  }, [plan, look, move, tune, subject, aspect]);
}

const CODE_GUIDE: Record<'css' | 'gsap' | 'ae' | 'json', { badge: string; who: string; what: string; how: string[] }> = {
  css: {
    badge: '給前端工程師',
    who: '前端工程師、網頁設計師',
    what: '把混合後的緩動、時長與錯峰寫成 CSS 變數和 @keyframes。',
    how: ['複製代碼，貼進你的樣式表。', '把 class 套到要動的元素（.sf-enter 進場、.sf-hop 跳躍…；有哪些 class 取決於目前的動作參數）。', '用 style="--i: 0／1／2…" 設定每個元素的錯峰順序。'],
  },
  gsap: {
    badge: '給前端工程師',
    who: '前端工程師（使用 GSAP 動畫庫）',
    what: '同一組動效的 GSAP 3 寫法，緩動用 CustomEase 精確還原（含回彈）。',
    how: ['安裝 gsap（npm i gsap），或從 CDN 載入 gsap 與 CustomEase。', '貼上代碼，把 ".item"、".hero" 換成你自己的元素選擇器。', '有定格風格時，代碼會加上全域幀率步進。'],
  },
  ae: {
    badge: '給 After Effects 動畫師',
    who: 'After Effects 動畫師',
    what: '每個動效風格對應的表達式，最上面註明了幀率與緩動曲線。',
    how: ['在圖層上選取要動的屬性（位置、縮放、旋轉…）。', '按住 Alt（Mac 是 Option）再點屬性旁的碼表，打開表達式欄位。', '貼上對應風格的表達式；定格風格先貼最上面的 posterizeTime。'],
  },
  json: {
    badge: '給 AI Agent／程式',
    who: 'AI Agent（例如 Claude、ChatGPT）或你的自動化程式；不是給人直接閱讀的。',
    what: '完整、機器可讀的風格規格：選了哪些風格與權重、解析後的色板、描邊、後期、緩動與節奏（3D 與聲音也會一起列出）。',
    how: ['整段複製，貼給 AI Agent 當作「風格規格」輸入。', '搭配「AI 提示詞」分頁裡「給 Claude 做動畫」的提示詞，Claude 就能照規格寫出整段動畫。', '程式讀取後可以自行重建這個風格；visual、motion、tune 欄位也能用來還原配方。'],
  },
};

function CodeTab() {
  const { brief, look, move, v, m, tune, subject } = useBrief();
  const sound = useSoundSpec();
  const [lang, setLang] = useState<'css' | 'gsap' | 'ae' | 'json'>('css');
  const code = useMemo(() => {
    if (lang === 'css') return cssCode(brief, move);
    if (lang === 'gsap') return gsapCode(brief, move);
    if (lang === 'ae') return aeCode(brief, move);
    return jsonCode(v, m, subject, tune, look, move, sound);
  }, [lang, brief, move, v, m, subject, tune, look, sound]);
  const g = CODE_GUIDE[lang];
  return (
    <div className="flex flex-col gap-2 pb-4">
      <p className="text-xs leading-relaxed text-fg-3">這一頁把目前的混合「翻譯」成不同工具看得懂的格式。先選你要用的工具，下面會說明這份代碼是給誰用、怎麼用。</p>
      <Segmented
        id="code-lang"
        size="sm"
        value={lang}
        onChange={setLang}
        className="w-full [&>button]:flex-1"
        options={[
          { value: 'css', label: 'CSS' },
          { value: 'gsap', label: 'GSAP' },
          { value: 'ae', label: 'AE' },
          { value: 'json', label: 'JSON' },
        ]}
      />
      <div className="rounded-lg border border-line bg-panel-2 p-3">
        <div className="mb-1.5 flex items-center gap-2">
          <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${lang === 'json' ? 'bg-mot text-on-mot' : 'bg-vis-soft text-vis'}`}>{g.badge}</span>
          <span className="text-[12px] text-fg-2">{g.who}</span>
        </div>
        <p className="text-[12px] leading-relaxed text-fg-2">{g.what}</p>
        <ol className="mt-1.5 list-decimal space-y-0.5 pl-5 text-[12px] leading-relaxed text-fg-2">
          {g.how.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ol>
      </div>
      <div className="flex justify-end">
        <CopyButton text={code} label="複製代碼" />
      </div>
      <CodeBlock code={code} maxH={520} />
    </div>
  );
}

function PromptTab() {
  const { brief, look, move, subject, v, m, tune } = useBrief();
  const aspect = useStore((s) => s.aspect);
  const sound = useSoundSpec();
  const p = useMemo(() => aiPrompts(brief, subject, aspect, look, move), [brief, subject, aspect, look, move]);
  const claude = useMemo(() => claudePrompts(brief, subject, look, move, sound), [brief, subject, look, move, sound]);
  const blocks: [string, string, string][] = [
    ['圖像生成（英文）', 'Midjourney／Stable Diffusion／Flux', p.imageEn],
    ['圖像生成（中文）', '中文模型或給設計師的描述', p.imageZh],
    ['影片生成（英文）', 'Runway／Sora／Kling／Veo', p.videoEn],
    ['影片生成（中文）', '可靈、即夢等中文影片模型', p.videoZh],
    ['反向提示詞', 'Negative prompt', p.negative],
  ];
  return (
    <div className="flex flex-col gap-4 pb-4">
      <p className="flex items-start gap-2 text-xs leading-relaxed text-fg-3">
        <FileText size={14} className="mt-0.5 shrink-0" />
        依目前的主體、風格組合、色板與節奏自動組出提示詞，可直接貼到生成工具，或當成給團隊的風格描述。
      </p>

      <section aria-labelledby="claude-prompt-title" className="rounded-xl border border-mot/50 bg-mot-soft p-3">
        <h3 id="claude-prompt-title" className="text-[13px] font-bold">
          給 Claude：把這套風格套用到我的新專案
        </h3>
        <p className="mt-1 text-[12px] leading-relaxed text-fg-2">
          只貼這一份提示詞就夠：它把你選的風格（色板、填色、描邊、後期質感、動作、聲音）交給 Claude，並分兩階段進行——<b>階段一先做靜態分鏡，Claude 自己審美打分並修改，然後停下來等你確認</b>；你回覆「確認」（或給修改意見）之後，<b>階段二才在確認過的分鏡上加動效</b>。使用方式：貼上之前，<b>先在「專案內容」那一節填上你要做的事</b>（例如「新中國成立 77 週年大事記的 HTML 動畫」）。資訊不足時它不會先問你，而是自己假設並在階段一最後列出，讓你確認時一併修正。舞台上的示範動畫只是風格範例，不會被照搬。
        </p>
        {(
          [
            ['完整提示詞（中文）', claude.zh],
            ['Full prompt (English)', claude.en],
          ] as [string, string][]
        ).map(([t, text]) => (
          <div key={t} className="mt-2.5">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-[12.5px] font-medium">{t}</span>
              <CopyButton size="xs" text={text} />
            </div>
            <CodeBlock code={text} maxH={240} />
          </div>
        ))}
      </section>

      {blocks.map(([t, sub, text]) => (
        <div key={t} className="rounded-lg border border-line bg-panel-2 p-3">
          <div className="mb-1.5 flex items-start justify-between gap-2">
            <div>
              <div className="text-[13px] font-medium">{t}</div>
              <div className="text-[11px] text-fg-3">{sub}</div>
            </div>
            <CopyButton size="xs" text={text} />
          </div>
          <p className="select-all text-[12.5px] leading-relaxed text-fg-2">{text}</p>
        </div>
      ))}
    </div>
  );
}
