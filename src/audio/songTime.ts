// 歌曲時間換算（獨立成小模組：渲染器與背景執行緒只需要它，不必連帶載入作曲器與 MIDI 解析）
import type { Song } from './types';

/** 步數 → 秒（含搖擺：每拍的後半拍延後） */
export function stepToSec(song: Pick<Song, 'bpm' | 'swing'>, t: number): number {
  const beat = Math.floor(t / 4);
  const x = t - beat * 4;
  const d = song.swing * 2;
  const w = x < 2 ? (x * (2 + d)) / 2 : 2 + d + ((x - 2) * (2 - d)) / 2;
  return (beat * 4 + w) * (60 / song.bpm / 4);
}
