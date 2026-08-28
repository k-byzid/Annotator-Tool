/*
 * Annotator front end.
 *
 * Three steps, in order: upload a photo, click its 4 corners to straighten
 * it, then check the text boxes OCR found. Everything the OCR produces stays
 * marked unverified until a person accepts it.
 */
"use strict";

const MAX_CANVAS_WIDTH = 1000;   // biggest we draw, in screen pixels
const HANDLE_RADIUS = 7;         // how near a corner counts as grabbing it
const MIN_BOX = 6;               // ignore drags smaller than this

const state = {
  name: null,        // page name on the server
  photo: null,       // the uploaded image
  page: null,        // the straightened image
  corners: [],       // up to 4 {x, y} in photo pixels
  dragCorner: -1,
  boxes: [],         // {points, text, kind, confidence, verified}
  selected: -1,
  drawing: null,     // in-progress box while dragging
  scale: 1,
};

const $ = (id) => document.getElementById(id);

function escapeHtml(text) {
  const holder = document.createElement("div");
  holder.textContent = text ?? "";
  return holder.innerHTML;
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.json();
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load " + url));
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

async function upload(file) {
  const form = new FormData();
  form.append("file", file);
  const message = $("upload-msg");
  message.textContent = "Uploading...";
  message.className = "msg";

  const response = await fetch("/api/upload", { method: "POST", body: form });
  const data = await response.json();
  if (data.error) {
    message.textContent = data.error;
    message.className = "msg bad";
    return;
  }

  state.name = data.name;
  state.photo = await loadImage(data.url);
  state.corners = [];
  message.textContent = data.width + " x " + data.height + " pixels";
  message.className = "msg";

  $("step-corners").hidden = false;
  $("step-boxes").hidden = true;
  drawCorners();
}

$("file-input").addEventListener("change", (event) => {
  if (event.target.files.length) upload(event.target.files[0]);
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

$("btn-straighten").onclick = async () => {
  const corners = state.corners.map((p) => [p.x, p.y]);
  const data = await postJson("/api/straighten", {
    name: state.name,
    corners: corners,
  });
  if (data.error) {
    $("corner-count").textContent = data.error;
    return;
  }

  state.page = await loadImage(data.url + "?t=" + Date.now());
  state.boxes = [];
  state.selected = -1;
  $("step-boxes").hidden = false;
  drawBoxes();

  // Reopen what this page already has; otherwise start from an OCR draft.
  const existing = await fetch("/api/page/" + state.name).then((r) => r.json());
  if (existing.boxes && existing.boxes.length) {
    state.boxes = existing.boxes;
    refreshBoxes();
    $("read-msg").textContent = "Loaded " + state.boxes.length + " saved boxes.";
  } else {
    runOcr();
  }
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
  if (!box.verified) return "#9aa3ae";           // an unchecked OCR guess
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
    boxCtx.setLineDash(box.verified ? [] : [5, 4]);
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
    if (point.x >= Math.min.apply(null, xs) && point.x <= Math.max.apply(null, xs) &&
        point.y >= Math.min.apply(null, ys) && point.y <= Math.max.apply(null, ys)) {
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

  // A box drawn by hand is confirmed by definition: a person drew it.
  state.boxes.push({
    points: rectToPoints(drawn.x0, drawn.y0, drawn.x1, drawn.y1),
    text: "",
    kind: "handwritten",
    source: "hand",
    verified: true,
    confidence: null,
  });
  selectBox(state.boxes.length - 1);
  $("box-text").focus();
});

/* --------------------------------------------------------- side panel */

function selectBox(index) {
  saveSelectedText();
  state.selected = index;
  const box = state.boxes[index];
  const guess = $("box-guess");

  if (box && box.source === "ocr" && box.confidence !== null) {
    const percent = Math.round(box.confidence * 100);
    const flag = box.verified ? "" : ' <span class="todo">unchecked</span>';
    guess.innerHTML = "OCR read this as <b>" + escapeHtml(box.text) +
                      "</b> at " + percent + "%." + flag;
    guess.hidden = false;
  } else {
    guess.hidden = true;
  }

  $("box-text").value = box ? box.text : "";
  $("box-kind").value = box ? box.kind : "printed";
  refreshBoxes();
}

function saveSelectedText() {
  const box = state.boxes[state.selected];
  if (!box) return;
  box.text = $("box-text").value;
  box.kind = $("box-kind").value;
}

/* Accept the selected box and jump to the next unchecked one, so a page can
 * be worked through on the keyboard alone. */
function acceptBox() {
  const box = state.boxes[state.selected];
  if (!box) return;
  saveSelectedText();
  box.verified = true;

  const next = state.boxes.findIndex((b) => !b.verified);
  if (next >= 0) {
    selectBox(next);
    $("box-text").focus();
    $("box-text").select();
  } else {
    refreshBoxes();
    $("read-msg").textContent = "All boxes checked.";
  }
}

function refreshBoxes() {
  const list = $("box-list");
  list.innerHTML = "";
  state.boxes.forEach((box, index) => {
    const item = document.createElement("li");
    const flag = box.verified ? "" : ' <span class="todo">unchecked</span>';
    item.innerHTML = (escapeHtml(box.text) || "<i>(empty)</i>") +
                     ' <span class="kind">' + box.kind + "</span>" + flag;
    if (index === state.selected) item.className = "active";
    item.onclick = () => selectBox(index);
    list.appendChild(item);
  });

  const unchecked = state.boxes.filter((b) => !b.verified).length;
  $("box-count").textContent = unchecked
    ? state.boxes.length + " boxes - " + unchecked + " still to check"
    : state.boxes.length + " boxes";
  drawBoxes();
}

$("box-text").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    acceptBox();
  }
});

$("box-text").addEventListener("input", () => {
  const box = state.boxes[state.selected];
  if (box) box.text = $("box-text").value;
});

$("box-kind").addEventListener("change", () => {
  const box = state.boxes[state.selected];
  if (box) box.kind = $("box-kind").value;
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
  $("box-guess").hidden = true;
  $("box-text").value = "";
  refreshBoxes();
}

/* --------------------------------------------------------- OCR + save */

async function runOcr() {
  const message = $("read-msg");
  message.textContent = "Reading... the first run loads the model, so give it a moment.";
  message.className = "msg";

  const data = await postJson("/api/read", { name: state.name });
  if (data.error) {
    message.textContent = data.error;
    message.className = "msg bad";
    return;
  }

  // Keep anything already confirmed; OCR only fills in the rest.
  state.boxes = state.boxes.filter((b) => b.verified).concat(data.boxes);
  state.selected = -1;
  refreshBoxes();

  message.textContent = "OCR found " + data.count +
                        " boxes. Dashed grey ones are unchecked.";
  const first = state.boxes.findIndex((b) => !b.verified);
  if (first >= 0) selectBox(first);
}

$("btn-read").onclick = runOcr;
$("btn-delete-box").onclick = deleteSelected;

$("btn-accept-all").onclick = () => {
  saveSelectedText();
  state.boxes.forEach((box) => {
    box.verified = true;
  });
  refreshBoxes();
};

$("btn-clear-boxes").onclick = () => {
  state.boxes = [];
  state.selected = -1;
  $("box-guess").hidden = true;
  refreshBoxes();
};

$("btn-save").onclick = async () => {
  saveSelectedText();
  const message = $("save-msg");

  const data = await postJson("/api/save", {
    name: state.name,
    boxes: state.boxes,
    width: state.page.width,
    height: state.page.height,
  });

  if (data.error) {
    message.textContent = data.error;
    message.className = "msg bad";
    return;
  }
  message.textContent = "Saved " + data.saved + " boxes to " + data.labels;
  message.className = "msg ok";
  refreshProgress();
};

/* ----------------------------------------------------------- progress */

async function refreshProgress() {
  const holder = $("progress");
  try {
    const data = await fetch("/api/pages").then((r) => r.json());
    if (!data.pages.length) {
      holder.textContent = "Nothing annotated yet.";
      return;
    }
    const names = data.pages
      .map((p) => escapeHtml(p.name) + " (" + p.boxes + ")")
      .join(", ");
    holder.innerHTML = "<b>" + data.pages.length + "</b> pages, <b>" +
                       data.total_boxes + "</b> boxes: " + names;
  } catch (error) {
    holder.textContent = "Could not reach the server.";
  }
}

refreshProgress();
