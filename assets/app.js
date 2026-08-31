/*
 * Annotator.
 *
 * Three steps: choose a photo, click its 4 corners to flatten it, then draw a
 * box round every piece of text and type what it says. Nothing is guessed for
 * you -- every box and every label is put there by a person -- and the
 * finished labels download to this device.
 */
import { warp } from "./warp.js";
import { zip } from "./zip.js";

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
  dragging: null,    // {mode: "move"|"resize", ...} while a box is being shaped
  hovered: -1,
  scale: 1,
  lastKind: "printed",   // carried onto the next box drawn
};

const $ = (id) => document.getElementById(id);

/* One step is on screen at a time. A finished step collapses to a one-line
 * bar naming what it produced, with a way back into it. */
function show(...ids) {
  ids.forEach((id) => { $(id).hidden = false; });
}

function hide(...ids) {
  ids.forEach((id) => { $(id).hidden = true; });
}

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

$("file-input").addEventListener("change", (event) => {
  if (event.target.files[0]) usePhoto(event.target.files[0]);
});

/* A photo usually arrives by being dragged onto the page or pasted from a
 * screenshot tool, so accept both rather than only the file dialog. */
const drop = $("drop-zone");

["dragenter", "dragover"].forEach((name) => {
  drop.addEventListener(name, (event) => {
    event.preventDefault();
    drop.classList.add("over");
  });
});

["dragleave", "drop"].forEach((name) => {
  drop.addEventListener(name, (event) => {
    event.preventDefault();
    drop.classList.remove("over");
  });
});

drop.addEventListener("drop", (event) => {
  const file = [...(event.dataTransfer?.files || [])]
    .find((f) => f.type.startsWith("image/"));
  if (file) usePhoto(file);
  else fail("That was not an image file.");
});

/* A photo dropped anywhere but the zone would otherwise replace the page
 * with the image file, losing the work in progress. */
["dragover", "drop"].forEach((name) => {
  window.addEventListener(name, (event) => {
    if (!drop.contains(event.target)) event.preventDefault();
  });
});

document.addEventListener("paste", (event) => {
  if ($("step-photo").hidden) return;
  const item = [...(event.clipboardData?.items || [])]
    .find((i) => i.type.startsWith("image/"));
  if (item) usePhoto(item.getAsFile());
});

function fail(text) {
  const message = $("upload-msg");
  message.textContent = text;
  message.className = "msg bad";
}

async function usePhoto(file) {
  const message = $("upload-msg");
  try {
    state.photo = await loadImage(URL.createObjectURL(file));
  } catch (error) {
    message.textContent = error.message;
    message.className = "msg bad";
    return;
  }

  // A pasted screenshot arrives with no useful name of its own.
  const label = file.name || "pasted-image.png";
  state.name = label.replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9_-]+/g, "_") || "page";
  state.corners = [];
  state.boxes = [];
  state.selected = -1;
  message.textContent = "";
  message.className = "msg";

  $("done-photo-text").textContent = label + " — " +
    state.photo.width + " x " + state.photo.height + " pixels";

  hide("step-photo", "step-boxes", "done-boxes", "step-export", "done-corners");
  show("done-photo", "step-corners");
  drawCorners();
}

$("btn-change-photo").onclick = () => {
  hide("done-photo", "step-corners", "done-corners",
       "step-boxes", "done-boxes", "step-export");
  show("step-photo");
  // Clearing it means picking the same file again still counts as a change.
  $("file-input").value = "";
  $("upload-msg").textContent = "";
  state.photo = null;
  state.page = null;
  state.corners = [];
  state.boxes = [];
  state.selected = -1;
};

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

function startBoxes(canvas, note) {
  state.page = canvas;
  state.boxes = [];
  state.selected = -1;
  $("box-text").value = "";
  $("done-corners-text").textContent = note;

  hide("step-corners", "done-boxes", "step-export");
  show("done-corners", "step-boxes");
  refreshBoxes();
}

$("btn-straighten").onclick = () => {
  startBoxes(warp(state.photo, state.corners), "Page straightened.");
};

// A scan or a screenshot is already flat, and forcing four clicks onto one
// would only introduce error.
$("btn-skip").onclick = () => {
  const canvas = document.createElement("canvas");
  canvas.width = state.photo.width;
  canvas.height = state.photo.height;
  canvas.getContext("2d").drawImage(state.photo, 0, 0);
  startBoxes(canvas, "Used as-is, already flat.");
};

// Straightening again remaps the page, so boxes drawn on the old one would
// land in the wrong places. Say so before throwing them away.
$("btn-redo-corners").onclick = () => {
  if (state.boxes.length &&
      !confirm("Redoing the corners re-cuts the page, so the " +
               state.boxes.length + " boxes drawn on it are discarded. Go on?")) {
    return;
  }
  state.boxes = [];
  state.selected = -1;
  hide("done-corners", "step-boxes", "done-boxes", "step-export");
  show("step-corners");
  drawCorners();
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

/* Boxes are axis-aligned rectangles, so the four points are always a bounds
 * pair and back again. Working in bounds keeps moving and resizing simple. */
function boundsOf(box) {
  const xs = box.points.map((p) => p[0]);
  const ys = box.points.map((p) => p[1]);
  return {
    left: Math.min(...xs), right: Math.max(...xs),
    top: Math.min(...ys), bottom: Math.max(...ys),
  };
}

function setBounds(box, b) {
  box.points = rectToPoints(b.left, b.top, b.right, b.bottom);
}

// Corner handles, in the order rectToPoints lays them out.
function handlesOf(box) {
  const b = boundsOf(box);
  return [
    { x: b.left, y: b.top, corner: "tl" },
    { x: b.right, y: b.top, corner: "tr" },
    { x: b.right, y: b.bottom, corner: "br" },
    { x: b.left, y: b.bottom, corner: "bl" },
  ];
}

function handleAt(box, point) {
  const reach = HANDLE_RADIUS / state.scale + 3;
  return handlesOf(box).find(
    (h) => Math.abs(h.x - point.x) <= reach && Math.abs(h.y - point.y) <= reach,
  );
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
    const isSelected = index === state.selected;
    if (index === state.hovered && !isSelected) {
      boxCtx.fillStyle = "rgba(47, 111, 237, 0.12)";
      boxCtx.fill();
    }
    boxCtx.strokeStyle = colourFor(box, isSelected);
    boxCtx.lineWidth = isSelected || index === state.hovered ? 3 : 2;
    boxCtx.setLineDash(box.text ? [] : [5, 4]);
    boxCtx.stroke();
  });
  boxCtx.setLineDash([]);

  // Grab handles, on the selected box only, so the page stays readable.
  const selected = state.boxes[state.selected];
  if (selected) {
    handlesOf(selected).forEach((handle) => {
      boxCtx.beginPath();
      boxCtx.rect(handle.x * state.scale - HANDLE_RADIUS / 2,
                  handle.y * state.scale - HANDLE_RADIUS / 2,
                  HANDLE_RADIUS, HANDLE_RADIUS);
      boxCtx.fillStyle = "#fff";
      boxCtx.fill();
      boxCtx.strokeStyle = "#2f6fed";
      boxCtx.lineWidth = 2;
      boxCtx.stroke();
    });
  }

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
  const selected = state.boxes[state.selected];

  // A handle on the selected box wins over anything underneath it.
  const handle = selected && handleAt(selected, point);
  if (handle) {
    // Anchor on the corner diagonally opposite: dragging past it then just
    // turns the box inside out and back, rather than swapping handles.
    const b = boundsOf(selected);
    state.dragging = {
      mode: "resize",
      anchor: {
        x: handle.corner === "tl" || handle.corner === "bl" ? b.right : b.left,
        y: handle.corner === "tl" || handle.corner === "tr" ? b.bottom : b.top,
      },
    };
    boxCanvas.setPointerCapture(event.pointerId);
    return;
  }

  const hit = hitTest(point);
  if (hit >= 0) {
    selectBox(hit);
    state.dragging = { mode: "move", from: point, start: boundsOf(state.boxes[hit]) };
    boxCanvas.setPointerCapture(event.pointerId);
    $("box-text").focus();
    $("box-text").select();
    return;
  }

  state.drawing = { x0: point.x, y0: point.y, x1: point.x, y1: point.y };
  boxCanvas.setPointerCapture(event.pointerId);
});

boxCanvas.addEventListener("pointermove", (event) => {
  const point = toImage(boxCanvas, event);

  if (state.dragging) {
    const box = state.boxes[state.selected];
    if (!box) return;
    if (state.dragging.mode === "move") {
      const dx = point.x - state.dragging.from.x;
      const dy = point.y - state.dragging.from.y;
      const s = state.dragging.start;
      setBounds(box, {
        left: s.left + dx, right: s.right + dx,
        top: s.top + dy, bottom: s.bottom + dy,
      });
    } else {
      const a = state.dragging.anchor;
      box.points = rectToPoints(a.x, a.y, point.x, point.y);
    }
    drawBoxes();
    return;
  }

  if (state.drawing) {
    state.drawing.x1 = point.x;
    state.drawing.y1 = point.y;
    drawBoxes();
    return;
  }

  // Idle: say what the pointer is over before it is clicked.
  const selectedBox = state.boxes[state.selected];
  const overHandle = selectedBox && handleAt(selectedBox, point);
  const over = hitTest(point);
  boxCanvas.style.cursor = overHandle
    ? (overHandle.corner === "tl" || overHandle.corner === "br" ? "nwse-resize" : "nesw-resize")
    : over >= 0 ? "move" : "crosshair";

  if (over !== state.hovered) {
    state.hovered = over;
    drawBoxes();
  }
});

boxCanvas.addEventListener("pointerleave", () => {
  if (state.hovered !== -1) {
    state.hovered = -1;
    drawBoxes();
  }
});

boxCanvas.addEventListener("pointerup", () => {
  if (state.dragging) {
    // A drag that inverted the rectangle is put back the right way round.
    const box = state.boxes[state.selected];
    if (box) setBounds(box, boundsOf(box));
    state.dragging = null;
    refreshBoxes();
    return;
  }

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
    item.onclick = () => {
      selectBox(index);
      $("box-text").focus();
      $("box-text").select();
    };
    // Pointing at a row lights the box it names, so a long list stays findable.
    item.onmouseenter = () => {
      state.hovered = index;
      drawBoxes();
    };
    item.onmouseleave = () => {
      state.hovered = -1;
      drawBoxes();
    };
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

  if ((event.key === "Delete" || event.key === "Backspace") && !typing) {
    event.preventDefault();
    deleteSelected();
    return;
  }

  // Escape backs out of the selection rather than the whole step.
  if (event.key === "Escape") {
    saveSelectedText();
    state.selected = -1;
    $("box-text").value = "";
    $("box-text").blur();
    refreshBoxes();
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key === "z" && !typing) {
    event.preventDefault();
    undoBox();
  }
});

/* Undo drops the most recent box. Drawing one is the only action here that
 * is easy to do by accident -- a stray drag across the page. */
function undoBox() {
  if (!state.boxes.length) return;
  state.boxes.pop();
  state.selected = -1;
  $("box-text").value = "";
  refreshBoxes();
}

function deleteSelected() {
  if (state.selected < 0) return;
  state.boxes.splice(state.selected, 1);
  state.selected = -1;
  $("box-text").value = "";
  refreshBoxes();
}

/* ------------------------------------------------------------- step 4 */

$("btn-done-boxes").onclick = () => {
  saveSelectedText();
  state.selected = -1;
  $("box-text").value = "";
  refreshBoxes();

  const blank = state.boxes.filter((b) => !b.text).length;
  $("done-boxes-text").textContent = state.boxes.length + " boxes labelled.";
  $("export-summary").textContent = blank
    ? state.boxes.length + " boxes, " + blank +
      " of them left unlabelled and exported as ###."
    : "All " + state.boxes.length + " boxes carry a label.";
  $("save-msg").textContent = "";
  $("save-msg").className = "msg";

  hide("step-boxes");
  show("done-boxes", "step-export");
};

$("btn-back-to-boxes").onclick = () => {
  hide("done-boxes", "step-export");
  show("step-boxes");
  refreshBoxes();
};

/* --------------------------------------------------------- the download */

$("btn-delete-box").onclick = deleteSelected;

$("btn-clear-boxes").onclick = () => {
  state.boxes = [];
  state.selected = -1;
  $("box-text").value = "";
  refreshBoxes();
};

function download(filename, body, type = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([body], { type }));
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
    message.textContent = "Draw at least one box first.";
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

/* ------------------------------------------------ crops for a recogniser */

function toPng(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error("The browser could not encode a crop."));
      else resolve(blob.arrayBuffer());
    }, "image/png");
  });
}

/* One PNG per labelled box, cut from the straightened page at full
 * resolution -- the display scale never enters into it. */
async function cropsOf(boxes) {
  const cutter = document.createElement("canvas");
  const ctx = cutter.getContext("2d");

  const files = [];
  const lines = [];

  for (let i = 0; i < boxes.length; i += 1) {
    const b = boundsOf(boxes[i]);
    const left = Math.max(0, Math.round(b.left));
    const top = Math.max(0, Math.round(b.top));
    const width = Math.min(state.page.width - left, Math.round(b.right - b.left));
    const height = Math.min(state.page.height - top, Math.round(b.bottom - b.top));
    if (width < 1 || height < 1) continue;

    cutter.width = width;
    cutter.height = height;
    ctx.drawImage(state.page, left, top, width, height, 0, 0, width, height);

    const name = "crops/" + String(files.length + 1).padStart(4, "0") + ".png";
    files.push({ name, data: new Uint8Array(await toPng(cutter)) });
    // Tab-separated, the separator every recognition trainer splits on. A tab
    // or newline inside a label would break the line, so they become spaces.
    lines.push(name + "\t" + boxes[i].text.replace(/[\t\r\n]+/g, " "));
  }

  files.push({ name: "labels.txt", data: new TextEncoder().encode(lines.join("\n") + "\n") });
  return files;
}

$("btn-download-crops").onclick = async () => {
  saveSelectedText();
  const message = $("save-msg");
  const button = $("btn-download-crops");

  const labelled = state.boxes.filter((b) => b.text);
  if (!labelled.length) {
    message.textContent = "No labelled boxes yet — a recogniser needs the text.";
    message.className = "msg bad";
    return;
  }

  button.disabled = true;
  message.textContent = "Cutting " + labelled.length + " crops...";
  message.className = "msg";

  try {
    const files = await cropsOf(labelled);
    download(state.name + "_crops.zip", zip(files), "application/zip");
    message.textContent = "Downloaded " + labelled.length +
                          " crops and labels.txt as " + state.name + "_crops.zip";
    message.className = "msg ok";
  } catch (error) {
    message.textContent = error.message;
    message.className = "msg bad";
  } finally {
    button.disabled = false;
  }
};
