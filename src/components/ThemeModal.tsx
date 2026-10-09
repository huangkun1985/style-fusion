// 「匯入主題」視窗：匯入動畫主題檔（JSON）、管理已匯入的主題、下載範本、格式說明、複製給 AI 的提示詞。
import { Check, Download, FileUp, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { THEME_LIMITS, themeCues, themes, type ThemeInfo } from '../engine/themes';
import { THEME_TEMPLATES, templateJson, themeAiPrompt } from '../engine/themeTemplates';
import { saveBlob } from '../lib/platform';
import { useStore } from '../store/store';
import { Button, CopyButton, Modal, SectionTitle } from './ui';

function countLayers(l: ThemeInfo['theme']['layers']): number {
  return l.reduce((s, x) => s + 1 + countLayers(x.children), 0);
}

export function ThemeModal() {
  const open = useStore((s) => s.themeOpen);
  const set = useStore((s) => s.set);
  const showToast = useStore((s) => s.showToast);
  useStore((s) => s.themeRev); // 主題變動時重畫
  const subject = useStore((s) => s.subject);
  const [error, setError] = useState('');
  const [warn, setWarn] = useState<string[]>([]);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const list = themes.list();
  const curId = themes.currentId();

  const importText = (text: string, label: string) => {
    try {
      const { theme } = themes.add(text);
      setError('');
      setWarn(theme.warnings);
      set({ subject: 'custom' });
      showToast(`已匯入主題「${theme.name}」${theme.warnings.length ? `（有 ${theme.warnings.length} 個提醒）` : ''}`);
    } catch (e) {
      setWarn([]);
      setError(`「${label}」匯入失敗：\n${(e as Error).message}`);
    }
  };
  const importFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > THEME_LIMITS.bytes * 2) {
      setWarn([]);
      return setError(`「${f.name}」太大（超過 ${Math.round((THEME_LIMITS.bytes * 2) / 1000)} KB），主題檔通常只有幾 KB`);
    }
    importText(await f.text(), f.name);
  };

  return (
    <Modal open={open} onClose={() => set({ themeOpen: false })} title="匯入動畫主題" wide>
      <div
        className={`flex flex-col gap-5 ${drag ? 'rounded-xl outline-dashed outline-2 outline-mot' : ''}`}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
            setDrag(true);
          }
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void importFile(e.dataTransfer.files[0]);
        }}
      >
        <p className="max-w-3xl text-sm leading-relaxed text-fg-2">
          主題就是畫面上「演的那一個東西」（像角色跳躍、UI 介面）。你可以自己做一個：寫一個 JSON 檔，用圓、矩形、曲線、文字等圖層和關鍵影格定義動畫，匯入後它會和內建的主體並列，
          <span className="text-fg">所有圖像風格（色板、描邊、填色、後期特效）與動效風格（緩動、誇張、果凍…）都會套上去</span>。檔案只在你的瀏覽器裡處理，不含任何程式碼。
        </p>

        <div>
          <SectionTitle>匯入</SectionTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={() => fileRef.current?.click()}>
              <FileUp size={16} /> 選擇主題檔…
            </Button>
            <span className="text-xs text-fg-3">也可以把檔案直接拖進這個視窗（.json 或 .sfanim.json）</span>
            <input
              ref={fileRef}
              type="file"
              accept=".json,.sfanim,application/json"
              className="hidden"
              onChange={(e) => {
                void importFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>
          {error && <pre className="mt-3 whitespace-pre-wrap rounded-lg border border-danger/50 bg-danger/10 p-3 text-xs leading-relaxed text-danger">{error}</pre>}
          {!!warn.length && (
            <div className="mt-3 rounded-lg border border-line-2 bg-panel-2 p-3 text-xs leading-relaxed text-fg-2">
              <div className="mb-1 font-semibold text-fg">匯入成功，但有 {warn.length} 個提醒（不影響播放）：</div>
              <ul className="list-disc pl-4">
                {warn.slice(0, 8).map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div>
          <SectionTitle right={<span className="text-[11px] text-fg-3">最多 {THEME_LIMITS.saved} 個，存在這個瀏覽器</span>}>我的主題</SectionTitle>
          {list.length === 0 ? (
            <p className="text-xs text-fg-3">還沒有匯入。先下載下面的範本，或直接「載入範本試試」。</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {list.map(({ id, theme }) => {
                const on = id === curId;
                return (
                  <li key={id} className={`flex items-center gap-2 rounded-lg border p-2 ${on && subject === 'custom' ? 'border-mot/60 bg-mot-soft' : 'border-line bg-panel-2'}`}>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold">{theme.name}</div>
                      <div className="truncate text-[11px] text-fg-3">
                        {countLayers(theme.layers)} 個圖層 · 循環 {theme.loop} 秒{theme.ground !== undefined ? ' · 有地面' : ''}
                        {theme.events.length ? ` · ${theme.events.length} 個事件` : ''}
                        {themeCues(theme).length ? ` · ${themeCues(theme).length} 個音效` : ' · 無聲'}
                      </div>
                    </div>
                    <Button
                      size="xs"
                      variant={on ? 'soft' : 'outline'}
                      onClick={() => {
                        themes.use(id);
                        set({ subject: 'custom' });
                        setWarn(theme.warnings);
                        setError('');
                      }}
                    >
                      {on && subject === 'custom' ? (
                        <>
                          <Check size={13} /> 使用中
                        </>
                      ) : (
                        '使用'
                      )}
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      title="刪除這個主題"
                      aria-label={`刪除主題 ${theme.name}`}
                      onClick={() => {
                        themes.remove(id);
                        if (!themes.has() && subject === 'custom') set({ subject: 'mascot' });
                      }}
                    >
                      <Trash2 size={13} />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div>
          <SectionTitle>範本</SectionTitle>
          <p className="mb-2 text-xs leading-relaxed text-fg-3">範本是可以直接匯入的完整主題檔，也是最好的學習材料：下載後用文字編輯器打開、改數字、再匯入看效果。</p>
          <div className="flex flex-wrap gap-2">
            {THEME_TEMPLATES.map((t) => (
              <div key={t.id} className="flex items-center gap-1 rounded-lg border border-line bg-panel-2 p-1.5">
                <span className="px-1.5 text-[13px] font-semibold">{t.label}</span>
                <Button size="xs" variant="soft" onClick={() => importText(templateJson(t.data), t.label)}>
                  載入試試
                </Button>
                <Button size="xs" variant="outline" onClick={() => saveBlob(new Blob([templateJson(t.data)], { type: 'application/json' }), t.file)}>
                  <Download size={13} /> 下載
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <SectionTitle right={<CopyButton size="xs" text={themeAiPrompt()} label="複製給 AI 的提示詞" />}>給 AI 的提示詞</SectionTitle>
          <p className="mb-2 text-xs leading-relaxed text-fg-3">
            不想自己寫？按右上的「複製給 AI 的提示詞」貼給 Claude 或其他 AI 助手，<b>最後把結尾那句「我想要的動畫是：」補完</b>（例如「一隻在水上划水的黃色小鴨」），就能得到可以直接匯入的檔案。提示詞已包含格式、範本與音效指南；完整規格在專案的 <span className="num">docs/動畫主題格式說明.md</span>，提示詞全文也存在 <span className="num">docs/動畫主題-給AI的提示詞.txt</span>。
          </p>
          <details className="rounded-lg border border-line bg-panel-2 p-3">
            <summary className="cursor-pointer text-[13px] font-semibold">展開提示詞全文（複製的就是這一份）</summary>
            <pre className="mt-2 max-h-[40vh] overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed text-fg-2">{themeAiPrompt()}</pre>
          </details>
        </div>
      </div>
    </Modal>
  );
}
