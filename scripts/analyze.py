"""開發用：分析渲染出的 WAV（峰值、RMS、直流、循環接縫、頻譜重心、節奏），並輸出頻譜圖 PNG。
用法：python scripts/analyze.py file.wav [more.wav ...]
"""
import sys
import numpy as np
import soundfile as sf
from scipy import signal


def analyze(path: str, plot: bool = True):
    x, sr = sf.read(path, always_2d=True)
    m = x.mean(axis=1)
    n = len(m)
    peak = float(np.abs(x).max())
    rms = float(np.sqrt((x**2).mean()))
    dc = float(m.mean())
    # 循環接縫：首尾樣本差，與全曲相鄰樣本差的 99 百分位比較
    diffs = np.abs(np.diff(m))
    seam = abs(float(m[0] - m[-1]))
    p99 = float(np.percentile(diffs, 99.9)) or 1e-9
    # 頻譜重心
    f, t, S = signal.spectrogram(m, sr, nperseg=2048, noverlap=1536)
    cent = float((f[:, None] * S).sum() / (S.sum() + 1e-12))
    # 起音（onset）密度：以能量包絡的正差分
    hop = int(sr * 0.01)
    env = np.array([np.sqrt((m[i : i + hop] ** 2).mean()) for i in range(0, n - hop, hop)])
    d = np.maximum(np.diff(env), 0)
    onsets = int((d > d.mean() + 2 * d.std()).sum())
    # 靜音比例
    silent = float((env < 0.005).mean())
    # 立體聲相關
    corr = float(np.corrcoef(x[:, 0], x[:, 1])[0, 1]) if x.shape[1] > 1 else 1.0
    print(
        f"{path.split(chr(92))[-1]:<34} sr={sr} dur={n/sr:6.2f}s peak={peak:.3f} rms={rms:.3f} dc={dc:+.4f} "
        f"seam={seam:.4f} (p99.9 step {p99:.4f}) centroid={cent:6.0f}Hz onsets={onsets} silent={silent:.0%} LRcorr={corr:.2f} nan={bool(np.isnan(x).any())}"
    )
    if plot:
        try:
            import matplotlib

            matplotlib.use("Agg")
            import matplotlib.pyplot as plt

            fig, ax = plt.subplots(2, 1, figsize=(10, 5), gridspec_kw={"height_ratios": [1, 2]})
            tt = np.arange(n) / sr
            ax[0].plot(tt, m, lw=0.3)
            ax[0].set_xlim(0, n / sr)
            ax[0].set_ylim(-1, 1)
            ax[1].pcolormesh(t, f, 10 * np.log10(S + 1e-12), shading="auto", cmap="magma", vmin=-110, vmax=-30)
            ax[1].set_ylim(0, 12000)
            ax[1].set_xlabel("s")
            fig.tight_layout()
            fig.savefig(path.replace(".wav", ".png"), dpi=70)
            plt.close(fig)
        except Exception as e:  # noqa: BLE001
            print("plot failed:", e)


if __name__ == "__main__":
    for p in sys.argv[1:]:
        analyze(p)
