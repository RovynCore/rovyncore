"""Build comparison boards and short QA motion captures from browser screenshots.

Pixel differences are diagnostic only: the canonical images contain illustrative
data and wording that must not be copied into the live product.
"""

from pathlib import Path
from PIL import Image, ImageChops, ImageEnhance

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "output" / "visual-upgrade"
REFERENCES = OUTPUT / "references"
IMPLEMENTATION = OUTPUT / "implementation"
COMPARE = OUTPUT / "comparison"
COMPARE.mkdir(parents=True, exist_ok=True)

names = {
    "CR-01": "home",
    "CR-02": "launchpad",
    "CR-03": "explorer",
    "CR-04": "asset",
    "CR-05": "rvyn",
}

for code, name in names.items():
    reference = Image.open(REFERENCES / f"{code}_reference_1448x1086.png").convert("RGB")
    actual = Image.open(IMPLEMENTATION / f"{code}_impl_1448x1086.png").convert("RGB")
    if reference.size != actual.size:
        actual = actual.resize(reference.size, Image.Resampling.LANCZOS)
    diff = ImageEnhance.Contrast(ImageChops.difference(reference, actual)).enhance(2)
    overlay = Image.blend(reference, actual, .5)
    overlay.save(COMPARE / f"{code}_overlay50_1448x1086.png", optimize=True)
    diff.save(COMPARE / f"{code}_diff_1448x1086.png", optimize=True)
    board = Image.new("RGB", (reference.width * 2, reference.height * 2), "#020807")
    board.paste(reference, (0, 0))
    board.paste(actual, (reference.width, 0))
    board.paste(overlay, (0, reference.height))
    board.paste(diff, (reference.width, reference.height))
    board.save(COMPARE / f"{code}_reference-actual-overlay-diff.jpg", quality=89)
    print(f"{code}: {reference.size[0]}x{reference.size[1]} comparison saved")

for label in ("desktop", "mobile"):
    frames = sorted((OUTPUT / "motion" / label).glob("frame-*.png"))
    if frames:
        images = [Image.open(path).convert("RGB") for path in frames]
        images[0].save(
            OUTPUT / "motion" / f"{label}-home.gif",
            save_all=True,
            append_images=images[1:],
            duration=120,
            loop=0,
            optimize=True,
        )
        print(f"{label}: {len(images)} frames rendered")

    qa_frames = sorted((OUTPUT / "motion" / label).glob("qa-*.png"))
    if len(qa_frames) >= 30:
        qa_images = [Image.open(path).convert("RGB") for path in qa_frames[:30]]
        if label == "desktop":
            qa_images = [frame.resize((724, 543), Image.Resampling.LANCZOS) for frame in qa_images]
        qa_images[0].save(
            OUTPUT / "motion" / f"{label}-qa-30s.gif",
            save_all=True,
            append_images=qa_images[1:],
            duration=1000,
            loop=0,
            optimize=True,
        )
        print(f"{label}: 30-second QA sequence rendered")
