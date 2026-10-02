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
  | 'cpop';

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
  | 'blip';

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
}

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
