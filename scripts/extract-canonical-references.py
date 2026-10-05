"""Extract the five embedded canonical JPEG images from the FINAL PDF.

LibreOffice recompresses the original PNG files into JPEG XObjects inside the
PDF. The reference PNGs produced here preserve the embedded pixels and native
1448x1086 geometry, but cannot reproduce the original PNG byte hashes listed
in the document.
"""

from __future__ import annotations

import io
from pathlib import Path

from PIL import Image
from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parent / "網站視覺化" / "RovynCore_FINAL_Master_Build_Specification.pdf"
OUTPUT = ROOT / "output" / "visual-upgrade" / "references"
REFERENCES = (
    ("CR-01", 3, "/Im191"),
    ("CR-02", 4, "/Im201"),
    ("CR-03", 5, "/Im214"),
    ("CR-04", 6, "/Im226"),
    ("CR-05", 7, "/Im239"),
)


def main() -> None:
    reader = PdfReader(SOURCE)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for label, page_number, object_name in REFERENCES:
        xobject = reader.pages[page_number - 1]["/Resources"]["/XObject"][object_name].get_object()
        with Image.open(io.BytesIO(xobject.get_data())) as image:
            if image.size != (1448, 1086):
                raise ValueError(f"{label}: unexpected reference size {image.size}")
            destination = OUTPUT / f"{label}_reference_1448x1086.png"
            image.convert("RGB").save(destination, optimize=True)
            print(destination)


if __name__ == "__main__":
    main()
