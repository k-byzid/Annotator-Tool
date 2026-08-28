"""Turning clicked corners into a straightened page, and boxes into crops."""
import cv2
import numpy as np


def order_corners(points):
    """Sort 4 points into top-left, top-right, bottom-right, bottom-left.

    Sorting by angle around the centre means it does not matter which corner
    was clicked first, or which way round the user went.
    """
    pts = np.asarray(points, dtype=np.float32)
    centre = pts.mean(axis=0)
    angles = np.arctan2(pts[:, 1] - centre[1], pts[:, 0] - centre[0])
    pts = pts[np.argsort(angles)]
    start = int(np.argmin(pts.sum(axis=1)))     # begin nearest the top-left
    return np.roll(pts, -start, axis=0)


def warp(image, corners):
    """Flatten a four-sided region into an upright rectangle."""
    quad = order_corners(corners)
    tl, tr, br, bl = quad

    # Size the output from the real side lengths so nothing is squashed.
    width = int(round(max(np.linalg.norm(tr - tl), np.linalg.norm(br - bl))))
    height = int(round(max(np.linalg.norm(bl - tl), np.linalg.norm(br - tr))))
    width, height = max(width, 10), max(height, 10)

    target = np.array([[0, 0], [width - 1, 0],
                       [width - 1, height - 1], [0, height - 1]],
                      dtype=np.float32)
    matrix = cv2.getPerspectiveTransform(quad, target)
    return cv2.warpPerspective(image, matrix, (width, height))


def crop(image, points):
    """Cut one text box out of a page and stand it upright.

    Boxes are quadrilaterals rather than rectangles: a line of text on a
    photographed page is rarely level even after the page is flattened.
    Returns None for a box too small to be useful.
    """
    quad = np.asarray(points, dtype=np.float32)
    width = int(round(max(np.linalg.norm(quad[1] - quad[0]),
                          np.linalg.norm(quad[2] - quad[3]))))
    height = int(round(max(np.linalg.norm(quad[3] - quad[0]),
                           np.linalg.norm(quad[2] - quad[1]))))
    if width < 4 or height < 4:
        return None

    target = np.array([[0, 0], [width - 1, 0],
                       [width - 1, height - 1], [0, height - 1]],
                      dtype=np.float32)
    matrix = cv2.getPerspectiveTransform(quad, target)
    return cv2.warpPerspective(image, matrix, (width, height))


def pad_box(points, width, height, fraction):
    """Grow a box outwards a little, staying inside the image."""
    box = np.asarray(points, dtype=np.float32)
    centre = box.mean(axis=0)
    grown = centre + (box - centre) * (1.0 + fraction)
    grown[:, 0] = np.clip(grown[:, 0], 0, width - 1)
    grown[:, 1] = np.clip(grown[:, 1], 0, height - 1)
    return grown
