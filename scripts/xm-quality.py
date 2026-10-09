"""開發用：比較 MIDI 與 XM 渲染（scripts/xm-quality.ts 的輸出），用數字看 XM 離 MIDI 多遠。
用法：python scripts/xm-quality.py <資料夾> [樂器...]
指標（越小越接近 MIDI）：
  音色差  ＝ 長時間平均頻譜在 1/3 八度頻帶上的平均絕對差（dB），XM 先把整體音量對齊 MIDI
  高頻差  ＝ 4–12 kHz 的有號差（負＝XM 比 MIDI 暗；正＝XM 比 MIDI 亮／有雜音）
  包絡相關＝兩者 10 ms 響度包絡的相關係數（越接近 1 表示音符的起音與衰減越像）
  雜訊底  ＝ XM 與 MIDI 在 12 kHz 以上的能量差（dB），混疊／插值雜音會讓它變大
"""
import sys
import numpy as np
import soundfile as sf
from scipy.signal import stft

d = sys.argv[1]
names = sys.argv[2:] or [
    'piano', 'epiano', 'nylon', 'eguitar', 'bass', 'harp', 'organ', 'violin', 'cello', 'contrabass',
    'trumpet', 'trombone', 'tuba', 'horn', 'sax', 'flute', 'clarinet', 'marimba', 'vibes', 'glock',
]
SR = 44100
edges = [100 * 2 ** (i / 3) for i in range(0, 21) if 100 * 2 ** (i / 3) < 14000]


def mono(path):
    x, sr = sf.read(path)
    return (x.mean(axis=1) if x.ndim > 1 else x), sr


def ltas(x):
    f, t, Z = stft(x, SR, nperseg=4096, noverlap=2048)
    P = (np.abs(Z) ** 2)
    e = P.sum(axis=0)
    keep = e > e.max() * 1e-4
    p = P[:, keep].mean(axis=1)
    bands = []
    for a, b in zip(edges[:-1], edges[1:]):
        m = (f >= a) & (f < b)
        bands.append(10 * np.log10(p[m].sum() + 1e-14))
    return np.array(bands), f, p


def env(x, hop=441):
    n = len(x) // hop
    return np.sqrt((x[: n * hop].reshape(n, hop) ** 2).mean(axis=1))


tot = []
print(f"{'樂器':11s} {'音色差dB':>8s} {'高頻差dB':>8s} {'包絡相關':>8s} {'12k以上差dB':>11s}")
for nm in names:
    a, _ = mono(f'{d}/{nm}-midi.wav')
    b, _ = mono(f'{d}/{nm}-xm.wav')
    n = min(len(a), len(b))
    a, b = a[:n], b[:n]
    # 只看有聲音的部分來對齊整體音量
    ra = np.sqrt((a[np.abs(a) > 1e-4] ** 2).mean())
    rb = np.sqrt((b[np.abs(b) > 1e-4] ** 2).mean())
    b = b * (ra / max(rb, 1e-9))
    la, f, pa = ltas(a)
    lb, _, pb = ltas(b)
    mid = np.array([(x + y) / 2 for x, y in zip(edges[:-1], edges[1:])])
    ok = (mid > 150) & (mid < 12000)
    lsd = np.abs(la[ok] - lb[ok]).mean()
    hf = (lb[(mid > 4000) & (mid < 12000)] - la[(mid > 4000) & (mid < 12000)]).mean()
    ea, eb = env(a), env(b)
    c = float(np.corrcoef(ea, eb)[0, 1])
    air = 10 * np.log10(pb[f > 12000].sum() + 1e-14) - 10 * np.log10(pa[f > 12000].sum() + 1e-14)
    tot.append((lsd, abs(hf), c, abs(air)))
    print(f'{nm:11s} {lsd:8.2f} {hf:+8.2f} {c:8.3f} {air:+11.1f}')
t = np.array(tot)
print(f"{'平均':11s} {t[:,0].mean():8.2f} {t[:,1].mean():8.2f} {t[:,2].mean():8.3f} {t[:,3].mean():11.1f}   （高頻差取絕對值平均）")
