// 「關於」：版本、這一版的重點、快捷鍵，以及聲音取樣的來源與授權。
import { useMemo } from 'react';
import { PACK_INSTRUMENTS } from '../audio/pack/meta';
import { Modal } from './ui';

export const APP_VERSION: string = __APP_VERSION__;

const HIGHLIGHTS = [
  '試聽中換曲風、調性、速度或重新作曲，會自動換成新的那首歌（不必先停止再重按）；試聽改為循環播放，按暫停才停，離開「聲音」分頁也會自動停止。',
  '同一首歌只會渲染一次（試聽與背景音樂共用），只換音效包不會重新渲染音樂，來回切換曲風更快。',
  '（1.1.1）音樂改用真實樂器取樣，XM 方案也用同一批 16 位元取樣；曲風 34 種，涵蓋流行、K-Pop、R&B、搖滾、爵士、電影管弦等。',
  '（1.1.1）代碼分頁說明每份代碼給誰用；提示詞分頁新增「給 Claude：用程式碼把這個動畫做出來」；風格庫縮圖區變大。',
];

const KEYS: [string, string][] = [
  ['空白鍵', '播放／暫停'],
  ['← →', '逐幀'],
  ['M', '聲音開／關'],
  ['O　P　G', '洋蔥皮　運動軌跡　四宮格'],
  ['R', '靈感骰子（鎖定的風格會保留）'],
];

export function AboutModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  // 取樣來源：依授權來源分組
  const sources = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const inst of Object.values(PACK_INSTRUMENTS)) {
      const list = m.get(inst.src) ?? [];
      list.push(inst.id);
      m.set(inst.src, list);
    }
    return [...m.entries()];
  }, []);
  return (
    <Modal open={open} onClose={onClose} title={<span>關於 Style Fusion · <span className="num text-fg-2">v{APP_VERSION}</span></span>}>
      <div className="flex flex-col gap-5 text-[13px] leading-relaxed">
        <section>
          <h3 className="mb-1.5 font-semibold">這一版的重點</h3>
          <ul className="list-disc space-y-1 pl-5 text-fg-2">
            {HIGHLIGHTS.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-fg-3">完整更新紀錄在專案根目錄的 CHANGELOG.md，每一版的驗收報告在 docs 資料夾。</p>
        </section>
        <section>
          <h3 className="mb-1.5 font-semibold">快捷鍵</h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            {KEYS.map(([k, d]) => (
              <div key={k} className="contents">
                <dt className="num rounded bg-panel-2 px-1.5 text-fg">{k}</dt>
                <dd className="text-fg-2">{d}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section>
          <h3 className="mb-1.5 font-semibold">聲音素材與授權</h3>
          <p className="text-fg-2">所有晶片音、合成器、人聲、音效與作曲都由程式即時計算；只有「真實樂器」使用下列開放取樣，已裁切、重新取樣並壓縮成單聲道 MP3 內嵌在這個檔案裡。</p>
          <ul className="mt-2 space-y-1 text-xs text-fg-2">
            {sources.map(([src, ids]) => (
              <li key={src}>
                <span className="font-medium text-fg">{src}</span>
                <span className="text-fg-3">：{ids.join('、')}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-fg-3">VSCO 2 Community Edition 與 Versilian Community Sample Library 為 CC0（公眾領域貢獻）；Karoryfer、Freesound、Iowa 的取樣依其來源網站所標示的授權使用，詳見專案根目錄的 CREDITS.md。</p>
        </section>
      </div>
    </Modal>
  );
}
