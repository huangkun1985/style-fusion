# 產生「小黃鴨游泳 v2」動畫主題檔（style-fusion-theme v1）。用法：python duck_gen.py <輸出路徑>
# 第二版：整個畫面是水（主題自帶背景，不吃風格的白底）；鴨子三階明暗、扇形羽毛的翅膀、兩色的嘴、倒影。
import json, math, sys

out = sys.argv[1]
R = lambda v: round(v, 1)
FLAT = {"stroke": False, "shadow": False, "hl": False}
SOFT = {"shadow": False, "hl": False}

def xform(pts, sx=1, sy=1, dx=0, dy=0, cx=0, cy=0):
    o = []
    for i in range(0, len(pts), 2):
        o += [R(cx + (pts[i] - cx) * sx + dx), R(cy + (pts[i + 1] - cy) * sy + dy)]
    return o

def loopkf(vals, ease="inOut"):
    n = len(vals)
    return [[R(i / n), v, ease] for i, v in enumerate(vals)] + [[1, vals[0]]]

def wrapped(f, ph, n=16):
    """0..1 的週期函數 f(t) 錯開相位 ph，取樣成線性關鍵影格；在重置點用 hold 瞬間跳回（那一刻 f 的透明度應為 0）"""
    ts = sorted(set([R(k / n) for k in range(n)] + ([round(ph - 0.002, 3), R(ph)] if 0 < ph < 1 else [])))
    kf = []
    for t in ts:
        if 0 < ph < 1 and abs(t - round(ph - 0.002, 3)) < 1e-9:
            kf.append([t, R(f(0.998)), "hold"])
        else:
            kf.append([t, R(f((t - ph) % 1)), "linear"])
    kf.append([1, kf[0][1]])
    return kf

def half_ell(rx, ry, lower=True, n=28):
    pts = []
    for i in range(n + 1):
        t = math.pi * i / n
        pts += [R(rx * math.cos(t)), R((1 if lower else -1) * ry * math.sin(t))]
    return pts

WL = 46          # 鴨子的水線
PK = 0.24        # 水面透視扁率（漣漪）
S = 1.3          # 鴨子縮放
WATER = "q+22"   # 鴨子周圍的水色（中段均勻，前方的水用同色蓋住水線以下，才不會看到邊）

layers = []

# ───────── 背景：整個畫面是水。中段均勻，上方逐步變亮（遠處反光），下方逐步變深
layers.append({"id": "water", "type": "rect", "w": 3000, "h": 2000, "fill": WATER, **FLAT})
for i in range(8):
    y1 = -70 - i * 22
    layers.append({"type": "rect", "w": 3000, "h": 1000, "y": R(y1 - 500), "fill": "q+34", "opacity": 0.13, **FLAT})
for i in range(8):
    y0 = 120 + i * 20
    layers.append({"type": "rect", "w": 3000, "h": 1000, "y": R(y0 + 500), "fill": "q+6", "opacity": 0.12, **FLAT})

# 水面的細波紋：小段正弦，往後（左）流、兩端淡入淡出；越遠（越上面）越細越小
def squiggle(ln, amp):
    n = 18
    return [R(c) for i in range(n + 1) for c in (-ln / 2 + ln * i / n, amp * math.sin(2 * math.pi * 1.5 * i / n))]
WAVES = [(-300, -150, 0.0), (-80, -168, 0.4), (170, -140, 0.7), (330, -175, 0.2),
         (-220, -95, 0.55), (60, -110, 0.15), (280, -80, 0.85),
         (-340, 120, 0.3), (-120, 150, 0.65), (140, 128, 0.05), (330, 165, 0.45), (-30, 185, 0.9),
         (-300, 20, 0.75), (300, 30, 0.35)]
for x0, y0, ph in WAVES:
    near = (y0 + 200) / 400
    ln = 40 + 60 * near
    layers.append({"type": "curve", "points": squiggle(ln, 2 + 3 * near), "w": R(1.2 + 1.6 * near), "fill": "light", **FLAT,
                   "y": y0, "x": wrapped(lambda t, x0=x0, near=near: x0 - (50 + 70 * near) * t, ph),
                   "alpha": wrapped(lambda t, near=near: (0.25 + 0.3 * near) * math.sin(math.pi * t) ** 1.5, ph)})

# ───────── 漣漪（後半圈，畫在鴨子後面）
def ripple(lower, ph, a0):
    return {"type": "curve", "points": half_ell(96, 96 * PK, lower), "w": 1.8, "fill": "light", **FLAT, "y": WL,
            "s": wrapped(lambda t: 1 + 2.6 * (1 - (1 - t) ** 2), ph),
            "alpha": wrapped(lambda t: a0 * min(1, t * 10) * (1 - t) ** 1.3, ph)}
for ph in (0.0, 0.5):
    layers.append(ripple(False, ph, 0.55))

# ───────── 鴨子
def foot(phase):
    web = [0, 0, 12, 4, 26, 2, 20, 8, 28, 12, 18, 14, 24, 20, 8, 14, 0, 6]
    kick = [28, -26] if phase == 0 else [-26, 28]
    return {"type": "group", "x": 6 if phase == 0 else 22, "y": 30,
            "rot": [[0, kick[0], "inOut"], [0.5, kick[1], "inOut"], [1, kick[0]]],
            "children": [
                {"type": "line", "points": [0, 0, 0, 20], "w": 5, "fill": "r-8", **FLAT},
                {"type": "blob", "points": xform(web, dx=-14, dy=18), "fill": "r", **FLAT},
            ]}

TAIL_PTS = [6, 10, -20, 2, -36, -26, -42, -42, -26, -34, -6, -18, 14, -6]
tail = {"type": "group", "x": -64, "y": -6,
        "rot": [[0, 0, "linear"], [0.72, 0, "inOut"], [0.76, -12, "inOut"], [0.8, 10, "inOut"], [0.84, -6, "inOut"], [0.88, 0, "linear"], [1, 0]],
        "children": [
            {"type": "blob", "points": TAIL_PTS, "fill": "a-10", **SOFT},
            {"type": "blob", "points": xform(TAIL_PTS, 0.86, 0.86, dx=-1, dy=-2, cx=-14, cy=-14), "fill": "a", **FLAT},
            {"type": "curve", "points": [-6, -16, -24, -30, -36, -38], "w": 2.4, "fill": "light", "opacity": 0.45, **FLAT},
        ]}

BODY = [-58, -16, -30, -24, 0, -22, 30, -18, 58, -8, 72, 12, 64, 34, 40, 46, 0, 50, -40, 46, -66, 30, -74, 8]
BODY_MID = xform(BODY, 0.92, 0.88, dx=-3, dy=-3, cx=0, cy=14)  # 內層要完全包在外框裡（線稿風格下內層會變成底色補丁）
BODY_TOP = xform(BODY, 0.8, 0.64, dx=-6, dy=-9, cx=0, cy=14)
WING = [24, 6, 18, -4, 4, -10, -16, -12, -38, -10, -54, -4, -58, 4, -50, 9, -54, 16, -42, 22, -24, 25, -4, 25, 12, 20, 22, 13]
WING_HI = xform(WING, 0.7, 0.55, dx=4, dy=-4, cx=-14, cy=6)
HEAD_R = 48

head = {"type": "group", "x": 30, "y": -18,
        "rot": [[0, 0, "linear"], [0.56, 0, "inOut"], [0.62, -14, "out"], [0.7, -14, "inOut"], [0.78, 0, "linear"], [1, 0]],
        "children": [
            {"type": "circle", "r": HEAD_R, "x": 10, "y": -42, "fill": "a-10", **SOFT},
            {"type": "circle", "r": HEAD_R - 5, "x": 7, "y": -45, "fill": "a", **FLAT},
            {"type": "circle", "r": HEAD_R - 18, "x": 2, "y": -52, "fill": "a+7", "opacity": 0.7, **FLAT},
            {"type": "ellipse", "rx": 15, "ry": 9, "x": -14, "y": -70, "rot": -32, "fill": "light", "opacity": 0.7, **FLAT},
            {"type": "circle", "r": 4.5, "x": 6, "y": -80, "fill": "light", "opacity": 0.6, **FLAT},
            {"type": "ellipse", "rx": 10, "ry": 6.5, "x": 30, "y": -24, "fill": "r+22", "opacity": 0.5, **FLAT},
            {"type": "group", "x": 25, "y": -46,
             "sy": [[0, 1, "linear"], [0.28, 1, "linear"], [0.3, 0.1, "linear"], [0.32, 1, "linear"], [1, 1]],
             "children": [
                 {"type": "ellipse", "rx": 7.5, "ry": 9.5, "fill": "ink", **FLAT},
                 {"type": "circle", "r": 3, "x": -2.2, "y": -3.6, "fill": "light", **FLAT},
                 {"type": "circle", "r": 1.4, "x": 2.6, "y": 3.4, "fill": "light", "opacity": 0.8, **FLAT},
             ]},
            {"type": "group", "x": 50, "y": -30, "children": [
                {"type": "group", "rot": [[0, 0, "linear"], [0.6, 0, "out"], [0.64, 18, "inOut"], [0.7, 5, "inOut"], [0.74, 0, "linear"], [1, 0]],
                 "children": [{"type": "blob", "points": [-4, 2, 8, 6, 20, 8, 30, 10, 18, 15, 2, 13], "fill": "r-14", **SOFT}]},
                {"type": "group", "rot": [[0, 0, "linear"], [0.6, 0, "out"], [0.64, -14, "inOut"], [0.7, -4, "inOut"], [0.74, 0, "linear"], [1, 0]],
                 "children": [
                     {"type": "blob", "points": [-6, -7, 10, -9, 26, -5, 34, 3, 22, 8, 4, 8, -6, 4], "fill": "r", **SOFT},
                     {"type": "curve", "points": [2, -4, 14, -5, 24, -2], "w": 2.2, "fill": "light", "opacity": 0.5, **FLAT},
                     {"type": "ellipse", "rx": 2.2, "ry": 1.4, "x": 12, "y": -1, "fill": "r-28", **FLAT},
                 ]},
            ]},
        ]}

duck = {"id": "duck", "type": "group", "react": 1, "s": S,
        "y": loopkf([3, -2, 3, -2]),
        "rot": loopkf([2, -2.5, 2, -2.5]),
        "children": [
            foot(1), foot(0), tail,
            {"id": "body", "type": "blob", "points": BODY, "fill": "a-14", **SOFT},
            {"type": "blob", "points": BODY_MID, "fill": "a", **FLAT},
            {"type": "blob", "points": BODY_TOP, "fill": "a+6", "opacity": 0.65, **FLAT},
            {"type": "curve", "points": [-52, -14, -26, -20, 0, -18, 26, -14], "w": 3, "fill": "light", "opacity": 0.4, **FLAT},
            {"type": "ellipse", "rx": 12, "ry": 8, "x": 50, "y": 4, "rot": -24, "fill": "light", "opacity": 0.5, **FLAT},
            {"type": "group", "x": -2, "y": 6,
             "rot": [[0, 0, "linear"], [0.6, 0, "inOut"], [0.64, -10, "inOut"], [0.68, 4, "inOut"], [0.72, 0, "linear"], [1, 0]],
             "children": [
                 {"type": "blob", "points": WING, "fill": "a-8", **SOFT},
                 {"type": "ellipse", "rx": 24, "ry": 9, "x": -6, "y": 2, "rot": -6, "fill": "a+5", **FLAT},
                 {"type": "curve", "points": [16, -2, 0, -7, -20, -8], "w": 2.4, "fill": "light", "opacity": 0.45, **FLAT},
             ]},
            head,
        ]}
layers.append({"type": "group", "y": R(WL - (50 - 16) * S), "children": [duck]})

# ───────── 水面之下：前半圈同色的水蓋住水線以下（72%，所以還隱約看得到身體與划水的腳）
layers.append({"id": "waterFront", "type": "polygon", "points": half_ell(150, 70, True), "y": WL, "fill": WATER, "opacity": 0.72, **FLAT})
# 倒影：鴨子的剪影鏡射到水面下，隨水波伸縮
layers.append({"type": "group", "y": WL, "x": 4, "sy": R(-0.55 * S), "sx": [[0, R(1.03 * S), "inOut"], [0.25, R(0.97 * S), "inOut"], [0.5, R(1.03 * S), "inOut"], [0.75, R(0.97 * S), "inOut"], [1, R(1.03 * S)]],
               "alpha": 0.2,
               "children": [
                   {"type": "blob", "points": xform(BODY, dy=-34), "fill": "a", **FLAT},
               ]})
layers.append({"type": "curve", "points": half_ell(92, 92 * PK, True, 20), "y": WL, "w": 2, "fill": "light", "opacity": 0.6, **FLAT,
               "sx": loopkf([1.02, 0.98, 1.02, 0.98])})
for ph in (0.0, 0.5):
    layers.append(ripple(True, ph, 0.8))

# 閃光：水面上幾顆一閃一閃的小星光
for x, y, ph in [(-250, -120, 0.1), (210, -60, 0.45), (-150, 90, 0.7), (300, 110, 0.25)]:
    layers.append({"type": "polygon", "points": [0, -7, 1.6, -1.6, 7, 0, 1.6, 1.6, 0, 7, -1.6, 1.6, -7, 0, -1.6, -1.6], "fill": "light", **FLAT,
                   "x": x, "y": y, "s": wrapped(lambda t: 0.3 + 0.9 * math.sin(math.pi * min(1, t * 3)) ** 2, ph),
                   "alpha": wrapped(lambda t: 0.85 * math.sin(math.pi * min(1, t * 3)), ph)})

# 氣泡：從腳邊冒出、上升、在水面破掉
for i, (bx, ph) in enumerate([(-6, 0.1), (24, 0.45), (-28, 0.75)]):
    layers.append({"type": "circle", "r": 3 + i, "fill": None, "stroke": "light", "lw": 0.7, **SOFT, "x": bx,
                   "y": wrapped(lambda t: WL + 48 - 42 * (1 - (1 - t) ** 2), ph),
                   "alpha": wrapped(lambda t: 0.75 * min(1, t * 6) * min(1, (1 - t) * 8), ph)})

theme = {
    "format": "style-fusion-theme",
    "version": 1,
    "name": "小黃鴨游泳 v2",
    "desc": "經典橡皮小黃鴨浮在水面上：身體浮沉輕晃、水下划腳、抬頭呱呱叫、甩尾巴；水面的波紋往後流、漣漪擴散、倒影晃動、星光閃爍。鴨身（點綴）、嘴（大地）、水（自然）的顏色都可在「自訂色板」改。",
    "loop": 3.2,
    "hero": 0.66,
    "key": 0.62,
    "track": "duck",
    "palette": {"a": "#FFD43B", "r": "#FF8A3D", "q": "#2A86C9"},
    "events": [],
    "sounds": [
        {"u": 0, "sfx": "whoosh", "k": 0.2},
        {"u": 0.5, "sfx": "whoosh", "k": 0.2},
        {"u": 0.62, "sfx": "quack", "k": 0.7},
        {"u": 0.76, "sfx": "flip", "k": 0.35},
    ],
    "layers": layers,
}
with open(out, "w", encoding="utf-8") as f:
    json.dump(theme, f, ensure_ascii=False, indent=1)
print("ok", len(json.dumps(theme, ensure_ascii=False).encode("utf-8")))
