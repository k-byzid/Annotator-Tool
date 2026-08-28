import { test } from "node:test";
import assert from "node:assert/strict";

import { orderCorners, homography, apply } from "../assets/warp.js";

const near = (a, b, tolerance = 1e-6) =>
  assert.ok(Math.abs(a - b) < tolerance, `${a} is not close to ${b}`);

test("orderCorners does not care which corner was clicked first", () => {
  const expected = orderCorners([
    { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 },
  ]);

  for (const clicks of [
    [{ x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 10 }],
    [{ x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 0, y: 0 }],
  ]) {
    assert.deepEqual(orderCorners(clicks), expected);
  }
});

test("orderCorners starts at the top-left", () => {
  const ordered = orderCorners([
    { x: 5, y: 40 }, { x: 50, y: 5 }, { x: 0, y: 0 }, { x: 45, y: 45 },
  ]);
  assert.deepEqual(ordered[0], { x: 0, y: 0 });
});

test("homography lands each corner exactly on its target", () => {
  const from = [
    { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 },
  ];
  const to = [
    { x: 12, y: 9 }, { x: 180, y: 40 }, { x: 165, y: 120 }, { x: 5, y: 95 },
  ];

  const h = homography(from, to);
  from.forEach((point, i) => {
    const mapped = apply(h, point.x, point.y);
    near(mapped.x, to[i].x, 1e-6);
    near(mapped.y, to[i].y, 1e-6);
  });
});

test("a homography onto a rectangle is its own inverse round trip", () => {
  const rect = [
    { x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 0, y: 100 },
  ];
  const quad = [
    { x: 30, y: 20 }, { x: 260, y: 55 }, { x: 240, y: 190 }, { x: 10, y: 150 },
  ];

  const forward = homography(rect, quad);
  const back = homography(quad, rect);

  for (const point of [{ x: 50, y: 25 }, { x: 199, y: 99 }, { x: 100, y: 60 }]) {
    const there = apply(forward, point.x, point.y);
    const home = apply(back, there.x, there.y);
    near(home.x, point.x, 1e-6);
    near(home.y, point.y, 1e-6);
  }
});

test("an identity mapping leaves points where they are", () => {
  const square = [
    { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 },
  ];
  const h = homography(square, square);
  const mapped = apply(h, 3, 7);
  near(mapped.x, 3, 1e-9);
  near(mapped.y, 7, 1e-9);
});
