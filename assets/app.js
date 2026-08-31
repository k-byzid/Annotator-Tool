/*
 * Annotator.
 *
 * Three steps: choose a photo, click its 4 corners to flatten it, then draw a
 * box round every piece of text and type what it says. Nothing is guessed for
 * you -- every box and every label is put there by a person -- and the
 * finished labels download to this device.
 */
import { warp } from "./warp.js";

const MAX_CANVAS_WIDTH = 1000;   // biggest we draw, in screen pixels
const HANDLE_RADIUS = 7;         // how near a corner counts as grabbing it
const MIN_BOX = 6;               // ignore drags smaller than this

const state = {
  name: "page",
  photo: null,       // the chosen image
  page: null,        // the straightened canvas
  corners: [],       // up to 4 {x, y} in photo pixels
  dragCorner: -1,
  boxes: [],
  selected: -1,
  drawing: null,
  scale: 1,
  lastKind: "printed",   // carried onto the next box drawn
};

const $ = (id) => document.getElementById(id);

function escapeHtml(text) {
  const holder = document.createElement("div");
  holder.textContent = text ?? "";
  return holder.innerHTML;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read that image."));
    image.src = url;
  });
}

/* Canvases are drawn at a readable size, but every coordinate is stored in
 * image pixels so the display scale never leaks into what gets saved. */
function fitScale(image) {
  return Math.min(1, MAX_CANVAS_WIDTH / image.width);
}

function toImage(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (canvas.width / rect.width) / state.scale,
    y: (event.clientY - rect.top) * (canvas.height / rect.height) / state.scale,
  };
}

/* ------------------------------------------------------------- step 1 */

$("file-input").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const message = $("upload-msg");
  try {
    state.photo = await loadImage(URL.createObjectURL(file));
  } catch (error) {
    message.textContent = error.message;
    message.className = "msg bad";
    return;
  }

  state.name = file.name.replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9_-]+/g, "_") || "page";
  state.corners = [];
  state.boxes = [];
  state.selected = -1;
  message.textContent = state.photo.width + " x " + state.photo.height + " pixels";
  message.className = "msg";

  $("step-corners").hidden = false;
  $("step-boxes").hidden = true;
  drawCorners();
});

/* ------------------------------------------------------------- step 2 */

const cornerCanvas = $("canvas-corners");
const cornerCtx = cornerCanvas.getContext("2d");

function drawCorners() {
  const image = state.photo;
  if (!image) return;

  state.scale = fitScale(image);
  cornerCanvas.width = image.width * state.scale;
  cornerCanvas.height = image.height * state.scale;
  cornerCtx.drawImage(image, 0, 0, cornerCanvas.width, cornerCanvas.height);

  const points = state.corners.map((p) => ({
    x: p.x * state.scale,
    y: p.y * state.scale,
  }));

  if (points.length > 1) {
    cornerCtx.beginPath();
    cornerCtx.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((p) => cornerCtx.lineTo(p.x, p.y));
    if (points.length === 4) cornerCtx.closePath();
    cornerCtx.strokeStyle = "#2f6fed";
    cornerCtx.lineWidth = 2;
    cornerCtx.stroke();
  }

  points.forEach((point, index) => {
    cornerCtx.beginPath();
    cornerCtx.arc(point.x, point.y, HANDLE_RADIUS, 0, Math.PI * 2);
    cornerCtx.fillStyle = "#fff";
    cornerCtx.fill();
    cornerCtx.strokeStyle = "#2f6fed";
    cornerCtx.lineWidth = 2;
    cornerCtx.stroke();
    cornerCtx.fillStyle = "#1d2430";
    cornerCtx.font = "12px system-ui";
    cornerCtx.fillText(String(index + 1), point.x + 9, point.y - 9);
  });

  $("corner-count").textContent = state.corners.length + " of 4 corners";
  $("btn-straighten").disabled = state.corners.length !== 4;
}

function nearestCorner(point) {
  const reach = HANDLE_RADIUS / state.scale + 4;
  for (let i = 0; i < state.corners.length; i += 1) {
    const corner = state.corners[i];
    if (Math.hypot(corner.x - point.x, corner.y - point.y) <= reach) return i;
  }
  return -1;
}

cornerCanvas.addEventListener("pointerdown", (event) => {
  const point = toImage(cornerCanvas, event);
  const grabbed = nearestCorner(point);

  if (grabbed >= 0) {
    state.dragCorner = grabbed;
    cornerCanvas.setPointerCapture(event.pointerId);
  } else if (state.corners.length < 4) {
    state.corners.push(point);
  }
  drawCorners();
});

cornerCanvas.addEventListener("pointermove", (event) => {
  if (state.dragCorner < 0) return;
  state.corners[state.dragCorner] = toImage(cornerCanvas, event);
  drawCorners();
});

cornerCanvas.addEventListener("pointerup", () => {
  state.dragCorner = -1;
});

$("btn-undo-corner").onclick = () => {
  state.corners.pop();
  drawCorners();
};

$("btn-clear-corners").onclick = () => {
  state.corners = [];
  drawCorners();
};

function startBoxes(canvas) {
  state.page = canvas;
  state.boxes = [];
  state.selected = -1;
  $("step-boxes").hidden = false;
  refreshBoxes();
}

$("btn-straighten").onclick = () => {
  startBoxes(warp(state.photo, state.corners));
};

// A scan or a screenshot is already flat, and forcing four clicks onto one
// would only introduce error.
$("btn-skip").onclick = () => {
  const canvas = document.createElement("canvas");
  canvas.width = state.photo.width;
  canvas.height = state.photo.height;
  canvas.getContext("2d").drawImage(state.photo, 0, 0);
  startBoxes(canvas);
};

/* ------------------------------------------------------------- step 3 */

const boxCanvas = $("canvas-boxes");
const boxCtx = boxCanvas.getContext("2d");

function rectToPoints(x0, y0, x1, y1) {
  const left = Math.min(x0, x1);
  const right = Math.max(x0, x1);
  const top = Math.min(y0, y1);
  const bottom = Math.max(y0, y1);
  return [[left, top], [right, top], [right, bottom], [left, bottom]];
}

function colourFor(box, isSelected) {
  if (isSelected) return "#2f6fed";
  if (!box.text) return "#9aa3ae";               // drawn, but not labelled yet
  return box.kind === "handwritten" ? "#dc7a10" : "#14894a";
}

function drawBoxes() {
  const image = state.page;
  if (!image) return;

  state.scale = fitScale(image);
  boxCanvas.width = image.width * state.scale;
  boxCanvas.height = image.height * state.scale;
  boxCtx.drawImage(image, 0, 0, boxCanvas.width, boxCanvas.height);

  state.boxes.forEach((box, index) => {
    const points = box.points.map((p) => [p[0] * state.scale, p[1] * state.scale]);
    boxCtx.beginPath();
    boxCtx.moveTo(points[0][0], points[0][1]);
    points.slice(1).forEach((p) => boxCtx.lineTo(p[0], p[1]));
    boxCtx.closePath();
    boxCtx.strokeStyle = colourFor(box, index === state.selected);
    boxCtx.lineWidth = index === state.selected ? 3 : 2;
    boxCtx.setLineDash(box.text ? [] : [5, 4]);
    boxCtx.stroke();
  });
  boxCtx.setLineDash([]);

  if (state.drawing) {
    const d = state.drawing;
    boxCtx.strokeStyle = "#2f6fed";
    boxCtx.lineWidth = 2;
    boxCtx.strokeRect(d.x0 * state.scale, d.y0 * state.scale,
                      (d.x1 - d.x0) * state.scale, (d.y1 - d.y0) * state.scale);
  }
}

function hitTest(point) {
  // Last drawn wins, so a box sitting on top of another is the one selected.
  for (let i = state.boxes.length - 1; i >= 0; i -= 1) {
    const xs = state.boxes[i].points.map((p) => p[0]);
    const ys = state.boxes[i].points.map((p) => p[1]);
    if (point.x >= Math.min(...xs) && point.x <= Math.max(...xs) &&
        point.y >= Math.min(...ys) && point.y <= Math.max(...ys)) {
      return i;
    }
  }
  return -1;
}

boxCanvas.addEventListener("pointerdown", (event) => {
  const point = toImage(boxCanvas, event);
  const hit = hitTest(point);
  if (hit >= 0) {
    selectBox(hit);
    $("box-text").focus();
    $("box-text").select();
    return;
  }
  state.drawing = { x0: point.x, y0: point.y, x1: point.x, y1: point.y };
  boxCanvas.setPointerCapture(event.pointerId);
});

boxCanvas.addEventListener("pointermove", (event) => {
  if (!state.drawing) return;
  const point = toImage(boxCanvas, event);
  state.drawing.x1 = point.x;
  state.drawing.y1 = point.y;
  drawBoxes();
});

boxCanvas.addEventListener("pointerup", () => {
  const drawn = state.drawing;
  state.drawing = null;
  if (!drawn) return;

  if (Math.abs(drawn.x1 - drawn.x0) < MIN_BOX ||
      Math.abs(drawn.y1 - drawn.y0) < MIN_BOX) {
    drawBoxes();
    return;
  }

  state.boxes.push({
    points: rectToPoints(drawn.x0, drawn.y0, drawn.x1, drawn.y1),
    text: "",
    kind: state.lastKind,
  });
  selectBox(state.boxes.length - 1);
  $("box-text").focus();
});

/* --------------------------------------------------------- side panel */

function selectBox(index) {
  saveSelectedText();
  state.selected = index;
  const box = state.boxes[index];

  $("box-text").value = box ? box.text : "";
  $("box-kind").value = box ? box.kind : state.lastKind;
  refreshBoxes();
}

function saveSelectedText() {
  const box = state.boxes[state.selected];
  if (!box) return;
  box.text = $("box-text").value;
  box.kind = $("box-kind").value;
}

/* Enter finishes a box and hands the canvas back, so a page is worked through
 * as draw, type, Enter, draw the next one. */
function commitBox() {
  const box = state.boxes[state.selected];
  if (!box) return;
  saveSelectedText();
  state.selected = -1;
  $("box-text").value = "";
  $("box-text").blur();
  refreshBoxes();
}

function refreshBoxes() {
  const list = $("box-list");
  list.innerHTML = "";
  state.boxes.forEach((box, index) => {
    const item = document.createElement("li");
    const flag = box.text ? "" : ' <span class="todo">no label</span>';
    item.innerHTML = (escapeHtml(box.text) || "<i>(empty)</i>") +
                     ' <span class="kind">' + box.kind + "</span>" + flag;
    if (index === state.selected) item.className = "active";
    item.onclick = () => selectBox(index);
    list.appendChild(item);
  });

  const blank = state.boxes.filter((b) => !b.text).length;
  $("box-count").textContent = blank
    ? state.boxes.length + " boxes - " + blank + " still to label"
    : state.boxes.length + " boxes";
  drawBoxes();
}

$("box-text").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    commitBox();
  }
});

$("box-text").addEventListener("input", () => {
  const box = state.boxes[state.selected];
  if (box) {
    box.text = $("box-text").value;
    refreshBoxes();
  }
});

$("box-kind").addEventListener("change", () => {
  state.lastKind = $("box-kind").value;
  const box = state.boxes[state.selected];
  if (box) box.kind = state.lastKind;
  refreshBoxes();
});

document.addEventListener("keydown", (event) => {
  const typing = event.target.tagName === "INPUT" ||
                 event.target.tagName === "SELECT";
  if (event.key === "Delete" && !typing) deleteSelected();
});

function deleteSelected() {
  if (state.selected < 0) return;
  state.boxes.splice(state.selected, 1);
  state.selected = -1;
  $("box-text").value = "";
  refreshBoxes();
}

/* --------------------------------------------------------- the download */

$("btn-delete-box").onclick = deleteSelected;

$("btn-clear-boxes").onclick = () => {
  state.boxes = [];
  state.selected = -1;
  $("box-text").value = "";
  refreshBoxes();
};

function download(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

$("btn-download").onclick = () => {
  saveSelectedText();
  const message = $("save-msg");

  if (!state.boxes.length) {
    message.textContent = "There are no boxes to save.";
    message.className = "msg bad";
    return;
  }

  const record = {
    image: state.name,
    width: state.page.width,
    height: state.page.height,
    created: new Date().toISOString().slice(0, 19),
    boxes: state.boxes,
  };
  download(state.name + ".json", JSON.stringify(record, null, 2));

  // ICDAR-2015: eight numbers then the text, one box per line. A box left
  // without a label goes out as "###", the don't-care marker, so a detector
  // still learns the box while no recogniser is trained on a blank.
  const lines = state.boxes.map((box) => {
    const coords = box.points.map((p) => Math.round(p[0]) + "," + Math.round(p[1])).join(",");
    return coords + "," + (box.text || "###");
  });
  download("gt_" + state.name + ".txt", lines.join("\n") + "\n");

  const labelled = state.boxes.filter((b) => b.text).length;
  message.textContent = "Downloaded " + state.boxes.length + " boxes (" +
                        labelled + " labelled) as .json and .txt";
  message.className = "msg ok";
};
