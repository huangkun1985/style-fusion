"""開發用：算每一軌的 A 加權響度（接近人耳感受），輸出相對於旋律軌的分貝差，用來調混音平衡。
用法：python scripts/levels.py <stem-wav> [<stem-wav> ...]
"""
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


def level(path: str):
    x, sr = sf.read(path, always_2d=True)
    m = x.mean(axis=1)
    sos = a_weight_sos(sr)
    w = signal.sosfilt(sos, m)
    rms = float(np.sqrt((w**2).mean()) + 1e-12)
    return 20 * np.log10(rms), float(np.abs(m).max())


rows = [(p.split('stem-')[-1].replace('.wav', ''), *level(p)) for p in sys.argv[1:]]
ref = next((r[1] for r in rows if r[0] == 'lead'), max(r[1] for r in rows))
for name, db, pk in rows:
    print(f"{name:<8} A-weighted {db:6.1f} dB  ({db - ref:+5.1f} vs lead)  peak {pk:.2f}")
