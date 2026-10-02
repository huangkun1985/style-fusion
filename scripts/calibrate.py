"""開發用：量每個音色號的 A 加權響度，算出校正倍率，寫成 src/audio/calibration.ts。
用法：python scripts/calibrate.py <calDir> [目標響度 dB，預設 -25]
"""
import glob
import sys

import numpy as np
import soundfile as sf
from scipy import signal


def a_weight_sos(sr: int):
    f1, f2, f3, f4 = 20.598997, 107.65265, 737.86223, 12194.217
    a1000 = 1.9997
    nums = [(2 * np.pi * f4) ** 2 * (10 ** (a1000 / 20)), 0, 0, 0, 0]
    dens = np.polymul([1, 4 * np.pi * f4, (2 * np.pi * f4) ** 2], [1, 4 * np.pi * f1, (2 * np.pi * f1) ** 2])
    dens = np.polymul(np.polymul(dens, [1, 2 * np.pi * f3]), [1, 2 * np.pi * f2])
    z, p, k = signal.bilinear_zpk(*signal.tf2zpk(nums, dens), fs=sr)
    return signal.zpk2sos(z, p, k)


cal_dir = sys.argv[1]
target = float(sys.argv[2]) if len(sys.argv) > 2 else -25.0
rows = {}
for path in sorted(glob.glob(cal_dir + '/cal-*.wav')):
    p = int(path.split('cal-')[-1].split('.')[0])
    x, sr = sf.read(path, always_2d=True)
    m = x.mean(axis=1)
    w = signal.sosfilt(a_weight_sos(sr), m)
    # 只量有聲音的部分（避開休止），取 RMS 最大的 70% 視窗平均
    hop = int(sr * 0.1)
    frames = np.array([np.sqrt((w[i : i + hop] ** 2).mean()) for i in range(0, len(w) - hop, hop)])
    top = np.sort(frames)[-int(len(frames) * 0.6) :]
    db = 20 * np.log10(np.sqrt((top**2).mean()) + 1e-9)
    mult = float(np.clip(10 ** ((target - db) / 20), 0.06, 4.0))
    rows[p] = (db, mult)

with open('src/audio/calibration.ts', 'w', encoding='utf8', newline='\n') as f:
    f.write('// 自動產生（scripts/calibrate-render.ts + scripts/calibrate.py）：每個取樣音色號的響度校正倍率，\n')
    f.write('// 讓不同樂器在同樣的力度下聽起來一樣大聲（A 加權響度對齊到 %.0f dB）。\n' % target)
    f.write('export const CALIBRATION: Record<number, number> = {\n')
    for p, (db, mult) in rows.items():
        f.write('  %d: %.3f, // %.1f dB\n' % (p, mult, db))
    f.write('};\n')
print('programs', len(rows))
for p, (db, mult) in rows.items():
    print(f'{p:3d}  {db:6.1f} dB  x{mult:.2f}')
