"""Read text off a page with EasyOCR, so annotating starts from a draft.

The detector is the part that already works well: it finds text regardless of
language or whether it is printed or handwritten. Reading it is less reliable,
which is why every result arrives unverified and a person confirms it.

EasyOCR is imported lazily. It pulls in PyTorch and loads weights onto the
GPU, which takes several seconds, and nothing should pay that cost just to
start the web server.
"""
from pathlib import Path

import cv2

from . import config
from .geometry import pad_box

_reader = None


def get_reader(languages=None):
    """Build the EasyOCR reader once and reuse it."""
    global _reader
    if _reader is None:
        import easyocr
        _reader = easyocr.Reader(languages or config.LANGUAGES,
                                 gpu=config.USE_GPU, verbose=False)
    return _reader


def read(image_path):
    """Read one image. Returns a list of box dicts in reading order.

    Each box has its 4 corner points in image pixels, the text, and EasyOCR's
    own confidence. Nothing here is ground truth -- `verified` stays False
    until a person has looked at it.
    """
    image = cv2.imread(str(Path(image_path)))
    if image is None:
        raise ValueError(f"Could not open image: {image_path}")

    height, width = image.shape[:2]
    found = get_reader().readtext(image, detail=1, paragraph=False)

    boxes = []
    for points, text, confidence in found:
        points = pad_box(points, width, height, config.BOX_PADDING)
        confidence = round(float(confidence), 4)
        boxes.append({
            "points": [[int(round(x)), int(round(y))] for x, y in points],
            "text": text,
            "confidence": confidence,
            "kind": "printed" if confidence >= config.MIN_CONFIDENCE else "handwritten",
            "source": "ocr",
            "verified": False,
        })

    # Top to bottom, then left to right, so the order matches how it reads.
    boxes.sort(key=lambda b: (min(p[1] for p in b["points"]),
                              min(p[0] for p in b["points"])))
    return boxes
