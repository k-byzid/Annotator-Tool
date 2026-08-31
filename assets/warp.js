/*
 * Flattening a photographed page.
 *
 * A page shot at an angle is a slanted quadrilateral, not a rectangle. A
 * canvas can only do affine transforms, which cannot represent that, so the
 * perspective warp is done by hand: solve for the homography, then map every
 * output pixel back into the source and sample it.
 */

/** Sort 4 points into top-left, top-right, bottom-right, bottom-left.
 *
 * Sorting by angle around the centre means it does not matter which corner
 * was clicked first, or which way round the user went. */
export function orderCorners(points) {
  const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;

  const sorted = points
    .slice()
    .sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));

  // Rotate so the corner nearest the origin comes first.
  let start = 0;
  let best = Infinity;
  sorted.forEach((p, i) => {
    if (p.x + p.y < best) {
      best = p.x + p.y;
      start = i;
    }
  });
  return sorted.slice(start).concat(sorted.slice(0, start));
}

/** Solve the 8 unknowns of the homography taking `from` onto `to`.
 *
 * Each corner pair gives two equations, so four pairs fully determine it.
 * Gaussian elimination with partial pivoting is plenty for an 8x8. */
export function homography(from, to) {
  const a = [];
  const b = [];

  for (let i = 0; i < 4; i += 1) {
    const { x, y } = from[i];
    const { x: u, y: v } = to[i];
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }

  for (let col = 0; col < 8; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < 8; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    [a[col], a[pivot]] = [a[pivot], a[col]];
    [b[col], b[pivot]] = [b[pivot], b[col]];

    const lead = a[col][col];
    if (Math.abs(lead) < 1e-12) continue;      // degenerate; caller clamps

    for (let row = 0; row < 8; row += 1) {
      if (row === col) continue;
      const factor = a[row][col] / lead;
      for (let k = col; k < 8; k += 1) a[row][k] -= factor * a[col][k];
      b[row] -= factor * b[col];
    }
  }

  const h = b.map((value, i) => value / a[i][i]);
  h.push(1);
  return h;
}

/** Apply a homography to a point. */
export function apply(h, x, y) {
  const w = h[6] * x + h[7] * y + h[8];
  return { x: (h[0] * x + h[1] * y + h[2]) / w, y: (h[3] * x + h[4] * y + h[5]) / w };
}

function distance(p, q) {
  return Math.hypot(p.x - q.x, p.y - q.y);
}

/** Flatten the quadrilateral `corners` of `source` into an upright canvas. */
export function warp(source, corners) {
  const [tl, tr, br, bl] = orderCorners(corners);

  // Size the output from the real side lengths, so nothing is squashed.
  const width = Math.max(10, Math.round(Math.max(distance(tr, tl), distance(br, bl))));
  const height = Math.max(10, Math.round(Math.max(distance(bl, tl), distance(br, tr))));

  const read = document.createElement("canvas");
  read.width = source.width;
  read.height = source.height;
  read.getContext("2d").drawImage(source, 0, 0);
  const src = read.getContext("2d").getImageData(0, 0, source.width, source.height);

  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const dst = out.getContext("2d").createImageData(width, height);

  // Map the output rectangle back onto the photographed quadrilateral, so
  // every destination pixel has somewhere to read from. Going the other way
  // would leave holes wherever the source stretches.
  const h = homography(
    [{ x: 0, y: 0 }, { x: width - 1, y: 0 },
     { x: width - 1, y: height - 1 }, { x: 0, y: height - 1 }],
    [tl, tr, br, bl],
  );

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const w = h[6] * x + h[7] * y + h[8];
      const sx = (h[0] * x + h[1] * y + h[2]) / w;
      const sy = (h[3] * x + h[4] * y + h[5]) / w;
      const target = (y * width + x) * 4;

      if (sx < 0 || sy < 0 || sx > src.width - 1 || sy > src.height - 1) {
        dst.data[target + 3] = 255;            // outside the photo: black
        continue;
      }

      // Bilinear sampling. Nearest-neighbour leaves small text visibly
      // jagged, which the OCR then has to read through.
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(x0 + 1, src.width - 1);
      const y1 = Math.min(y0 + 1, src.height - 1);
      const fx = sx - x0;
      const fy = sy - y0;

      for (let channel = 0; channel < 3; channel += 1) {
        const p00 = src.data[(y0 * src.width + x0) * 4 + channel];
        const p10 = src.data[(y0 * src.width + x1) * 4 + channel];
        const p01 = src.data[(y1 * src.width + x0) * 4 + channel];
        const p11 = src.data[(y1 * src.width + x1) * 4 + channel];
        dst.data[target + channel] =
          p00 * (1 - fx) * (1 - fy) + p10 * fx * (1 - fy) +
          p01 * (1 - fx) * fy + p11 * fx * fy;
      }
      dst.data[target + 3] = 255;
    }
  }

  out.getContext("2d").putImageData(dst, 0, 0);
  return out;
}
