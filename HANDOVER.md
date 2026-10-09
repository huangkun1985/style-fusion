# Style Fusion 交接文件（Hand over）

> 寫給**在新的 session 接手這個專案的人（或新的 Claude）**。
> **2026-10-09：v1.2.0 已提交並推送到私密倉庫 https://github.com/huangkun1985/style-fusion（標籤 v1.2.0）。階段總結與下階段重點：`docs/階段總結-v1.2.0與下階段重點.md`。**
> 交接時間：2026-10-03（一個很長的 session 的結尾）　專案版本：**v1.2.0**
> **git 狀態：最後一次提交是 `v1.1.2`（標籤 `v1.1.1`、`v1.1.2`）；v1.2.0 的所有改動（約 70 個檔案，含新增檔）都還沒有 commit、沒有打標籤。** 使用者還沒說要提交；新 session 開頭先 `git status` 確認，**不要自己 commit**，要問。
> ## 🆕 2026-10-08：新增 6 個主體、重做抽象流動與 3D 角色、小黃鴨主題 v2（全部未提交）
> **新 session 先讀 `docs/交接-新主體與重做後.md`。**
>
> ## ✅ 主體 v2 第二版已全部重做（2026-10-05～07，未提交），等使用者審核
> **新 session 先讀 `docs/交接-主體v2第二輪後.md`，並使用 `docs/下個session的提示詞.md` 的提示詞。**
> 14 個主體都重做過：角色跳躍、UI、走路、文字標誌是逐個和使用者確認過方向的；其餘 10 個是依這四個的標準一次改完、**使用者還沒看過**。細節看 `docs/主體v2參考/`（含 `其餘主題.md`）。下面這段是重做前的任務說明，保留作為流程參考。
>
> ## ⚠️ 下一個 session 的首要任務：重做主體 v2（先找參考圖、再仿照設計）
> 使用者看過主體 v2 第一版後說「還是太醜了」，要求**每個主體先在網路上找一張美觀的參考圖（真的下載、用 Read 看過），再仿照設計**。完整計畫、流程、工具與驗收標準在 **`docs/交接-主體v2重做.md`**（先讀它）。第一版已備份在 `docs/主體v2初稿/`；接觸表工具在 `scripts/design-sheet/`。**上個 session 結束時沒有再改程式。**
>
> 專案位置：`E:\31-coding\20261002_style_fusion`
> 建議閱讀順序：本文件 → `README.md` → `CHANGELOG.md`（最上面的 1.2.0 一節很長，是這個 session 的完整紀錄）→ `docs/驗收報告-v1.2.0.md`（第 4–5g 章：每項新功能怎麼驗證的、**哪些沒驗證**）→ `docs/驗收報告-v1.1.1.md`（較早的待辦與聽感清單）。使用者文件：`docs/動畫主題格式說明.md`。

---

## 1. 一句話說明

**Style Fusion（動效設計風格混合器）**：給動效設計師的純網頁「風格參考台」。選圖像風格、選動效風格、任意混搭，即時看到動畫，並拿到色板、緩動、CSS／GSAP／AE 代碼、AI 提示詞（含給 Claude 的做動畫提示詞）、導出（GIF／MP4／WebM／PNG 序列／精靈圖）、以及依風格自動作曲的配樂與音效（WAV／MIDI／XM／MP4 音軌）。

**硬性條件**：必須能直接在網頁跑（開發伺服器或雙擊的單一 `dist/index.html`），**不能打包成 exe**。

## 2. 現況快照（v1.2.0）

| 項目 | 數量／狀態 |
| --- | --- |
| 圖像風格 | 136（含 25 種真 3D） |
| 動效風格 | 68（含 10 種 3D 運鏡） |
| 案例配方 | 56（其中 12 個是首次開啟的「起點」） |
| 主體 | 21（2026-10-09：新增載入、標誌、煙火、3D 產品、天氣、人像、音樂視覺化；原 14（各有 v1 原設計與 v2 重新設計，全域切換，預設 v2；見 `docs/主體v2設計說明.md`）＋ 1 個「自訂主題」（使用者匯入的動畫檔；5 個真 3D：shapes3d、char3d、text3d、terrain3d、voxel） |
| 後期特效 | 40（WebGL2） |
| 聲音方案 | 6：8-bit NES、Game Boy、C64 SID、Mega Drive FM、**MIDI（真實樂器取樣）**、**XM 追蹤器（同一批取樣轉 16 位元多音區）** |
| 名曲 | 11 首公共領域經典（古典 8、民謠與節慶 3），可套任何曲風當編曲；`src/audio/classics.ts` |
| 曲風 | 46（流行、K-Pop、J-Pop、華語抒情、R&B、嘻哈、浩室、搖滾、爵士、電影管弦…，仍保留 Chip／合成波等復古類；另有 13 種**純樂器**曲風：古典鋼琴、鋼琴獨奏、小提琴、大提琴、古典吉他、長笛與豎琴、薩克斯風、豎琴、弦樂四重奏、銅管合奏、顫音琴與馬林巴、管風琴、八音盒，都沒有鼓） |
| 音效 | 5 個音效包 × 19 種（含水花 splash、鴨叫 quack），全部程式合成 |
| 取樣包 | 26 種樂器、339 個音區、25 種鼓／打擊樂，約 6.07 MB MP3 |
| 成品 | `dist/index.html` 約 **10.3 MB**（單檔，內嵌取樣）；程式約 2.4 萬行 TypeScript |
| 品質檢查 | `tsc` 通過；`npm run test:audio` 全過（音訊＋匯入 MIDI＋自訂主題三組測試）；`npx tsx scripts/classics-check.ts` 全過；`audio-sweep` midi／xm 全正常；正式建置通過 |

**最重要的未驗證事項**：沒有任何人**聽過**音樂（含新加的名曲，旋律是依記憶寫成音符，可能有錯音）。我（Claude）聽不到聲音，只能用數據（波形、頻譜、A 加權響度、循環接縫掃描、libopenmpt 解碼）驗證。使用者要親自聽並回饋。

## 2b. 這個 session 做了什麼（全部是 v1.2.0，全部未提交）

照使用者提出的順序（每項的細節、數據、限制都在 `CHANGELOG.md` 與 `docs/驗收報告-v1.2.0.md`）：

1. **名曲庫**：11 首公共領域經典（歡樂頌、卡農、給愛麗絲、小步舞曲、巴赫前奏曲、土耳其進行曲、山魔王、命運動機、鈴兒響叮噹、小星星、雅克兄弟輪唱），旋律＋和弦照原曲、曲風當「編曲風格」。**現代流行歌與動漫歌因著作權不內建**，改走「匯入 MIDI」。
2. **XM 音色大修**（使用者說比 8-bit 還難聽）：量到丟 35% 音符、混音比例失衡（鼓蓋過旋律）、鼓被降到 22 kHz、合成音色沒校準、單聲道切斷餘音…全修；後來又修循環接縫、插值雜音、逐音取最近的取樣、依樂器的顫音（見 6.4e）。
3. **純樂器曲風 13 種**（古典鋼琴改成真的鋼琴、其餘 12 種新增，沒有鼓）；鼓型 `none` 的曲風不再冒出華爾茲鼓。
4. **靈感骰子＝全部抽卡**：風格、動效、**主體**、微調參數、音樂（含名曲、匯入的 MIDI）；「主體」「音樂」各有鎖定鈕。
5. **舞台**：新比例「填滿」（預設，用完整個舞台區）、全螢幕展示（按鈕／F／連點兩下；原生全螢幕不可用時退回鋪滿視窗）；混合配方標題列固定一行，骰子位置不跳。
6. **配方碼與收藏帶著音樂**（B-02）。
7. **匯入 MIDI**：解析→角色判斷→調性／和弦偵測→取一段→轉成 `Song`，之後任何聲音方案（8-bit、GB、SID、FM、MIDI 取樣、XM）都能演奏並導出 WAV／MIDI／XM；`.xm` 支援多樂段；`@tonejs/midi` 改成正式依賴（**`package-lock.json` 是手動改的 `dev` 旗標，離線時 `npm install` 無法更新**）。
8. **走路循環同手同腳**修正（手臂相位接反）。
9. **匯入動畫主題**：JSON 格式（圖層＋關鍵影格）、驗證、範本 2 個、格式文件、AI 提示詞、`custom` 主體。
10. **取樣包補密**（296→339 個音區）並重跑兩份校準表。

## 3. 怎麼把專案跑起來

需求：Node.js 20+（開發機是 24）、npm。選用：`ffmpeg`（建取樣包、Node 端音訊測試要）、Python 3 + `numpy scipy soundfile matplotlib`（音訊分析腳本要）。

| 想做的事 | 指令 |
| --- | --- |
| 一鍵啟動（使用者習慣用這個） | 雙擊 `start.bat`（必要時安裝／建置，開 http://127.0.0.1:4173）；開發模式雙擊 `start-dev.bat`（http://localhost:5199） |
| 開發伺服器 | `npm run dev`（5199） |
| 型別檢查 | `npm run typecheck` |
| 音訊自我檢查 | `npm run test:audio` |
| 正式建置 | `npm run build` → `dist/index.html` |
| 預覽成品 | `npm run preview -- --port 4180 --strictPort` |
| 所有曲風渲染檢查 | `npm run audio:sweep [方案=midi] [動畫秒數=3.2]` |
| 重建取樣包 | `npm run samples:build`（要網路、ffmpeg；下載約 150 MB 到 `scripts/samples/.cache`，已被 git 忽略） |

`.claude/launch.json` 有三個預覽設定：`style-fusion`（開發，5199）、`style-fusion-dist`（成品，4173）、`style-fusion-dist-test`（成品，4180）。**使用者自己常常開著 `start.bat`，佔用 4173**；測試成品請用 4180。

## 4. 使用者與合作方式（很重要）

- **一律用繁體中文**溝通；介面、README、報告、程式註解都是繁體中文。
- 使用者是動效／視覺設計師，不是工程師。他靠「實際點點看」驗收，所以每次交付都要講清楚：做了什麼、怎麼驗證、**哪些沒驗證**。不要誇大；做不到的（例如聽音樂）要直說。
- 他的回饋風格：具體的操作問題。反覆出現的主題：
  1. 介面上要**解釋清楚**每個東西是做什麼的、給誰用的（例如代碼要標明「給 AI Agent」）。
  2. 點擊之後**版面不能亂跳**、標籤不能換位置。
  3. 預覽區要夠大。
  4. **多樣性**：音樂不能全部像遊戲配樂，要有流行、K-Pop、R&B…
  5. 聲音要像真的樂器，不要電子音（他已授權下載更好的取樣）。
  6. 操作邏輯要符合直覺（例如試聽中換曲風，聲音要跟著換）。
  7. **隨機＝真的全部隨機**（抽卡的概念）：主體、參數、音樂都要換；要有鎖定。
  8. **固定位置的按鈕不能跳**（版面會換行就是 bug）。
  9. 想要**經典老歌**（歐美流行、動漫、純音樂）——著作權的部分已說明並提供「匯入 MIDI」；他要的是能**轉成其他格式**（8-bit、XM…），不只是播放。
  10. 音色質量（XM 比 MIDI 難聽）他很在意，願意下載更好的取樣。
  11. 要**自己能擴充內容**：匯入 MIDI、匯入動畫主題；格式要**寫文件、附範本**。
- **版本文件規範**（他明確要求）：每個版本都要更新 `CHANGELOG.md`、改 `package.json` 版本號、在 `docs/` 新增 `驗收報告-vX.Y.Z.md`、打 git 標籤。他要求把驗收意見**合併進下一個修訂版**，不要自作主張升次版本。規範全文在 `docs/驗收報告-v1.1.0.md` 第 9 章。
- 未經要求不要 commit／push。過去的提交都是在「發版」這個既定流程裡做的；**1.2.0 的全部改動（含這份文件）都還沒提交**，使用者說「提交」才做（版本號已是 1.2.0，標籤打 `v1.2.0`）。
- Claude 的記憶檔在 `C:\Users\iamhk\.claude\projects\E--31-coding-20261002-style-fusion\memory\`（有 `MEMORY.md` 索引，新 session 會自動載入）。更完整的歷史對話在同資料夾的 `2c006a29-8cd2-4244-bf8a-7a5bafdf51d5.jsonl`，需要追溯細節時再讀。

## 5. 專案地圖

```
index.html            入口（單一頁面）
start.bat / start-dev.bat   一鍵啟動器（CRLF，.gitattributes 已設定）
CHANGELOG.md          版本紀錄（最上面是最新）
CREDITS.md            取樣來源與授權
HANDOVER.md           本文件
docs/                 每版驗收報告（v1.1.0 含路線圖與版本規範；v1.1.1 含待辦與聽感清單；v1.2.0 含本 session 的所有驗證）、動畫主題格式說明.md、範本-動畫主題/（兩個可匯入的範本）
scripts/              開發工具（見第 8 章）
src/
  main.tsx            入口；DEV 模式把 audio/clock/store 掛到 window.__sf；最外層 ErrorBoundary
  App.tsx             版面與全域快捷鍵、3D 預熱
  styles.css          主題色（深／淺）、對比度已調到 ≥4.5:1
  components/         介面：Stage（舞台＋播放列）、StyleBrowser（風格庫）、MixTray、InfoPanel（處方／聲音／微調／代碼／提示詞五個分頁）、
                      SoundPanel（聲音分頁）、Starter（起點選擇）、Modals（導出／分享／詳情）、About、TopBar、Views（圖鑑／配方／收藏）
  data/               風格資料：visual.ts（+visual3d.ts）、motion.ts（+motion3d.ts）、recipes.ts（配方與 12 個起點）、categories.ts、palettes.ts
  engine/             渲染引擎
    renderer.ts       總渲染入口 Renderer.render；3D 懶載入；ready(subject) 供導出等待 3D
    resolve.ts        風格混合（權重、類別勝出、後期合併）→ Look／Move
    brush.ts          風格化畫筆（所有主體都透過它畫）
    motion.ts clock.ts loop.ts   時間管線、播放時鐘、循環長度
    postfx/           WebGL2 後期特效管線（40 個著色器）
    subjects/         14 個主體（每個有 draw、events、cues）＋ custom.ts（自訂主題）；v2/ 是重新設計的版本（登錄在 v2/index.ts，`SUBJECTS[id]` 依全域版本回傳 v1 或 v2）
    themes.ts         自訂動畫主題：JSON 驗證、關鍵影格、繪製、已匯入主題的儲存（見 6.4e）
    themeTemplates.ts 兩個範本、格式摘要、給 AI 的提示詞
    three/            Three.js 3D 舞台、材質、燈光、5 個場景（scenes/v2/ 是 v2 的 5 個場景）
    thumbs.ts         縮圖排程器（共用一個渲染器、有時間預算、含 3D 預熱）
  audio/              聲音系統（第 6 章詳述）；classics.ts（名曲）、midiImport.ts（匯入 MIDI）、xmCalibration.ts（自動產生）
  lib/                brief.ts（處方／代碼／AI 提示詞／給 Claude 的提示詞）、exporter.ts（導出）、sound.ts（開關聲音）、platform.ts
  store/              store.ts（Zustand，localStorage 鍵 `style-fusion-v1`）、hooks.ts（useAudioPlan、useLookMove…）、share.ts（配方碼）
```

## 6. 核心設計（先理解這些再改程式）

### 6.1 動畫是「時間的純函數」
任何一幀都由時間 `t` 直接算出，不依賴累積狀態。因此暫停、拖時間軸、逐幀導出、縮圖都正確。**不要引入需要「從上一幀累加」的狀態。** 風格的時間行為（階梯幀率、停格、慢放…）由 `MotionCtx` 統一重新映射時間。

### 6.2 風格混合
`resolve.ts` 把選中的風格（各有權重）合成成 `Look`（畫面）與 `Move`（動作）：數值加權平均、類別（填色、背景、字體…）由主風格決定、後期特效合併、緩動函數級混合。新增風格只要寫資料（見第 7 章）。

### 6.3 3D
Three.js 在第一次用到 3D 時才動態載入（`renderer.ts` 的 `loadThree`／`ready`）。3D 畫成透明畫布再疊進 2D 流程，所以 3D 風格能和任何 2D 風格、後期混搭。**導出前必須 `await renderer.ready(subject)`**，否則第一幀會是「載入 3D 場景…」占位卡（1.1.1 修過這個 bug）。

### 6.4 聲音管線（最複雜，改之前先讀）
```
圖像風格＋動效風格＋主體 ──profile.ts──▶ 曲風／方案／音效包／速度／能量
                                   │
prefs（使用者偏好）──plan.ts──▶ AudioPlan { song, scheme, pack, songKey, musicKey, key }
                                   │            └ composeSong（compose.ts + genres.ts + theory.ts）
Song（抽象歌曲資料：多軌音符，單位是 16 分音符步數）
   ├─ renderScheme（render.ts）── nes/gb/sid/fm ─▶ chip.ts（晶片音，全程式合成）
   │                          ├─ midi ─▶ gm.ts（合成音色）＋ sampled.ts（真實取樣樂器與取樣鼓）
   │                          └─ xm   ─▶ xm.ts（追蹤器播放器）＋ xmPack.ts（取樣 → XM 樂器）
   ├─ midi.ts：標準 MIDI 輸出　├─ xm.ts writeXm：.xm 輸出　└─ wav.ts
engine.ts（Web Audio）：BGM 渲染成 AudioBuffer 循環播放並跟著動畫時間軸；試聽；音效；導出混音
```
重點規則與概念：
- **音樂長度＝動畫循環的整數倍**（`planLoop`）。所以速度只能落在少數固定值（例如動畫 3.2 秒只有 75／100／150 BPM）；使用者可關閉「對齊動畫循環」。`.xm` 的 BPM 必須是整數，長度可能差 ≤0.5%。
- **識別碼三層**（`plan.ts`）：`songKey`＝同一首歌（與聲音方案、音效包無關）；`musicKey`＝歌＋聲音方案；`key`＝再加音效包。引擎用 `songKey` 判斷「試聽要不要換歌」、用 `musicKey` 判斷「背景音樂要不要重新渲染」，並共用最近 4 筆渲染快取（`engine.ts` 的 `renderFor`）。
- **取樣包**（`src/audio/pack/`）是**自動產生的檔案，不要手改**：由 `scripts/samples/build.mjs` 產生（下載 → 量實際音高 → 去前導靜音 → 持續音在穩定段做無縫循環 → 循環終點後多留 0.15 秒真實聲音以避開 MP3 尾端被削弱 → 音量統一 → 單聲道 MP3）。`sampler.ts` 負責解碼（瀏覽器用 `decodeAudioData`，Node 腳本用 `scripts/node-decoder.ts` 的 ffmpeg 解碼器）；`alignStart()` 處理 Node 解碼多出的編碼延遲。
- **響度校正**（`src/audio/calibration.ts`，**自動產生**）：每個 GM 音色號一個倍率，讓不同樂器同力度同樣大聲。**只要取樣包或音色模型有變，就要重跑**：`npx tsx scripts/calibrate-render.ts <輸出資料夾>` 再 `python scripts/calibrate.py <輸出資料夾> -25`。聲部間的相對比例在 `gm.ts` 的 `ROLE_MIX`；取樣鼓的相對音量在 `sampled.ts` 的 `pickDrum`。
- **鼓組三種**（`Track.kit`）：`acoustic` 全取樣、`hybrid` 合成踢鼓＋取樣、`electronic` 合成鼓＋取樣拍手。預設由鼓型對應（`genres.ts` 的 `KIT_BY_DRUMS`）。
- **XM 方案的音量對齊（1.2.0）**：XM 的音量欄位最高 64，所以旋律取樣在 XM 裡比 MIDI 小約 18 dB；鼓與合成取樣縮小到同一量級（`DRUM_SAMPLE_SCALE`、`SYN_DRUM_SCALE`），再靠母帶標準化。各音色的殘差在 `src/audio/xmCalibration.ts`（`scripts/xm-calibrate-synth.ts` 產生，**取樣包、ROLE_MIX 或合成取樣有變就重跑**）。聲道分配：每聲部有上限（低音 1、主旋律／和聲 2、琶音 3、其他 8），空聲道挑閒置最久的，讓餘音能繼續衰減。檢查工具：`xm-diagnose.ts`（音符保留率應為 100%）、`xm-stems.ts`（逐軌差距應都在 −17～−19 dB 附近）、`xm-verify.ts`（與 libopenmpt 比對時要用 `ffmpeg -ar 44100` 解碼，不然取樣率不同會誤判）。
- **取樣載入失敗會自動退回合成音色**（不會壞掉，只是變電子音）。
- **作曲**：旋律有兩種生成器——新的「動機式」（曲風有 `lead.family` 時，A–A'–A–B 樂句）與舊的隨機走音（晶片類曲風與三拍子）。伴奏／低音／鼓型都是 `genres.ts` 裡的表，`compose.ts` 的 `genBass`／`genComp`／`genDrums` 依表產生。
- **風格 → 音樂**的對應表在 `profile.ts`（`VISUAL` 每個風格 id 一筆、`MOTION` 動效提示）。
- **聲音偏好會被消毒**（`sanitizeAudioPrefs`）：本機儲存裡有壞值不會讓頁面白屏。

### 6.4b 名曲庫（1.2.0）
`src/audio/classics.ts` 放曲目與記譜解析。**只收公共領域作品**；現代流行歌、動漫歌曲有著作權，不放進專案（使用者要的話走「匯入 MIDI」，檔案只在本機處理，是下一步的建議）。
- 記譜：`melody` 以 `|` 分小節，音符 `C4:4`（音名八度:16 分音符步數）、`r:n` 休止；`chords` 每小節 `chordsPerBar` 個和弦（`D A|Bm F#m`，品質支援 `m 7 m7 maj7 dim sus4`）。弱起寫在最後一小節。2/4、3/8 併成 4/4、3/4。解析時會檢查每小節剛好填滿。
- `composeSong({ piece })` → `composeFromPiece`（`compose.ts`）：旋律照原曲（可移調），和弦照原曲，低音／伴奏／琶音／鼓／音色用 `genre`（＝編曲風格）的規格。`AudioPrefs.piece`（`'off'` 預設）；`plan.ts` 在曲風「自動」時用該曲的 `genre`，`songKey` 含曲目 id。
- 循環：`planPieceLoop` 讓「整首 × 重複 1–4 次」剛好等於 k 倍動畫循環；**總步數不能超過 256**（XM 只有一個 256 列的樂段），所以只收短曲或主題。
- 輪唱：`round: n` 讓第二聲部延後 n 小節進入（首尾相接）。
- 介面：`SoundPanel.tsx` 的「名曲」區塊；選了名曲，「曲風」標題變「編曲風格」。

### 6.4e 自訂動畫主題、XM 音質與取樣包（1.2.0）
- **自訂動畫主題**：`src/engine/themes.ts`（`parseTheme` 驗證、`evalTrack`、`layerWorld`、`drawTheme`、`themes` 單例：存 localStorage 的 `sf-themes-v1`，最多 8 個）＋`themeTemplates.ts`（兩個範本、格式摘要、`themeAiPrompt()`）＋`subjects/custom.ts`（`SubjectId` 的 `custom`；`name`／`loop`／`key`／`hero` 是 getter，跟著目前主題走）＋`components/ThemeModal.tsx`。store 的 `themeRev`（`themes.onChange` 訂閱）讓循環秒數等重算；`randomSubject` 沒有主題時不抽 `custom`。**改格式時**：同步改 `themes.ts`（驗證）、`themeTemplates.ts`（摘要與範本）、`docs/動畫主題格式說明.md`，跑 `npx tsx scripts/export-theme-templates.ts` 重新輸出範本檔，`scripts/theme-test.ts` 要全過。
- **XM 轉換（`xm.ts`、`xmPack.ts`）**：每個音用最近的取樣——`packInstrumentSet` 依「這首歌用到的音高」只放需要的音區、放不下拆成多個 XM 樂器（`buildXm` 先預掃音高）；持續音直接用取樣包的循環（**不要自己重做接縫**），並微調取樣率讓循環長度是整數個樣本；播放器是 4 點 Hermite＋逐樣本音量漸變；顫音依 `voiceOf(program).vib`。品質檢查：`scripts/xm-quality.ts`＋`xm-quality.py`（改 XM 轉換或取樣包後都要跑，指標見驗收報告 5g）。
- **取樣包**：`scripts/samples/build.mjs` 的 `tj` 音名清單決定每個樂器放哪些音（來源 Tone.js 樂器庫還有很多沒用的音，`GAP` 邏輯見 git 紀錄的 densify 作法）。**必須整個重跑**（只跑部分樂器不會更新 `meta.ts`）：`node scripts/samples/build.mjs`（要網路，約 150 MB，快取在 `scripts/samples/.cache`）→ `npx tsx scripts/calibrate-render.ts <dir>`＋`python scripts/calibrate.py <dir> -25` → `npx tsx scripts/xm-calibrate-synth.ts` → `npm run test:audio`。目前 26 種樂器、339 個音區、約 6.07 MB。

### 6.4d 匯入 MIDI（1.2.0）
`src/audio/midiImport.ts`：`parseMidiFile`（解析、角色判斷 `assignRoles`、調性偵測 `detectKey`）→ 模組內的單一狀態 `setImportedMidi/getImportedMidi/clearImportedMidi`（≤300 KB 的檔案存在 localStorage 的 `sf-midi-v1`，模組載入時還原，**要在 store 建立之前**，偏好裡的 `piece: 'import'` 才認得）→ `songFromMidi` 轉成 `Song`（段落、移調、`planImportLoop` 與動畫對齊、和弦標示）。
- 接線：`AudioPrefs.piece === 'import'`、`midiStart`／`midiBars`；`composeSong` 分派到 `songFromMidi`；`plan.ts` 的 `songKey` 含 `import<rev>:<起點>:<長度>`；store 的 `midiRev`（不存檔）讓 `useAudioPlan` 在換檔時重算；`importMidi`／`clearMidi` 動作；介面在 `SoundPanel.tsx` 的「名曲」區塊（匯入鈕、拖放、取哪一段、轉成其他格式的說明）。
- 時間：步數以檔案的平均速度換算（`秒 × 平均BPM ÷ 15`），所以有變速的檔案保留真實時間感，音符起點可以是小數；XM 轉換時四捨五入到列。
- 鼓：GM 鼓號用 `mapDrum` 整理成程式支援的一組（`KNOWN_DRUMS`）。
- XM：`writeXm` 現在支援多個樂段（每段 ≤256 列）；`buildXm` 聲道總數超過 32 時，把各聲部聲道上限逐步減半重做。
- 沒有「重新編曲」：匯入的 MIDI 沒有曲風，用原檔的音軌與音色；轉成別的格式靠「聲音方案」。
- 測試：`scripts/midi-import-test.ts`（自己產生測試 MIDI；`SF_WRITE_MIDI=路徑` 可存成檔案手動測試）已接進 `npm run test:audio`。

### 6.4c 靈感骰子與舞台（1.2.0）
- `store.ts` 的 `randomize` 是「全部抽卡」：風格／動效照舊，另外 `randomSubject()`（主體，一定換掉、3D 材質配 3D 主體）、`randomTune()`（微調）、`randomAudio()`（種子、曲風、方案、名曲、調性、速度）；`locked` 裡有 `s:subject`／`a:music` 就保留（`toggleLock('s','subject')`、`toggleLock('a','music')`，MixTray 的「主體」「音樂」鈕）。新增會被隨機的設定時，記得在這三個函式裡加。
- 比例 `Aspect` 多了 `fit`（填滿，新使用者預設）：`Stage.tsx` 的 `ASPECT.fit` 是**會變的**，舞台量到容器大小就更新，導出、截圖、音效提示點都讀它。固定比例仍照舊。
- 全螢幕：`toggleStageFullscreen()`（App 的 F 鍵、播放列按鈕、連點兩下都用它）。舞台先設成 `css`（`fixed inset-0`）立刻鋪滿，再 `requestFullscreen()`，成功就變 `native`。**不要改成「等 requestFullscreen 結果再決定」**：內嵌預覽視窗會一直不回應。

### 6.5 試聽（1.1.2 剛改過）
`audioEngine.auditionScheme(scheme)`：循環播放；再按同一個＝停止；試聽中 `songKey` 改變（換曲風、調性、速度、種子、對齊開關、換風格）會 `followAudition()` 自動重渲染並以淡出淡入交接；主開關關閉、離開「聲音」分頁（`SoundTab` 卸載）、分頁隱藏都會停止。

### 6.6 主體 v1／v2（1.2.0）
v1 檔案**不要改**（使用者要比較新舊）；改設計請改 v2。新增主體 v2：寫在 `subjects/v2/`、登錄到 `v2/index.ts` 的 `SUBJECTS_V2_MAP`（沒登錄的沿用 v1）。v2 要沿用 v1 的 `loop`、`key`、`hero`、`events`、`cues`、`track`（所以動效、音樂、導出照舊），顏色只用色板角色，`detail` 低時略過細節。3D 的 v2 場景在 `three/scenes/v2/`，場景編號 `island2`、`shapes2`、`text2`、`character2`、`terrain2`。store 的 `subjectVer`（存檔，預設 v2）＋`setSubjectVer` 會同步模組內的版本、讓縮圖重畫並加 `themeRev`（讓循環秒數與聲音計畫重算）；音訊引擎的提示點重建條件含 `subjectVersion()`。檢查設計的方法：寫一個暫時的頁面把主體在多個時間點畫成接觸表，用本機小伺服器接收 canvas 的 PNG 再用 Read 看圖（內建瀏覽器截圖常逾時）。

## 7. 常見工作怎麼做

- **新增圖像風格**：在 `src/data/visual.ts`（或 3D 的 `visual3d.ts`）加一筆 `V({...})`；縮圖自動出現。同時在 `src/audio/profile.ts` 的 `VISUAL` 表加音樂對應（沒加會用分類預設）。
- **新增動效風格**：`src/data/motion.ts`（3D 運鏡在 `motion3d.ts`）加一筆 `M({...})`；需要音樂提示就加到 `profile.ts` 的 `MOTION`。
- **新增名曲**：在 `classics.ts` 的 `PIECES` 加一筆（只能是公共領域；記譜寫完跑 `npx tsx scripts/classics-check.ts`，它會檢查小節拍數、所有曲風 × 動畫長度、移調）。**我聽不到聲音，旋律務必讓使用者聽過。**
- **新增曲風**：`src/audio/types.ts` 的 `GenreId` 加 id → `src/audio/genres.ts` 的 `GENRES` 加規格（和弦進行、鼓型、低音／伴奏型態、各聲部 GM 音色號、`lead.family`…）→ `src/components/SoundPanel.tsx` 的 `GENRE_GROUPS` 加到某一組（**每個曲風必須出現一次**）→ 跑 `npm run test:audio` 與 `npm run audio:sweep`。
- **換／加取樣樂器**：改 `scripts/samples/build.mjs` 的 `INST` 表 → `npm run samples:build` → 重跑響度校正 → `npm run test:audio` → `npx tsx scripts/loop-check.ts`（確認循環沒有「啪」聲）。
- **發新版本**：照第 4 章的版本規範；發版前依序跑 `npm run typecheck`、`npm run test:audio`、`npm run audio:sweep`（midi 與 xm 各一次）、`npm run build`，再在瀏覽器冒煙測試（含導出）。

## 8. 開發工具（`scripts/`）

| 檔案 | 用途 |
| --- | --- |
| `audio-test.ts` | 音訊自我檢查（作曲、循環對齊、MIDI／XM 結構、音效、取樣包、識別碼）→ `npm run test:audio` |
| `audio-sweep.ts` | 所有曲風 × 指定方案渲染，檢查 NaN／削波／音量／耗時 |
| `audio-render.ts` | 在 Node 渲染單首成 WAV：`npx tsx scripts/audio-render.ts 曲風 方案 [秒] [種子] [輸出資料夾]` |
| `theme-test.ts` | 自訂動畫主題的自動檢查（範本、關鍵影格、巢狀、壞檔案訊息、限制、用假畫筆繪製、主題管理） |
| `export-theme-templates.ts` | 把內建範本輸出到 `docs/範本-動畫主題/` |
| `xm-quality.ts` `xm-quality.py` | XM vs MIDI 音質量化（20 種樂器的頻譜差、高頻、包絡、12 kHz 以上能量） |
| `midi-import-test.ts` | 匯入 MIDI 的自動檢查（產生測試 MIDI → 解析 → 角色／調性 → 段落／移調／對齊 → 6 種方案渲染 → MIDI／XM 導出） |
| `audio-xm.ts` | 輸出 `.xm` 與自家播放器 WAV，供 `ffmpeg`（libopenmpt）驗證；`compare.py` 比對兩者包絡（解碼要 `-ar 44100`） |
| `xm-diagnose.ts` `xm-stems.ts` `xm-size.ts` `xm-verify.ts` `xm-calibrate-synth.ts` | XM 診斷：音符保留率、逐軌 MIDI vs XM 響度與亮度、各樂器空間、與 libopenmpt 比對、產生校準表 |
| `stems.ts` + `levels.py` | 每軌單獨渲染＋A 加權響度，調混音平衡 |
| `calibrate-render.ts` + `calibrate.py` | 響度校正表（見 6.4） |
| `loop-check.ts` | 持續音樂器循環接縫掃描 |
| `analyze.py` | 波形／頻譜圖／循環接縫分析 |
| `samples/build.mjs` | 取樣包建置器 |
| `node-decoder.ts` | 讓 Node 腳本能解碼內嵌 MP3（用 ffmpeg） |
| `need-build.ps1` | `start.bat` 判斷是否需要重新建置 |

## 9. 已知問題與待辦（完整版見 `docs/驗收報告-v1.1.1.md` 第 5 章與 v1.1.0 報告第 5–6 章）

**下一個 session 最該做的事（依序）**：

0. **問使用者要不要提交 1.2.0**（commit＋標籤 `v1.2.0`）。提交前 `npm run typecheck && npm run test:audio && npm run build`。
1. **請使用者「聽」**，這是所有聲音類工作的前提（我聽不到）：名曲（旋律是依記憶寫的，驗收報告第 4 章列了較沒把握的小節：給愛麗絲的琶音八度、土耳其進行曲的收尾句、山魔王第三句）、XM 新音色、13 種純樂器曲風、取樣包補密後的各樂器。他回報的錯音／不自然，逐首修 `classics.ts`。
2. **請使用者用自己的檔案試兩個匯入功能**，回報問題：
   - **匯入 MIDI**：我只用自己產生的測試檔驗證過，沒有真實商業編曲。可能的問題：角色判斷（誰是主旋律）猜錯、很長很密的檔案渲染會卡住主執行緒幾秒（MIDI 取樣方案最慢）、8-bit 方案不是逐音模擬 NES 的四聲道限制（同時發聲多的和弦變成快速琶音）。
   - **匯入動畫主題**：只用範本和測試檔試過；**「給 AI 的提示詞」沒有實際讓 AI 產生過檔案來驗證**；幾十個圖層的主題效能沒壓測；只能做 2D。
3. **B-03**：「處方」分頁沒有聲音內容（JSON 與 Claude 提示詞已經有聲音規格，可以重用 `useSoundSpec`）。
4. **B-13**：`dist/index.html` 約 9.6 MB。託管版本應把取樣拆成獨立檔案、第一次開聲音才下載；本機單檔模式維持內嵌。
5. 取樣再升級（**使用者授權可以下載更好的取樣**，這次評估後沒做）：稀疏的樂器——低音大提琴、低音號、木琴、鐘琴、長號（平均要拉伸 5–10 個半音）。來源 Tone.js 樂器庫已經用得差不多；要升級得改用 VSCO 2 CE 原始錄音（GitHub `sgossner/VSCO-2-CE`）或 VCSL，逐樂器研究檔名與力度層、核對授權、更新 `CREDITS.md`，檔案會再大幾 MB。做之前先確認使用者聽過新版後還是覺得不夠。
6. 其他較小的：B-06 擦洗音（暫停時拖時間軸無聲）、慢放時音效變調；B-08 風景／抽象／3D 地形音效太少；B-10 WebM 無聲、MP4 的 Opus／無聲退路未實測；B-11 音樂渲染在主執行緒；B-05 3D 預熱效果未量化；B-07 四組動效循環接縫略高（ios-spring×geo、stagger×ui、pose-to-pose×geo、scramble×ui）；B-14 速度只能落在固定值（見 6.4）。
7. 想法但還沒做：自訂主題支援 3D／匯入 SVG；主題檔跟著配方碼一起分享（現在對方要自己匯入，會看到「尚未匯入主題」）；配方碼不含畫面比例；匯入 MIDI 時重新編配（現在匯入的歌沒有曲風）；匯入 MIDI 的更多檔案同時保存（現在一次一個，≤300 KB 才存）。

**中長期**：1.3.0 自訂內容（匯入 SVG／GLB 當主體、復原重做、A／B 對照、參考圖抽色板）；1.4.0 輸出整合（Lottie／AE 腳本／風格包／離線 PWA／英文）。工程線：自動化測試（音訊、匯入 MIDI、自訂主題有；其餘沒有）、lint／CI、字體內嵌（目前用 Google Fonts）、拆分大檔（`visual.ts` 約 2000 行、`brush.ts` 約 1200 行）。

**待使用者決定**：試聽離開「聲音」分頁就停止，是我做的設計選擇；他若希望能切到別的分頁繼續聽，要改成保留並在舞台旁加停止鈕。

## 10. 尚未驗證／需要小心

- 音樂聽感（見上）。作曲是規則生成的，旋律好不好記、哪些曲風不像，要靠使用者回饋逐個調。
- Safari、Firefox、手機實機、雙擊開啟 `dist/index.html`（file://）、真實 GPU 下可見視窗的幀率，都沒測過（內建瀏覽器拒絕 file://，且面板常是隱藏的）。
- **取樣授權**：VSCO 2 CE、VCSL 是 CC0；Freesound（大提琴、尼龍吉他、簧風琴）與 Karoryfer（電貝斯、電吉他、薩克斯風）逐檔授權沒有核對。個人使用沒問題，商用前看 `CREDITS.md`，必要時改用 CC0 來源重建。
- 取樣是單聲道、MP3 壓縮；XM 內是 16 位元，取樣率依音高 16／24／32 kHz（低音區低、高音區高，省空間）。
- **全螢幕的原生模式**只在內嵌預覽視窗測過（它既不答應也不拒絕，所以走的是退回的「鋪滿視窗」）；一般 Chrome／Safari 的真正全螢幕、手機、多螢幕都沒測。
- 這個 session 的 XM 品質改善是用**指標**驗證的（與 MIDI 方案的頻譜差、循環接縫、12 kHz 以上能量），沒有人聽過。

## 11. 這個環境的陷阱（會浪費時間的）

1. **bash 工具處理含引號／中文的長 heredoc 會壞**（"unexpected EOF"）。大檔案請用 Write 工具寫到檔案，再用短的 python 腳本拼接／取代。`python` 可用，`python3` 不行。路徑傳給 Node 時，`$SCR/...` 這類 bash 變數作為**參數**會被自動轉成 Windows 路徑，但寫在 `node -e "..."` 字串裡就不會。
2. **Claude 的內建瀏覽器面板常是「隱藏」的**：這時 `requestAnimationFrame` 不會觸發，動畫時鐘停在 0，截圖會逾時（重試即可）。要測播放／同步，建一個臨時的 `test.html`（載入 `/src/main.tsx` 之前先把 `requestAnimationFrame` 換成 `setTimeout` 版本），測完**刪掉**。
3. **模組實例不同**：在頁面主控台 `import('/src/audio/engine.ts')` 可能拿到和應用不同的實例（Vite 熱更新會加 `?t=`）。DEV 模式請用 `window.__sf.audio / .clock / .store`（正式版沒有）。
4. **測試導出時要攔截下載**：覆寫 `HTMLAnchorElement.prototype.click`、包住 `URL.createObjectURL` 存下 blob，否則會真的把檔案存到使用者電腦。
5. `computer` 的座標點擊需要先截過圖；`find` 對含連字號的文字（如 "K-Pop"）有時找不到，可改用 JS 取座標。
6. `localStorage` 鍵 `style-fusion-v1`；清掉它會重新出現「選一個起點」。`audio.on` 每次載入一律重置為關（瀏覽器自動播放限制）。
7. 內建瀏覽器的 JS 工具單次執行上限約 45 秒；長任務用「先啟動、再輪詢結果」的寫法（把 promise 存到 `window.__xxx`）。
8. git 在 Windows 會一直警告 LF→CRLF，無害。`.gitattributes` 已讓 `.bat`／`.ps1` 保持 CRLF。
9. 沒有 lint／格式化工具；程式風格請跟周圍一致（繁體中文註解、2 空白縮排、單引號）。
10. **用 python 腳本做批次取代時，錨點要夠獨特**：`"  reggae: {"` 會先匹配到鼓型表裡的同名項目，把一大段內容重複貼進 `genres.ts`（用 `git checkout` 還原後改用 `"  reggae: {\n    id: 'reggae',"` 解決）。腳本裡每個 `assert old in s` 都要留著。
11. **內嵌預覽視窗的全螢幕 API**：`requestFullscreen()` 不 resolve 也不 reject（或回 "Permissions check failed"），所以舞台是「先鋪滿視窗、再去要求原生全螢幕」。**不要改成等結果再決定**。`resize_window` 設的尺寸在 turn 結束時會被清掉；截圖有時逾時（重試）；`zoom` 的區域裁切還不支援。
12. **比對 libopenmpt 解碼與自製播放器時，用 `ffmpeg -ar 44100` 解碼**，否則取樣率不同（48000 vs 44100）會讓 `scripts/compare.py` 的包絡相關係數低得離譜。
13. **取樣包只能整個重建**（只跑部分樂器不會更新 `meta.ts`／`loaders.ts`）：`node scripts/samples/build.mjs`；之後重跑兩份校準（`calibrate-render.ts`＋`calibrate.py`、`xm-calibrate-synth.ts`）與 `npm run test:audio`。`.cache` 資料夾已被清掉，會重新下載約 150 MB。
14. 測試匯入檔案流程時：用 `fetch` 取得檔案、`new DataTransfer()` 加入 `File`、設定 `input.files`、`dispatchEvent(new Event('change', {bubbles:true}))`；暫時放在專案根目錄的測試檔（例如 `_test-import.mid`）測完要刪。`window.__sf.store` 在 DEV 可以直接呼叫 `importMidi`、`randomize`、`saveCurrent` 等動作。
15. 匯入的 MIDI 存在 localStorage 的 `sf-midi-v1`，自訂主題在 `sf-themes-v1`；測試時看到「奇怪的殘留」先檢查這兩個鍵（預覽視窗的儲存和使用者自己的瀏覽器是分開的）。

## 12. 新 session 的建議第一步

1. 讀完本文件與 `CHANGELOG.md` 最上面的 1.2.0 一節。
2. `git status`（會看到約 70 個未提交的檔案，這是正常的，見標頭）、`npm install`（若 `node_modules` 不在）、`npm run typecheck && npm run test:audio` 確認環境正常（`test:audio` 會依序跑音訊、匯入 MIDI、自訂主題三組，最後印 `ALL OK`／`MIDI IMPORT OK`／`THEME OK`）。
3. 問使用者三件事：**要不要提交 1.2.0？聽過新音樂（名曲、XM、純樂器曲風）了嗎，哪裡不好？用自己的 MIDI 檔與主題檔試過匯入了嗎？**回饋決定下一步（第 9 章的順序）。
4. 之後每次修改都照第 4 章的版本規範收尾（`CHANGELOG.md`、`package.json` 版本、`docs/驗收報告-vX.Y.Z.md`、git 標籤；使用者驗收意見合併進下一個修訂版，別自作主張升次版本）。
5. 交付時永遠講清楚：做了什麼、怎麼驗證、**哪些沒驗證**（尤其是聽感）。
