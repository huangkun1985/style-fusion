// WAV 編碼（16-bit PCM，立體聲）
export function encodeWav(l: Float32Array, r: Float32Array, sr: number): Uint8Array {
  const n = l.length;
  const bytes = new Uint8Array(44 + n * 4);
  const dv = new DataView(bytes.buffer);
  const wr = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) bytes[o + i] = s.charCodeAt(i);
  };
  wr(0, 'RIFF');
  dv.setUint32(4, 36 + n * 4, true);
  wr(8, 'WAVE');
  wr(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 2, true);
  dv.setUint32(24, sr, true);
  dv.setUint32(28, sr * 4, true);
  dv.setUint16(32, 4, true);
  dv.setUint16(34, 16, true);
  wr(36, 'data');
  dv.setUint32(40, n * 4, true);
  let o = 44;
  for (let i = 0; i < n; i++) {
    dv.setInt16(o, Math.max(-32768, Math.min(32767, Math.round(l[i] * 32767))), true);
    dv.setInt16(o + 2, Math.max(-32768, Math.min(32767, Math.round(r[i] * 32767))), true);
    o += 4;
  }
  return bytes;
}
