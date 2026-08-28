"""Reading and writing annotations on disk.

Two formats are written for every page:

  labels/<name>.json   everything we know: points, text, kind, and whether a
                       person confirmed it. This is the file to keep.
  export/gt_<name>.txt ICDAR-2015, which text-detector trainers read.

In the export, text nobody has confirmed is written as `###` -- the standard
"don't care" marker. An unchecked OCR guess is a reading, not a label, and
letting it through as truth would train a model on its own mistakes.
"""
import json
import re
from datetime import datetime
from pathlib import Path

from . import config


def safe_name(name):
    """Reduce any filename to something safe to use on disk."""
    stem = re.sub(r"[^A-Za-z0-9_-]+", "_", Path(name).stem).strip("_")
    return stem or "page"


def unique_upload_path(filename):
    """A path in the uploads folder that does not overwrite anything."""
    suffix = Path(filename).suffix.lower()
    stem = safe_name(filename)
    candidate = config.UPLOAD_DIR / f"{stem}{suffix}"
    counter = 1
    while candidate.exists():
        candidate = config.UPLOAD_DIR / f"{stem}_{counter}{suffix}"
        counter += 1
    return candidate


def clean_box(box):
    """Keep only the fields we store, with sane defaults."""
    points = [[int(round(p[0])), int(round(p[1]))]
              for p in box.get("points", [])]
    if len(points) != 4:
        return None
    return {
        "points": points,
        "text": (box.get("text") or "").strip(),
        "kind": box.get("kind") or "unknown",
        "source": box.get("source") or "hand",
        # Only an explicit False counts as unverified, so a hand-drawn box
        # with no flag is treated as confirmed.
        "verified": box.get("verified", True) is not False,
        "confidence": box.get("confidence"),
    }


def save(name, boxes, width, height):
    """Write one page's annotations. Returns the number of boxes saved."""
    name = safe_name(name)
    items = [b for b in (clean_box(box) for box in boxes) if b]
    if not items:
        return 0

    record = {
        "image": f"{name}.png",
        "width": width,
        "height": height,
        "created": datetime.now().isoformat(timespec="seconds"),
        "boxes": items,
    }
    # ensure_ascii=False so non-Latin scripts stay readable in the file.
    (config.LABEL_DIR / f"{name}.json").write_text(
        json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")

    lines = []
    for item in items:
        coords = ",".join(str(v) for point in item["points"] for v in point)
        text = item["text"] if (item["text"] and item["verified"]) else "###"
        lines.append(f"{coords},{text}")
    (config.EXPORT_DIR / f"gt_{name}.txt").write_text(
        "\n".join(lines) + "\n", encoding="utf-8")

    return len(items)


def load(name):
    """Read back one page's annotations, or None if it has none yet."""
    path = config.LABEL_DIR / f"{safe_name(name)}.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def summary():
    """Every annotated page, with its box count."""
    pages = []
    for path in sorted(config.LABEL_DIR.glob("*.json")):
        try:
            record = json.loads(path.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            continue
        pages.append({"name": path.stem, "boxes": len(record.get("boxes", []))})
    return pages
