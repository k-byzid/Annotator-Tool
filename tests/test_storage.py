import pytest

from annotator import config, storage


@pytest.fixture(autouse=True)
def temp_data_dir(tmp_path, monkeypatch):
    """Point the storage module at a throwaway folder for each test."""
    for name in ("UPLOAD_DIR", "IMAGE_DIR", "LABEL_DIR", "EXPORT_DIR"):
        folder = tmp_path / name.split("_")[0].lower()
        folder.mkdir(exist_ok=True)
        monkeypatch.setattr(config, name, folder)
    return tmp_path


def box(text="hello", verified=True):
    return {
        "points": [[0, 0], [10, 0], [10, 5], [0, 5]],
        "text": text,
        "kind": "printed",
        "verified": verified,
        "confidence": 0.9,
    }


def test_safe_name_strips_awkward_characters():
    assert storage.safe_name("my receipt (2).jpg") == "my_receipt_2"
    assert storage.safe_name("../../etc/passwd") == "passwd"


def test_safe_name_never_returns_empty():
    assert storage.safe_name("!!!.png") == "page"


def test_clean_box_rejects_a_box_without_four_corners():
    assert storage.clean_box({"points": [[0, 0], [1, 1]]}) is None


def test_clean_box_treats_a_missing_flag_as_confirmed():
    # Hand-drawn boxes carry no `verified` key; only an explicit False means
    # an unchecked OCR guess.
    assert storage.clean_box({"points": [[0, 0], [1, 0], [1, 1], [0, 1]]})["verified"]


def test_save_and_load_round_trip():
    assert storage.save("page1", [box("hello")], 100, 50) == 1

    loaded = storage.load("page1")
    assert loaded["width"] == 100
    assert loaded["boxes"][0]["text"] == "hello"


def test_save_ignores_unusable_boxes():
    assert storage.save("page1", [{"points": [[0, 0]]}], 10, 10) == 0


def test_export_marks_unconfirmed_text_as_dont_care():
    storage.save("page1", [box("checked"), box("guess", verified=False)], 10, 10)

    lines = (config.EXPORT_DIR / "gt_page1.txt").read_text(encoding="utf-8").split()
    assert lines[0].endswith(",checked")
    assert lines[1].endswith(",###")


def test_load_returns_none_for_an_unknown_page():
    assert storage.load("never-seen") is None


def test_summary_counts_boxes_per_page():
    storage.save("page1", [box(), box()], 10, 10)
    storage.save("page2", [box()], 10, 10)

    assert storage.summary() == [
        {"name": "page1", "boxes": 2},
        {"name": "page2", "boxes": 1},
    ]
