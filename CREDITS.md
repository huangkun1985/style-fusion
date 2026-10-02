# 素材來源與授權 Credits

Style Fusion 的**圖像、動畫、後期特效、晶片音色、合成器、人聲與全部音效，都是程式碼即時計算**，沒有使用任何圖片、影片或音檔素材。

唯一使用外部素材的，是「真實樂器」的取樣（MIDI／XM 方案裡的鋼琴、吉他、弦樂、銅管、木管、打擊樂…）。這些取樣來自下列開放素材庫，經 `scripts/samples/build.mjs` 裁切、量測音高、做循環、重新取樣並壓成單聲道 MP3，內嵌在 `src/audio/pack/`。

| 來源 | 授權 | 用到的樂器 |
| --- | --- | --- |
| [VSCO 2 Community Edition](http://vis.versilstudios.net/vsco-community.html)（Versilian Studios） | CC0 公眾領域貢獻 | 鋼琴、豎琴、管風琴、小提琴、低音提琴、小號、長號、低音號、法國號、長笛、單簧管、低音管、木琴 |
| [Versilian Community Sample Library (VCSL)](https://github.com/sgossner/VCSL) | CC0 公眾領域貢獻 | 馬林巴、顫音琴、鐘琴、拇指琴、管鐘、FM 電鋼琴（TX81Z），以及全部取樣鼓與打擊樂 |
| [Karoryfer Samples](https://www.karoryfer.com/karoryfer-samples) | 依來源頁面標示（免費、可再散布的開放授權） | 電貝斯、電吉他、薩克斯風 |
| [University of Iowa Musical Instrument Samples](http://theremin.music.uiowa.edu/) | 免費使用，不需授權 | 鋼弦吉他 |
| [Freesound](https://freesound.org)：flcellogrl（大提琴）、quartertone（古典吉他）、donyaquick（簧風琴） | 依各作者在 Freesound 上標示的授權（CC0 或 CC-BY） | 大提琴、尼龍弦吉他、簧風琴 |

這批取樣是透過 [tonejs-instruments](https://github.com/nbrosowsky/tonejs-instruments)（已做好音量統一與裁切的版本）與 VCSL 取得。

## 使用上的提醒

- 作者無法在這裡逐筆核對 Freesound、Karoryfer 每一個檔案目前標示的授權。**個人使用、做設計參考與練習沒有問題；如果你要把含有這些取樣的成品（例如導出的 WAV／MP4／XM）用於商業發行，請先到上表連結確認該來源的授權條款，必要時改用 CC0 的來源重新建置。**
- 重新建置取樣包：`npm run samples:build`（需要網路與 ffmpeg）。想換成別的取樣，修改 `scripts/samples/build.mjs` 裡的樂器表即可。
- 其他開源套件（React、Three.js、Zustand、Tailwind、gifenc、mp4-muxer、fflate、lucide-react）依各自的授權，見 `package.json`。
