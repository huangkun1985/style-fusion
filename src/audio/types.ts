// 音訊系統的共用型別。作曲只產生「抽象的歌曲資料」，再由不同的聲音方案（8-bit、Game Boy、SID、FM、MIDI、XM）各自渲染。

/** 聲音方案＝樂器的呈現技術 */
export type SchemeId = 'nes' | 'gb' | 'sid' | 'fm' | 'midi' | 'xm';

export type GenreId =
  | 'chipAdventure'
  | 'chipDark'
  | 'synthwave'
  | 'cyber'
  | 'lofi'
  | 'jazz'
  | 'ragtime'
  | 'wonder'
  | 'kawaii'
  | 'eastern'
  | 'ambient'
  | 'funk'
  | 'hero'
  | 'techno'
  | 'vapor'
  | 'folk'
  | 'pop'
  | 'kpop'
  | 'rnb'
  | 'ballad'
  | 'hiphop'
  | 'trap'
  | 'house'
  | 'rock'
  | 'citypop'
  | 'bossa'
  | 'cinematic'
  | 'latin'
  | 'acoustic'
  | 'disco'
  | 'classical'
  | 'reggae'
  | 'jpop'
  | 'cpop'
  // 純樂器
  | 'solopiano'
  | 'violin'
  | 'cello'
  | 'guitar'
  | 'flute'
  | 'sax'
  | 'harp'
  | 'quartet'
  | 'brass'
  | 'mallet'
  | 'organ'
  | 'musicbox';

/** 音效包 */
export type PackId = '8bit' | 'cartoon' | 'ui' | 'scifi' | 'natural';

export type SfxKind =
  | 'jump'
  | 'land'
  | 'bounce'
  | 'pop'
  | 'click'
  | 'toggle'
  | 'whoosh'
  | 'tick'
  | 'ping'
  | 'sparkle'
  | 'impact'
  | 'step'
  | 'notify'
  | 'rise'
  | 'drop'
  | 'flip'
  | 'blip'
  | 'splash'
  | 'quack';

export interface AudioPrefs {
  /** 主開關（音樂與音效都靜音） */
  on: boolean;
  bgm: boolean;
  sfx: boolean;
  scheme: SchemeId | 'auto';
  genre: GenreId | 'auto';
  pack: PackId | 'off' | 'auto';
  bgmVol: number;
  sfxVol: number;
  /** 音樂長度與動畫循環對齊 */
  sync: boolean;
  seed: number;
  /** 速度倍率 */
  tempo: number;
  /** 調性：-1 自動，0–11 = C…B */
  key: number;
  /** 名曲：'off' 用自動作曲；'import' 是使用者匯入的 MIDI；否則是 classics.ts 裡的曲目 id（曲風改為「編曲風格」） */
  piece: string;
  /** 匯入的 MIDI 要取哪一段：從第幾小節開始（0 起算）、取幾小節（0＝自動） */
  midiStart: number;
  midiBars: number;
  /** 配樂模式（1.4.0）：整首有段落結構（前奏 → 展開 → 回落），長度自訂，聲部依段落層層進出；關閉＝與動畫對齊的循環 */
  arrange: boolean;
  /** 配樂長度（秒） */
  arrLen: number;
  /** 段落形狀 */
  arrShape: ArrShape;
  /** 墊底（不搶口播）：拿掉主旋律、中頻讓位給人聲 */
  bed: boolean;
  /** 精修編曲與混音（1.4.0）：力度微調、漸強漸弱、逐軌響度對齊與效果鏈；關閉＝1.2 原版的聲音（比較用） */
  polish: boolean;
}

/** 配樂的段落形狀：arc 三段（前奏、展開、回落）；build 四段（前奏、展開、高潮、回落）；rise 一路推進；steady 平穩墊底 */
export type ArrShape = 'arc' | 'build' | 'rise' | 'steady';

export const AUDIO_DEFAULT: AudioPrefs = {
  on: false,
  bgm: true,
  sfx: true,
  scheme: 'auto',
  genre: 'auto',
  pack: 'auto',
  bgmVol: 0.7,
  sfxVol: 0.8,
  sync: true,
  seed: 11,
  tempo: 1,
  key: -1,
  piece: 'off',
  midiStart: 0,
  midiBars: 0,
  arrange: false,
  arrLen: 30,
  arrShape: 'arc',
  bed: false,
  polish: true,
};

export type TrackRole = 'lead' | 'arp' | 'bass' | 'pad' | 'chord' | 'counter' | 'perc';

export interface NoteEv {
  /** 起點（16 分音符步數，可含小數） */
  t: number;
  /** 長度（步數） */
  dur: number;
  /** MIDI 音高；鼓軌則是 GM 鼓號 */
  pitch: number;
  vel: number;
}

export interface Track {
  id: string;
  role: TrackRole;
  /** General MIDI 音色編號（鼓軌忽略） */
  program: number;
  drum?: boolean;
  /** 鼓組風格（只有鼓軌用）：acoustic 全取樣、hybrid 合成踢鼓＋取樣、electronic 合成鼓＋取樣拍手 */
  kit?: 'acoustic' | 'hybrid' | 'electronic';
  notes: NoteEv[];
  pan: number;
  gain: number;
  /** 審查 R-02：這一軌整體要比精修的目標電平低多少（dB，≤ 0）。編排把整軌收小時寫在這裡；精修逐軌對齊響度時加上去，
   *  不然精修會把整軌拉回目標、抵銷編排的收小。沒有精修時不看它（收小已經在力度裡） */
  trim?: number;
}

export interface ChordInfo {
  bar: number;
  step: number;
  root: number;
  quality: string;
  notes: number[];
  label: string;
}

export interface Song {
  title: string;
  genre: GenreId;
  bpm: number;
  /** 每小節拍數 */
  meter: 3 | 4;
  stepsPerBar: number;
  bars: number;
  steps: number;
  /** 反拍延遲比例 0–0.33 */
  swing: number;
  key: number;
  mode: string;
  tracks: Track[];
  chords: ChordInfo[];
  /** 整首循環秒數 */
  seconds: number;
  /** 動畫循環秒數與音樂循環包含幾次動畫循環 */
  animSeconds: number;
  animLoops: number;
  /** 每次動畫循環是否剛好整數拍 */
  beatLocked: boolean;
  /** 配樂模式的段落（循環的歌沒有） */
  sections?: Section[];
  /** 精修（1.4.0）：渲染時加上力度相關的起音、逐軌響度對齊與效果鏈 */
  polish?: boolean;
  /** 墊底（不搶口播）：混音時中頻讓位 */
  bed?: boolean;
}

export type SectionKind = 'intro' | 'build' | 'build2' | 'peak' | 'outro' | 'rise1' | 'rise2' | 'body';
export interface Section {
  kind: SectionKind;
  /** 顯示用名稱（前奏、展開、高潮、回落…） */
  name: string;
  /** 從第幾小節開始（0 起算）、共幾小節 */
  bar: number;
  bars: number;
}

/** 動畫裡的音效提示點 */
export interface Cue {
  /** 動畫循環內的位置 0..1 */
  u: number;
  kind: SfxKind;
  /** 強度 0..1 */
  k: number;
}

export const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const SAMPLE_RATE = 44100;
