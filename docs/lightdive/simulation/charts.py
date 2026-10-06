import json
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager as fm

for w in (400, 500, 700):
    fm.fontManager.addfont(f"fonts/NotoSansTC-{w}.ttf")
plt.rcParams.update({
    "font.family": "Noto Sans TC", "font.size": 10,
    "axes.edgecolor": "#898781", "axes.labelcolor": "#52514e",
    "xtick.color": "#898781", "ytick.color": "#898781",
    "axes.spines.top": False, "axes.spines.right": False,
    "axes.grid": True, "grid.color": "#e6e5e0", "grid.linewidth": 0.6,
    "figure.facecolor": "#fcfcfb", "axes.facecolor": "#fcfcfb",
    "legend.frameon": False, "lines.linewidth": 2,
})
D = json.load(open("sim.json"))
R = D["results"]
COL = {"base": "#2a78d6", "boom": "#eb6834", "bust": "#1baf7a"}
NAME = {"base": "基準情境", "boom": "爆紅情境", "bust": "冷卻情境"}
days = [r["day"] for r in R["base"]]


def smooth(xs, k=7):
    out = []
    for i in range(len(xs)):
        w = xs[max(0, i - k + 1): i + 1]
        out.append(sum(w) / len(w))
    return out


def fig(name, key, title, ylabel, scale=1.0, ref=None, smooth_k=1):
    f, ax = plt.subplots(figsize=(7.2, 2.75), dpi=200)
    for sc in ("base", "boom", "bust"):
        ys = [r[key] / scale for r in R[sc]]
        if smooth_k > 1:
            ys = smooth(ys, smooth_k)
        ax.plot(days, ys, color=COL[sc], label=NAME[sc])
    if ref is not None:
        ax.axhline(ref, color="#52514e", linewidth=1, linestyle=(0, (4, 3)))
        ax.annotate("收支平衡 = 1.0", (280, ref), xytext=(0, 4), textcoords="offset points", fontsize=8, color="#52514e")
    ax.set_title(title, loc="left", fontsize=11, fontweight="bold", color="#0b0b0b")
    ax.set_xlabel("上線天數")
    ax.set_ylabel(ylabel)
    ax.set_xlim(1, 370)
    ax.set_ylim(bottom=0)
    ax.legend(loc="upper center", ncol=3, fontsize=8.5, bbox_to_anchor=(0.5, -0.22))
    f.tight_layout()
    f.savefig(f"{name}.png")
    plt.close(f)


fig("c_pool", "pool", "核光池餘額", "千 RVYN", scale=1000)
fig("c_players", "players", "活躍光塔數", "座")
fig("c_ratio", "ratio", "平均玩家收支比（7 日平均）", "領取 RVYN ÷ 成本", ref=1.0, smooth_k=7)

# Emission: ours vs fixed-reward model in the boom scenario
f, ax = plt.subplots(figsize=(7.2, 2.75), dpi=200)
boom = R["boom"]
ys1 = [r["emission"] / 1000 for r in boom]
ys2 = [r["fixed_model"] / 1000 for r in boom]
ax.plot(days, ys2, color="#eb6834", label="固定報酬模式（同樣玩家人數，CryptoMines 式）")
ax.plot(days, ys1, color="#2a78d6", label="核光池按比例分配（本設計）")
ax.annotate("固定報酬", (days[-1], ys2[-1]), xytext=(4, 0), textcoords="offset points", va="center", fontsize=8.5, color="#52514e")
ax.annotate("本設計", (days[-1], ys1[-1]), xytext=(4, 0), textcoords="offset points", va="center", fontsize=8.5, color="#52514e")
ax.set_title("爆紅情境下每日釋出量比較", loc="left", fontsize=11, fontweight="bold", color="#0b0b0b")
ax.set_xlabel("上線天數")
ax.set_ylabel("千 RVYN / 日")
ax.set_xlim(1, 370)
ax.set_ylim(bottom=0)
ax.legend(loc="upper center", ncol=2, fontsize=8.5, bbox_to_anchor=(0.5, -0.22))
f.tight_layout()
f.savefig("c_emission.png")
plt.close(f)
print("ok")
