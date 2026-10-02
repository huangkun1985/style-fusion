// 開發用：讓 Node 腳本也能解碼內嵌的 MP3 取樣（瀏覽器用 decodeAudioData，Node 改用 ffmpeg）。
import { spawnSync } from 'node:child_process';
import { setSamplerDecoder } from '../src/audio/sampler';

export function useFfmpegDecoder() {
  setSamplerDecoder(async (bytes, rate) => {
    const r = spawnSync('ffmpeg', ['-v', 'error', '-i', 'pipe:0', '-ac', '1', '-ar', String(rate), '-f', 'f32le', 'pipe:1'], { input: Buffer.from(bytes), maxBuffer: 1 << 28 });
    if (r.status !== 0) throw new Error(`ffmpeg 解碼失敗：${r.stderr}`);
    const b = r.stdout;
    return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength - (b.byteLength % 4)));
  });
}
