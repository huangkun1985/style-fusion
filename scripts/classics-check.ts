// 開發用：名曲庫的資料檢查（小節拍數、和弦數、所有曲風 × 所有名曲都能作曲、循環長度、XM 列數）。
// 用法：npx tsx scripts/classics-check.ts
import { PIECES, parsePiece } from '../src/audio/classics';
import { composeSong } from '../src/audio/compose';
import { GENRES } from '../src/audio/genres';
import type { GenreId } from '../src/audio/types';

let fails = 0;
const ok = (c: boolean, msg: string) => {
  if (!c) {
    fails++;
    console.log('  ✗', msg);
  }
};

for (const p of PIECES) {
  const pp = parsePiece(p);
  const lo = Math.min(...pp.notes.map((n) => n.pitch));
  const hi = Math.max(...pp.notes.map((n) => n.pitch));
  console.log(`${p.id.padEnd(13)} ${String(pp.bars).padStart(2)} 小節 ${pp.notes.length.toString().padStart(3)} 音 音域 ${lo}–${hi} 步數 ${pp.bars * pp.spb}`);
  ok(pp.bars * pp.spb <= 256, `${p.id}: 超過 256 步`);
  for (const genre of Object.keys(GENRES) as GenreId[]) {
    for (const L of [2.2, 3.2, 4.2, 8]) {
      for (const sync of [true, false]) {
        const s = composeSong({ genre, seed: 11, animSeconds: L, sync, tempo: 1, key: -1, piece: p.id });
        ok(s.steps <= 256, `${p.id}/${genre}: steps ${s.steps}`);
        if (sync) ok(Math.abs(s.seconds - s.animLoops * L) < 1e-6, `${p.id}/${genre}/L=${L}: loop ${s.seconds} vs ${s.animLoops}×${L}`);
        ok(s.bpm >= 40 && s.bpm <= 200, `${p.id}/${genre}: bpm ${s.bpm}`);
        for (const tr of s.tracks) {
          for (const n of tr.notes) {
            ok(Number.isFinite(n.t) && n.t >= 0 && n.t < s.steps, `${p.id}/${genre}/${tr.id}: t=${n.t}`);
            ok(n.dur > 0 && n.vel > 0 && n.vel <= 1, `${p.id}/${genre}/${tr.id}: dur/vel`);
            if (!tr.drum) ok(n.pitch >= 24 && n.pitch <= 108, `${p.id}/${genre}/${tr.id}: pitch ${n.pitch}`);
          }
        }
        const again = composeSong({ genre, seed: 11, animSeconds: L, sync, tempo: 1, key: -1, piece: p.id });
        ok(JSON.stringify(again) === JSON.stringify(s), `${p.id}/${genre}: 不是確定性的`);
      }
    }
  }
  // 移調
  for (const key of [0, 3, 6, 9, 11]) {
    const s = composeSong({ genre: p.genre, seed: 11, animSeconds: 3.2, sync: true, tempo: 1, key, piece: p.id });
    ok(s.key === key, `${p.id}: key ${s.key} != ${key}`);
    const lead = s.tracks.find((t) => t.id === 'lead')!;
    ok(lead.notes.length === pp.notes.length * (s.bars / pp.bars), `${p.id}: 旋律音數 ${lead.notes.length}`);
    const lo2 = Math.min(...lead.notes.map((n) => n.pitch));
    const hi2 = Math.max(...lead.notes.map((n) => n.pitch));
    ok(lo2 >= 36 && hi2 <= 96, `${p.id}@${key}: 旋律音域 ${lo2}–${hi2}`);
  }
  const s0 = composeSong({ genre: p.genre, seed: 11, animSeconds: 3.2, sync: true, tempo: 1, key: -1, piece: p.id });
  console.log(`   ${s0.title} | 循環 ${s0.seconds.toFixed(1)}s = ${s0.animLoops}×3.2s | ${s0.bars} 小節`);
}
console.log(fails ? `\n${fails} 項失敗` : '\n名曲庫檢查全部通過');
process.exit(fails ? 1 : 0);
