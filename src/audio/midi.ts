// 標準 MIDI 檔（SMF format 1）輸出：速度、拍號、每軌音色（Program Change）、鼓走第 10 軌道。
import { stepToSec } from './compose';
import type { Song } from './types';

const PPQ = 480;
const STEP_TICKS = PPQ / 4;

function vlq(n: number): number[] {
  let v = Math.max(0, Math.round(n));
  const out = [v & 0x7f];
  while ((v >>= 7) > 0) out.unshift((v & 0x7f) | 0x80);
  return out;
}
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u16 = (n: number) => [(n >> 8) & 255, n & 255];
const text = (s: string) => Array.from(new TextEncoder().encode(s));
/** 文字 meta 事件：長度必須是 UTF-8 位元組數 */
const meta = (type: number, s: string) => {
  const b = text(s);
  return [0xff, type, ...vlq(b.length), ...b];
};

interface Ev {
  tick: number;
  order: number;
  bytes: number[];
}

function track(events: Ev[]): number[] {
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const body: number[] = [];
  let last = 0;
  for (const e of events) {
    body.push(...vlq(e.tick - last), ...e.bytes);
    last = e.tick;
  }
  body.push(...vlq(0), 0xff, 0x2f, 0x00);
  return [0x4d, 0x54, 0x72, 0x6b, ...u32(body.length), ...body];
}

/** 步數 → 滴答（含搖擺） */
function toTick(song: Song, t: number): number {
  const stepSec = 60 / song.bpm / 4;
  return Math.round((stepToSec(song, t) / stepSec) * STEP_TICKS);
}

export function writeMidi(song: Song): Uint8Array {
  const tracks: number[][] = [];
  // 速度軌
  const us = Math.round(60_000_000 / song.bpm);
  const nn = song.meter;
  tracks.push(
    track([
      { tick: 0, order: 0, bytes: meta(0x03, song.title) },
      { tick: 0, order: 1, bytes: [0xff, 0x51, 0x03, (us >> 16) & 255, (us >> 8) & 255, us & 255] },
      { tick: 0, order: 2, bytes: [0xff, 0x58, 0x04, nn, 2, 24, 8] },
      { tick: 0, order: 3, bytes: meta(0x06, 'loopStart') },
      { tick: song.steps * STEP_TICKS, order: 3, bytes: meta(0x06, 'loopEnd') },
    ]),
  );
  let ch = 0;
  for (const tr of song.tracks) {
    let channel: number;
    if (tr.drum) channel = 9;
    else {
      if (ch === 9) ch++;
      channel = Math.min(15, ch++);
    }
    const ev: Ev[] = [];
    const name = tr.id;
    ev.push({ tick: 0, order: 0, bytes: meta(0x03, name) });
    if (!tr.drum) ev.push({ tick: 0, order: 1, bytes: [0xc0 | channel, tr.program & 127] });
    // 聲像與音量
    ev.push({ tick: 0, order: 2, bytes: [0xb0 | channel, 10, Math.round(64 + tr.pan * 40)] });
    ev.push({ tick: 0, order: 2, bytes: [0xb0 | channel, 7, Math.round(100 * Math.min(1, tr.gain))] });
    for (const n of tr.notes) {
      const on = toTick(song, n.t);
      const off = Math.max(on + 1, toTick(song, n.t + (tr.drum ? 0.5 : n.dur)));
      const vel = Math.max(1, Math.min(127, Math.round(n.vel * 127)));
      ev.push({ tick: on, order: 5, bytes: [0x90 | channel, n.pitch & 127, vel] });
      ev.push({ tick: off, order: 4, bytes: [0x80 | channel, n.pitch & 127, 0] });
    }
    tracks.push(track(ev));
  }
  const header = [0x4d, 0x54, 0x68, 0x64, ...u32(6), ...u16(1), ...u16(tracks.length), ...u16(PPQ)];
  return Uint8Array.from([...header, ...tracks.flat()]);
}
