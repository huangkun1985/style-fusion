// 名曲庫：只收錄已進入公共領域的作品（作曲者過世超過 70 年，或是傳統曲調）。
// 旋律與和弦用簡短的文字記譜，作曲器再依「編曲風格」（任一曲風）配上伴奏、低音與鼓。
//
// 記譜規則
//  - melody：小節以 | 分隔；音符以空白分隔，格式「音名八度:長度」，長度單位是 16 分音符（4 = 四分音符）；r:n 是休止。
//    例：C4:4 F#4:2 Bb3:2 r:8　（八度以 C4 = 中央 C 為準）
//  - chords：每小節 chordsPerBar 個和弦，以 | 分隔小節、空白分隔和弦，如「D A|Bm F#m」。
//  - 弱起（拍前的音）寫在整首的最後一小節，這樣循環時銜接正確。
//  - 2/4 或 3/8 的作品把相鄰兩小節併成一個 4/4 或 3/4 小節。
import type { Mode } from './theory';
import type { GenreId } from './types';

export type PieceGroup = 'classical' | 'folk';

export interface Piece {
  id: string;
  name: string;
  composer: string;
  group: PieceGroup;
  desc: string;
  /** 原調（pitch class）與音階 */
  key: number;
  mode: Mode;
  meter: 3 | 4;
  /** 原速（每拍 BPM，一拍＝4 個 16 分音符） */
  bpm: number;
  chordsPerBar: 1 | 2;
  /** 曲風選「自動」時使用的編曲 */
  genre: GenreId;
  /** 輪唱：第二聲部延後幾小節進入（旋律長度需能首尾相接） */
  round?: number;
  /** 旋律音符長度倍率（預設 0.95；分解和弦類的曲子要拉長才會連成一片） */
  legato?: number;
  melody: string;
  chords: string;
}

export const PIECE_GROUPS: { id: PieceGroup; name: string }[] = [
  { id: 'classical', name: '古典名曲' },
  { id: 'folk', name: '民謠與節慶' },
];

const B = (...bars: string[]) => bars.join('|');

export const PIECES: Piece[] = [
  {
    id: 'ode',
    name: '歡樂頌',
    composer: '貝多芬（第九號交響曲，1824）',
    group: 'classical',
    desc: '貝多芬第九號交響曲的合唱主題，十六小節的四四拍，音階式的旋律人人都會哼。',
    key: 0,
    mode: 'major',
    meter: 4,
    bpm: 108,
    chordsPerBar: 2,
    genre: 'quartet',
    melody: B(
      'E4:4 E4:4 F4:4 G4:4',
      'G4:4 F4:4 E4:4 D4:4',
      'C4:4 C4:4 D4:4 E4:4',
      'E4:6 D4:2 D4:8',
      'E4:4 E4:4 F4:4 G4:4',
      'G4:4 F4:4 E4:4 D4:4',
      'C4:4 C4:4 D4:4 E4:4',
      'D4:6 C4:2 C4:8',
      'D4:4 D4:4 E4:4 C4:4',
      'D4:4 E4:2 F4:2 E4:4 C4:4',
      'D4:4 E4:2 F4:2 E4:4 D4:4',
      'C4:4 D4:4 G3:8',
      'E4:4 E4:4 F4:4 G4:4',
      'G4:4 F4:4 E4:4 D4:4',
      'C4:4 C4:4 D4:4 E4:4',
      'D4:6 C4:2 C4:8',
    ),
    chords: B('C C', 'C G', 'C C', 'C G', 'C C', 'C G', 'C C', 'G C', 'G C', 'G7 C', 'G7 G7', 'C G', 'C C', 'C G', 'C C', 'G C'),
  },
  {
    id: 'canon',
    name: '卡農',
    composer: '帕海貝爾（約 1680）',
    group: 'classical',
    desc: '八個和弦（D A Bm F#m G D G A）不斷循環，上方的旋律一圈比一圈密：二分音符、四分音符、八分音符，最後舒展開來。旋律是在這個公共領域的低音進行上做的變奏。',
    key: 2,
    mode: 'major',
    meter: 4,
    bpm: 80,
    chordsPerBar: 2,
    genre: 'quartet',
    melody: B(
      'F#5:8 E5:8',
      'D5:8 C#5:8',
      'B4:8 A4:8',
      'B4:8 C#5:8',
      'A5:4 F#5:4 E5:4 C#5:4',
      'D5:4 F#5:4 C#5:4 A4:4',
      'B4:4 D5:4 A4:4 F#4:4',
      'B4:4 D5:4 C#5:4 E5:4',
      'F#5:2 A5:2 F#5:2 D5:2 E5:2 C#5:2 E5:2 A5:2',
      'D5:2 F#5:2 D5:2 B4:2 C#5:2 F#5:2 C#5:2 A4:2',
      'B4:2 D5:2 G5:2 D5:2 A4:2 D5:2 F#5:2 D5:2',
      'B4:2 D5:2 G5:2 B5:2 C#5:2 E5:2 A5:2 C#6:2',
      'F#5:6 A5:2 E5:8',
      'D5:6 F#5:2 C#5:8',
      'B4:6 D5:2 A4:8',
      'B4:8 C#5:8',
    ),
    chords: B(...Array.from({ length: 4 }, () => ['D A', 'Bm F#m', 'G D', 'G A']).flat()),
  },
  {
    id: 'elise',
    name: '給愛麗絲',
    composer: '貝多芬（1810）',
    group: 'classical',
    desc: '最有名的鋼琴小品之一，A 小調。開頭那段「E–D♯–E–D♯」的搖擺動機。這裡是 A 段主題（三八拍，兩小節併成一小節）。',
    key: 9,
    mode: 'minor',
    meter: 3,
    bpm: 72,
    chordsPerBar: 2,
    genre: 'solopiano',
    melody: B(
      'E5:1 D#5:1 E5:1 B4:1 D5:1 C5:1 A4:2 r:1 C4:1 E4:1 A4:1',
      'B4:2 r:1 E4:1 G#4:1 B4:1 C5:2 r:2 E5:1 D#5:1',
      'E5:1 D#5:1 E5:1 B4:1 D5:1 C5:1 A4:2 r:1 C4:1 E4:1 A4:1',
      'B4:2 r:1 E4:1 C5:1 B4:1 A4:4 E5:1 D#5:1',
    ),
    chords: B('E Am', 'E Am', 'E Am', 'E7 Am'),
  },
  {
    id: 'minuet',
    name: 'G 大調小步舞曲',
    composer: '佩措爾德（巴赫《安娜·瑪格達蕾娜日記》，約 1725）',
    group: 'classical',
    desc: '三四拍的宮廷舞曲，鋼琴初學者必彈。十六小節，前八小節停在屬音上，後八小節回到主音。',
    key: 7,
    mode: 'major',
    meter: 3,
    bpm: 112,
    chordsPerBar: 2,
    genre: 'classical',
    melody: B(
      'D5:4 G4:2 A4:2 B4:2 C5:2',
      'D5:4 G4:4 G4:4',
      'E5:4 C5:2 D5:2 E5:2 F#5:2',
      'G5:4 G4:4 G4:4',
      'C5:4 D5:2 C5:2 B4:2 A4:2',
      'B4:4 C5:2 B4:2 A4:2 G4:2',
      'F#4:4 G4:2 A4:2 B4:2 G4:2',
      'A4:12',
      'D5:4 G4:2 A4:2 B4:2 C5:2',
      'D5:4 G4:4 G4:4',
      'E5:4 C5:2 D5:2 E5:2 F#5:2',
      'G5:4 G4:4 G4:4',
      'C5:4 D5:2 C5:2 B4:2 A4:2',
      'B4:4 C5:2 B4:2 A4:2 G4:2',
      'A4:4 B4:2 A4:2 G4:2 F#4:2',
      'G4:12',
    ),
    chords: B('G G', 'G G', 'C D', 'G G', 'C D', 'G G', 'D G', 'D D', 'G G', 'G G', 'C D', 'G G', 'C D', 'G G', 'D D', 'G G'),
  },
  {
    id: 'prelude',
    name: 'C 大調前奏曲',
    composer: '巴赫（《平均律鋼琴曲集》第一冊，1722）',
    group: 'classical',
    desc: '整首都是琶音：每個和弦被拆成十六分音符流動的波浪。十一小節最後停在屬和弦，接回開頭會有「再出發」的感覺。',
    key: 0,
    mode: 'major',
    meter: 4,
    bpm: 66,
    chordsPerBar: 1,
    genre: 'classical',
    legato: 2.2,
    melody: B(
      ...[
        'C4 E4 G4 C5 E5 G4 C5 E5',
        'C4 D4 A4 D5 F5 A4 D5 F5',
        'B3 D4 G4 D5 F5 G4 D5 F5',
        'C4 E4 G4 C5 E5 G4 C5 E5',
        'C4 E4 A4 E5 A5 A4 E5 A5',
        'C4 D4 F#4 A4 D5 F#4 A4 D5',
        'B3 D4 G4 D5 G5 G4 D5 G5',
        'B3 C4 E4 G4 C5 E4 G4 C5',
        'A3 C4 E4 G4 C5 E4 G4 C5',
        'D3 A3 D4 F#4 C5 D4 F#4 C5',
        'G3 B3 D4 G4 B4 D4 G4 B4',
      ].map((g) => `${g} ${g}`.split(' ').map((n) => `${n}:1`).join(' ')),
    ),
    chords: B('C', 'Dm7', 'G7', 'C', 'Am', 'D7', 'G', 'Cmaj7', 'Am7', 'D7', 'G'),
  },
  {
    id: 'turkish',
    name: '土耳其進行曲（主題）',
    composer: '莫札特（A 大調鋼琴奏鳴曲 K.331 終樂章，1783）',
    group: 'classical',
    desc: '十六分音符的「B–A–G♯–A」迴旋加上土耳其軍樂的節奏感。這裡是它的主題（二四拍，兩小節併成一小節）。',
    key: 9,
    mode: 'minor',
    meter: 4,
    bpm: 116,
    chordsPerBar: 2,
    genre: 'solopiano',
    melody: B(
      'B4:1 A4:1 G#4:1 A4:1 C5:4 D5:1 C5:1 B4:1 C5:1 E5:4',
      'F5:1 E5:1 D#5:1 E5:1 B5:1 A5:1 G#5:1 A5:1 B5:1 A5:1 G#5:1 A5:1 C6:4',
      'B4:1 A4:1 G#4:1 A4:1 C5:4 D5:1 C5:1 B4:1 C5:1 E5:4',
      'B4:1 A4:1 G#4:1 A4:1 C5:4 B4:2 G#4:2 A4:4',
    ),
    chords: B('Am Am', 'E7 Am', 'Am Am', 'Am E7'),
  },
  {
    id: 'mountainking',
    name: '山魔王的洞窟',
    composer: '葛利格（《皮爾·金特》，1875）',
    group: 'classical',
    desc: '八分音符的小調主題，起頭輕輕的、愈往後愈緊，是「追逐」場面的經典配樂。第二輪整個高八度重來。',
    key: 11,
    mode: 'minor',
    meter: 4,
    bpm: 112,
    chordsPerBar: 2,
    genre: 'cinematic',
    legato: 0.8,
    melody: B(
      'B3:2 C#4:2 D4:2 E4:2 F#4:2 D4:2 F#4:4',
      'F4:2 C#4:2 F4:4 r:8',
      'B3:2 C#4:2 D4:2 E4:2 F#4:2 D4:2 F#4:2 B4:2',
      'A4:2 F#4:2 D4:2 F#4:2 A4:8',
      'B4:2 C#5:2 D5:2 E5:2 F#5:2 D5:2 F#5:4',
      'F5:2 C#5:2 F5:4 r:8',
      'B4:2 C#5:2 D5:2 E5:2 F#5:2 D5:2 F#5:2 B5:2',
      'A5:2 F#5:2 D5:2 F#5:2 A5:8',
    ),
    chords: B('Bm Bm', 'Bdim Bm', 'Bm Bm', 'Bm F#7', 'Bm Bm', 'Bdim Bm', 'Bm Bm', 'Bm F#7'),
  },
  {
    id: 'fate',
    name: '命運動機',
    composer: '貝多芬（第五號交響曲，1808）',
    group: 'classical',
    desc: '「短短短長」，古典音樂裡最有名的四個音。這裡只取開頭兩句（C 小調，二四拍併成四四拍），很適合配爆發力強的動畫。',
    key: 0,
    mode: 'minor',
    meter: 4,
    bpm: 104,
    chordsPerBar: 2,
    genre: 'cinematic',
    legato: 0.9,
    melody: B('r:2 G4:2 G4:2 G4:2 Eb4:8', 'r:2 F4:2 F4:2 F4:2 D4:8'),
    chords: B('Cm Cm', 'G7 G7'),
  },
  {
    id: 'jingle',
    name: '鈴兒響叮噹',
    composer: '皮爾龐特（1857）',
    group: 'folk',
    desc: '最歡樂的節慶歌曲，副歌十六小節。同一個旋律配上爵士、搖滾、K-Pop 都很好玩。',
    key: 0,
    mode: 'major',
    meter: 4,
    bpm: 120,
    chordsPerBar: 2,
    genre: 'folk',
    melody: B(
      'E4:4 E4:4 E4:8',
      'E4:4 E4:4 E4:8',
      'E4:4 G4:4 C4:6 D4:2',
      'E4:16',
      'F4:4 F4:4 F4:6 F4:2',
      'F4:4 E4:4 E4:4 E4:2 E4:2',
      'D4:4 D4:4 E4:4 D4:4',
      'G4:8 r:8',
      'E4:4 E4:4 E4:8',
      'E4:4 E4:4 E4:8',
      'E4:4 G4:4 C4:6 D4:2',
      'E4:16',
      'F4:4 F4:4 F4:6 F4:2',
      'F4:4 E4:4 E4:4 E4:4',
      'G4:4 G4:4 F4:4 D4:4',
      'C4:16',
    ),
    chords: B('C C', 'C C', 'C C', 'C C', 'F F', 'F C', 'G G', 'C C', 'C C', 'C C', 'C C', 'C C', 'F F', 'F C', 'G G', 'C C'),
  },
  {
    id: 'twinkle',
    name: '小星星',
    composer: '法國民謠，莫札特作過十二段變奏（1781–82）',
    group: 'folk',
    desc: '最簡單的旋律，最適合拿來試各種編曲風格：同一首歌聽它變成爵士、嘻哈或電影配樂。',
    key: 0,
    mode: 'major',
    meter: 4,
    bpm: 100,
    chordsPerBar: 2,
    genre: 'musicbox',
    melody: B(
      'C4:4 C4:4 G4:4 G4:4',
      'A4:4 A4:4 G4:8',
      'F4:4 F4:4 E4:4 E4:4',
      'D4:4 D4:4 C4:8',
      'G4:4 G4:4 F4:4 F4:4',
      'E4:4 E4:4 D4:8',
      'G4:4 G4:4 F4:4 F4:4',
      'E4:4 E4:4 D4:8',
      'C4:4 C4:4 G4:4 G4:4',
      'A4:4 A4:4 G4:8',
      'F4:4 F4:4 E4:4 E4:4',
      'D4:4 D4:4 C4:8',
    ),
    chords: B('C C', 'F C', 'F C', 'G C', 'C F', 'C G', 'C F', 'C G', 'C C', 'F C', 'F C', 'G C'),
  },
  {
    id: 'frere',
    name: '雅克兄弟（輪唱）',
    composer: '法國傳統輪唱曲',
    group: 'folk',
    desc: '兩個聲部相隔兩小節進入、一圈圈追著對方的輪唱。八小節剛好首尾相接，可以一直循環下去。',
    key: 0,
    mode: 'major',
    meter: 4,
    bpm: 104,
    chordsPerBar: 2,
    genre: 'flute',
    round: 2,
    melody: B(
      'C4:4 D4:4 E4:4 C4:4',
      'C4:4 D4:4 E4:4 C4:4',
      'E4:4 F4:4 G4:8',
      'E4:4 F4:4 G4:8',
      'G4:2 A4:2 G4:2 F4:2 E4:4 C4:4',
      'G4:2 A4:2 G4:2 F4:2 E4:4 C4:4',
      'C4:4 G3:4 C4:8',
      'C4:4 G3:4 C4:8',
    ),
    chords: B('C C', 'C C', 'C C', 'C C', 'C G', 'C G', 'C C', 'C C'),
  },
];

export const PIECE_BY_ID: Record<string, Piece> = Object.fromEntries(PIECES.map((p) => [p.id, p]));

// ---------- 解析 ----------
const NAME_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function parsePitch(s: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(s);
  if (!m) throw new Error(`bad pitch "${s}"`);
  return 12 * (Number(m[3]) + 1) + NAME_PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

const QUALITY: Record<string, number[]> = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  '7': [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  dim: [0, 3, 6],
  sus4: [0, 5, 7],
};

export interface PieceChord {
  rootPc: number;
  /** 以 pitch class 0–11 為根音的音程 */
  intervals: number[];
}

export function parseChord(s: string): PieceChord {
  const m = /^([A-G])([#b]?)(.*)$/.exec(s);
  if (!m || !(m[3] in QUALITY)) throw new Error(`bad chord "${s}"`);
  const root = (NAME_PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  return { rootPc: root, intervals: QUALITY[m[3]] };
}

export interface ParsedPiece {
  piece: Piece;
  spb: number;
  bars: number;
  /** 旋律（t 以 16 分音符為單位，pitch 為原調） */
  notes: { t: number; dur: number; pitch: number }[];
  /** 每小節的和弦 */
  chords: PieceChord[][];
}

const parsed = new Map<string, ParsedPiece>();

export function parsePiece(p: Piece): ParsedPiece {
  const hit = parsed.get(p.id);
  if (hit) return hit;
  const spb = p.meter === 3 ? 12 : 16;
  const bars = p.melody.split('|').map((s) => s.trim());
  const chordBars = p.chords.split('|').map((s) => s.trim());
  const notes: ParsedPiece['notes'] = [];
  bars.forEach((bar, bi) => {
    let t = bi * spb;
    for (const tok of bar.split(/\s+/)) {
      const [name, d] = tok.split(':');
      const dur = Number(d);
      if (!(dur > 0)) throw new Error(`${p.id}: bad duration in "${tok}"`);
      if (name !== 'r') notes.push({ t, dur, pitch: parsePitch(name) });
      t += dur;
    }
    if (Math.abs(t - (bi + 1) * spb) > 1e-9) throw new Error(`${p.id}: bar ${bi + 1} has ${t - bi * spb} steps, expected ${spb}`);
  });
  if (chordBars.length !== bars.length) throw new Error(`${p.id}: ${chordBars.length} chord bars vs ${bars.length} melody bars`);
  const chords = chordBars.map((cb, i) => {
    const row = cb.split(/\s+/).map(parseChord);
    if (row.length !== p.chordsPerBar) throw new Error(`${p.id}: bar ${i + 1} has ${row.length} chords, expected ${p.chordsPerBar}`);
    return row;
  });
  const out: ParsedPiece = { piece: p, spb, bars: bars.length, notes, chords };
  parsed.set(p.id, out);
  return out;
}
