import numpy as np

from annotator.geometry import crop, order_corners, pad_box, warp


def test_order_corners_is_independent_of_click_order():
    square = [[0, 0], [10, 0], [10, 10], [0, 10]]
    expected = order_corners(square)

    # Same corners clicked anticlockwise, and starting somewhere else.
    for clicks in ([[10, 10], [10, 0], [0, 0], [0, 10]],
                   [[10, 0], [10, 10], [0, 10], [0, 0]]):
        assert np.allclose(order_corners(clicks), expected)


def test_order_corners_starts_at_top_left():
    ordered = order_corners([[5, 40], [50, 5], [0, 0], [45, 45]])
    assert list(ordered[0]) == [0, 0]


def test_warp_flattens_a_slanted_page():
    image = np.zeros((100, 100, 3), dtype=np.uint8)
    flat = warp(image, [[10, 12], [80, 5], [88, 70], [15, 78]])
    # Roughly 75 x 68 in the source, so the output keeps those proportions.
    assert flat.shape[0] > 50 and flat.shape[1] > 50


def test_crop_rejects_a_box_too_small_to_read():
    image = np.zeros((50, 50, 3), dtype=np.uint8)
    assert crop(image, [[0, 0], [2, 0], [2, 2], [0, 2]]) is None


def test_crop_returns_the_requested_size():
    image = np.zeros((50, 50, 3), dtype=np.uint8)
    cut = crop(image, [[5, 5], [25, 5], [25, 15], [5, 15]])
    assert cut.shape[:2] == (10, 20)


def test_pad_box_grows_but_stays_inside_the_image():
    grown = pad_box([[10, 10], [20, 10], [20, 20], [10, 20]], 100, 100, 0.5)
    assert grown[:, 0].min() < 10 and grown[:, 0].max() > 20
    assert grown.min() >= 0 and grown.max() <= 99


def test_pad_box_clips_at_the_edges():
    grown = pad_box([[0, 0], [10, 0], [10, 10], [0, 10]], 20, 20, 1.0)
    assert grown.min() >= 0
    assert grown[:, 0].max() <= 19 and grown[:, 1].max() <= 19
