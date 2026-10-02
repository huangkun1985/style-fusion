"""開發用：比較兩個 WAV 的 10ms RMS 包絡相關性（驗證自製 XM 播放器與 libopenmpt 一致）。"""
import sys
import numpy as np
import soundfile as sf

a, sr = sf.read(sys.argv[1])
b, sr2 = sf.read(sys.argv[2])
n = min(len(a), len(b))
a = a[:n].mean(axis=1)
b = b[:n].mean(axis=1)


def env(x, hop=441):
    return np.array([np.sqrt((x[i : i + hop] ** 2).mean()) for i in range(0, len(x) - hop, hop)])


ea, eb = env(a), env(b)
ea /= ea.max()
eb /= eb.max()
# 允許 ±3 個窗口（30ms）的偏移，取最佳相關
best = max((float(np.corrcoef(ea[max(0, s) : len(ea) + min(0, s)], eb[max(0, -s) : len(eb) + min(0, -s)])[0, 1]), s) for s in range(-3, 4))
print("RMS envelope correlation:", round(best[0], 3), "at shift", best[1], "windows | lengths", len(a) / sr, len(b) / sr2)
