# 載入與微互動（loader）：新主體，參考圖分析與實作紀錄

日期：2026-10-07　檔案：`src/engine/subjects/loader.ts`（新主體，沒有 v1／v2 之分；備份 `docs/主體v2重做/2026-10-05/loader.ts`）

## 參考圖（圖檔只在暫存資料夾，沒有放進專案）

來源：Dribbble 標籤頁 `button-animation`（25 張）與 `success-animation`（16 張），做成接觸表挑選後細看：

1. **Download 藥丸按鈕**（主要藍本）：淺色藥丸＋髮絲邊、左邊一顆飽和藍圓帶白箭頭、大字標籤；整張只有一個強調色。
2. **Payment Successful**：白卡上一顆實心強調色圓＋白勾。
3. **Shop／Designer 切換開關**：淡色軌道裡的白色旋鈕（兩側小元件的參考）。

## 設計

- 故事（循環 3.6 秒）：游標移來（0.06–0.25）→ 按下 0.28（壓扁＋漣漪）→ 藥丸縮成圓（0.30–0.44）→ 進度環（0.44–0.76，快、卡、衝刺）→ 圓膨脹成實心（0.76–0.82）→ 勾畫出（0.80–0.88）→ 漣漪、放射線、22 顆彩粒（有阻力與重力，時間的純函數）→ 「Downloaded」→ 0.94 起淡出。
- 寬畫面（Wu > 600）兩側：開關在 0.52 翻開、愛心在 0.62 彈出；淡化不搶主角。窄畫面自動縮小並隱藏兩側。
- 顏色：強調色 `p`＋中性（`card`、`mix(card, ink, …)`）；強調色上的圖示用 `readableOn(p, darken(bg,.85), light)`；只有彩粒用 p／s／a。
- 小字：百分比與「Downloaded」關掉描邊；像素風下字小於 6.5 格（主標籤 10 格）改畫色條。
- 音效提示點：pop、click、rise、toggle、pop、ping、sparkle、whoosh。`profile.ts` 音效包 `ui`。

## 驗證

- 接觸表 1.88:1 全時間點：`flat`、`popart`、`pixel8`、`cyberpunk`、`watercolor`；9:16 竖版。
- 冒煙測試 `?all=1`（已把 loader 加進 `sheet.ts` 清單）：1350 次零例外；`?bench=1` 每幀 0.2 ms；`npm run typecheck` 通過。

## 還差什麼

- 沒在真實舞台播放看手感、沒聽音效；3D 材質風格、其他動效（`material-motion` 的形變會把圓變星形，屬動效特性）沒逐一看。
- pixel8 的背景雲會穿過白色藥丸（風格背景本身）。
- 沒有案例配方用到這個主體。
