/*
 * The pixel loop in warp(), exercised without a browser.
 *
 * A perspective warp is easy to get backwards -- mapping source onto
 * destination instead of the other way round still produces an image, just a
 * wrong one full of holes. These tests put known colours at known places and
 * check where they come out.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";

/** The smallest canvas that warp() will accept: it only ever calls
 *  drawImage, getImageData, createImageData and putImageData. */
function fakeCanvas() {
  const canvas = { width: 0, height: 0 };
  canvas.getContext = () => ({
    drawImage(source) {
      canvas.data = Uint8ClampedArray.from(source.data);
    },
    getImageData: () => ({ data: canvas.data, width: canvas.width, height: canvas.height }),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    putImageData(image) {
      canvas.data = image.data;
    },
  });
  return canvas;
}

let warp;

before(async () => {
  globalThis.document = { createElement: () => fakeCanvas() };
  ({ warp } = await import("../assets/warp.js"));
});

/** An image with a single bright pixel at (x, y) on a black ground. */
function imageWithDot(width, height, x, y) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  const at = (y * width + x) * 4;
  data[at] = data[at + 1] = data[at + 2] = 255;
  return { width, height, data };
}

function brightest(canvas, width) {
  let best = -1;
  let index = 0;
  for (let i = 0; i < canvas.data.length; i += 4) {
    if (canvas.data[i] > best) {
      best = canvas.data[i];
      index = i / 4;
    }
  }
  return { x: index % width, y: Math.floor(index / width), value: best };
}

test("warp sizes the output from the real side lengths", () => {
  const source = imageWithDot(200, 200, 0, 0);
  const out = warp(source, [
    { x: 10, y: 10 }, { x: 110, y: 10 }, { x: 110, y: 60 }, { x: 10, y: 60 },
  ]);
  assert.equal(out.width, 100);
  assert.equal(out.height, 50);
});

test("a dot at a quad corner lands at that corner of the output", () => {
  // Top-left of the quad is (40, 30); it must come out at (0, 0).
  const source = imageWithDot(200, 200, 40, 30);
  const out = warp(source, [
    { x: 40, y: 30 }, { x: 140, y: 30 }, { x: 140, y: 110 }, { x: 40, y: 110 },
  ]);

  const found = brightest(out, out.width);
  assert.equal(found.value, 255, "the bright pixel survived the warp");
  assert.ok(found.x <= 1 && found.y <= 1,
            `expected the dot near (0,0), got (${found.x}, ${found.y})`);
});

test("the warp really is a perspective one, not just a crop", () => {
  // A dot halfway along the top edge of a slanted quad should come out
  // halfway along the top edge of the rectangle. A plain crop would not
  // move it there.
  const source = imageWithDot(300, 300, 100, 40);
  const out = warp(source, [
    { x: 20, y: 20 }, { x: 180, y: 60 }, { x: 160, y: 200 }, { x: 10, y: 160 },
  ]);

  const found = brightest(out, out.width);
  // Bilinear sampling spreads a single bright pixel over its neighbours, so
  // the peak comes out below 255. Its position is what matters here.
  assert.ok(found.value > 100, `the dot faded away entirely (peak ${found.value})`);
  // (100,40) sits about half way along the top edge from (20,20) to (180,60).
  assert.ok(Math.abs(found.x - out.width / 2) < out.width * 0.12,
            `expected x near the middle (${out.width / 2}), got ${found.x}`);
  assert.ok(found.y < out.height * 0.12,
            `expected y near the top edge, got ${found.y}`);
});

test("pixels outside the photo come back opaque rather than transparent", () => {
  const source = imageWithDot(100, 100, 50, 50);
  const out = warp(source, [
    { x: -60, y: -60 }, { x: 40, y: -60 }, { x: 40, y: 40 }, { x: -60, y: 40 },
  ]);
  for (let i = 3; i < out.data.length; i += 4) {
    assert.equal(out.data[i], 255);
  }
});
