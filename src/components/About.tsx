// 「關於」：版本、這一版的重點、快捷鍵，以及聲音取樣的來源與授權。
import { useMemo } from 'react';
import { PACK_INSTRUMENTS } from '../audio/pack/meta';
import { Modal } from './ui';

export const APP_VERSION: string = __APP_VERSION__;

const HIGHLIGHTS = [
  '主體列新增「匯入主題」：用 JSON 檔自己定義動畫（圖層＋關鍵影格），圖像風格與動效風格照樣套用；視窗裡有格式說明、兩個範本，還能複製給 AI 的提示詞。走路循環的手腳改成對側擺動。XM 音色大幅改善（循環接縫、插值雜音、逐音取最近的取樣、依樂器的顫音），取樣包補密。',
  '聲音分頁可以「匯入 MIDI」：選一個 .mid 檔（或拖進來），就能用 8-bit NES、Game Boy、C64、FM、MIDI 取樣或 XM 演奏，再導出 WAV、MIDI、XM。檔案只在你的瀏覽器裡處理，不會上傳。',
  '曲風新增 13 種「純樂器」（沒有鼓）：古典鋼琴現在是真的鋼琴獨奏，另有鋼琴獨奏、小提琴、大提琴、古典吉他、長笛與豎琴、薩克斯風、豎琴、弦樂四重奏、銅管合奏、顫音琴與馬林巴、管風琴、八音盒。XM 方案也大幅修正（音符不再被丟掉、混音比例與 MIDI 一致）。',
  '聲音分頁新增「名曲」：11 首公共領域的經典（歡樂頌、卡農、給愛麗絲、小步舞曲、巴赫前奏曲、土耳其進行曲、山魔王、命運動機、鈴兒響叮噹、小星星、雅克兄弟輪唱）。旋律照原曲，曲風變成編曲風格，同一首歌可以聽它變成爵士、搖滾或電影管弦。',
  '（1.1.2）試聽中換曲風、調性、速度或重新作曲，會自動換成新的那首歌；試聽改為循環播放，按暫停才停，離開「聲音」分頁也會自動停止。同一首歌只渲染一次，只換音效包不會重新渲染音樂。',
  '（1.1.1）音樂改用真實樂器取樣，XM 方案也用同一批 16 位元取樣；曲風 34 種（1.2.0 起 46 種），涵蓋流行、K-Pop、R&B、搖滾、爵士、電影管弦等。',
  '（1.1.1）代碼分頁說明每份代碼給誰用；提示詞分頁新增「給 Claude：用程式碼把這個動畫做出來」；風格庫縮圖區變大。',
];

const KEYS: [string, string][] = [
  ['空白鍵', '播放／暫停'],
  ['← →', '逐幀'],
  ['M', '聲音開／關'],
  ['F', '全螢幕展示（畫面連點兩下也可以）'],
  ['R', '靈感骰子：隨機風格、動效與音樂'],
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
