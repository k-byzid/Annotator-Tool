"""Settings, all in one place."""
import os
from pathlib import Path

# Where uploads and annotations are kept. Override with ANNOTATOR_DATA.
DATA_DIR = Path(os.environ.get("ANNOTATOR_DATA", "data")).resolve()

UPLOAD_DIR = DATA_DIR / "uploads"    # photos as they were sent
IMAGE_DIR = DATA_DIR / "images"      # straightened pages
LABEL_DIR = DATA_DIR / "labels"      # one JSON of boxes per page
EXPORT_DIR = DATA_DIR / "export"     # ICDAR-2015 .txt, for training

ALL_DIRS = (UPLOAD_DIR, IMAGE_DIR, LABEL_DIR, EXPORT_DIR)

ALLOWED_SUFFIXES = {".png", ".jpg", ".jpeg"}

# OCR languages, as EasyOCR codes: "en", "fr", "bn", "hi", ...
# English only by default; pass --lang on the command line to change it.
LANGUAGES = ["en"]

# Use a GPU when there is one.
USE_GPU = True

# Text boxes are grown by this fraction before being cut out, because
# detectors tend to clip tall or descending characters.
BOX_PADDING = 0.10

# Below this, a reading is treated as unreliable and shown for review.
MIN_CONFIDENCE = 0.60


def make_dirs():
    """Create the data folders if they are not there yet."""
    for folder in ALL_DIRS:
        folder.mkdir(parents=True, exist_ok=True)
