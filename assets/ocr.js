/*
 * OCR in the browser, via Tesseract.js.
 *
 * Tesseract and its language data are fetched from a CDN the first time you
 * run it -- a few megabytes, cached by the browser afterwards. Nothing is
 * uploaded: the recognition happens on the visitor's own machine, so the
 * documents never leave it.
 */

const TESSERACT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";

/** How confident Tesseract has to be before we call a box printed text. */
const CONFIDENT = 60;

let loading = null;
let worker = null;
let workerLanguage = null;

function loadTesseract() {
  if (window.Tesseract) return Promise.resolve();
  if (loading) return loading;

  loading = new Promise((resolve, reject) => {
    const tag = document.createElement("script");
    tag.src = TESSERACT_URL;
    tag.onload = resolve;
    tag.onerror = () => reject(new Error("Could not load Tesseract.js. Check your connection."));
    document.head.appendChild(tag);
  });
  return loading;
}

/** Build a worker for these languages, reusing the last one when it matches.
 *
 * Spinning one up downloads the language data, so it is worth keeping. */
async function getWorker(languages, onProgress) {
  await loadTesseract();
  const wanted = languages.join("+");

  if (worker && workerLanguage === wanted) return worker;
  if (worker) await worker.terminate();

  worker = await window.Tesseract.createWorker(wanted, 1, {
    logger: (message) => {
      if (message.status && onProgress) onProgress(message);
    },
  });
  workerLanguage = wanted;
  return worker;
}

/** Tesseract nests words inside lines inside paragraphs inside blocks.
 *
 * Which of those the result exposes directly varies between versions, so
 * walk down to the words rather than trusting a top-level shortcut. */
function collectWords(data) {
  if (data.words && data.words.length) return data.words;

  const words = [];
  (data.blocks || []).forEach((block) => {
    (block.paragraphs || []).forEach((paragraph) => {
      (paragraph.lines || []).forEach((line) => {
        (line.words || []).forEach((word) => words.push(word));
      });
    });
  });
  return words;
}

/** Read a canvas. Returns boxes in reading order, all of them unverified. */
export async function read(canvas, languages, onProgress) {
  const engine = await getWorker(languages, onProgress);
  const { data } = await engine.recognize(canvas);

  const boxes = collectWords(data)
    .filter((word) => (word.text || "").trim())
    .map((word) => {
      const { x0, y0, x1, y1 } = word.bbox;
      const confidence = (word.confidence || 0) / 100;
      return {
        points: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]],
        text: word.text.trim(),
        confidence: Math.round(confidence * 10000) / 10000,
        kind: word.confidence >= CONFIDENT ? "printed" : "handwritten",
        source: "ocr",
        // A reading is not a label. Nothing counts as ground truth until a
        // person has looked at it.
        verified: false,
      };
    });

  // Top to bottom, then left to right, so the order matches how it reads.
  boxes.sort((a, b) => (a.points[0][1] - b.points[0][1]) ||
                       (a.points[0][0] - b.points[0][0]));
  return boxes;
}
