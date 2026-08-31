# Annotator

Build OCR ground truth from a photo, in the browser. Box the text, type what
it says, export it in the formats detection and recognition models train on.

**[Open the app →](https://k-byzid.github.io/Annotator-Tool/)**

Nothing to install, no account, no upload. Your images never leave the device.

## How it works

1. **Choose your photos.** Drop in one or a hundred, paste a screenshot, or
   pick files. More can be added at any point without losing work.
2. **Click the four corners** of the page to flatten it. Skip this for a
   scan or screenshot that is already flat.
3. **Box the text and label it.** Drag across a line, type what it says,
   press <kbd>Enter</kbd>. Boxes move and resize after the fact.
4. **Export** — every page at once.

Steps 2 and 3 run per page. Finishing one opens the next, and a rail across
the top tracks how far through the batch you are, jumps to any page, and
exports whenever you decide you are done.

Every box and every label is yours. Nothing is pre-filled, so nothing has to
be second-guessed.

## Exports

**Whole page — for a detector**

| File | Contents |
| --- | --- |
| `<name>.json` | Every box, its text, and its kind. |
| `gt_<name>.txt` | [ICDAR-2015](https://rrc.cvc.uab.es/?ch=4&com=tasks): eight coordinates then the text, one box per line. |

A batch arrives as a single `page_labels.zip` holding that pair per page.

**Cropped lines — for a recogniser**

`<name>_crops.zip`, holding one PNG per labelled box under `crops/` and a
tab-separated `labels.txt` beside them — the layout PaddleOCR, MMOCR and
TrOCR read. Crops are cut from the straightened page at full resolution.
A batch becomes `crops.zip`, one folder per page under `crops/`, sharing a
single `labels.txt`.

A box you leave unlabelled exports as `###`, the standard don't-care marker.
It teaches a detector where text sits without teaching a recogniser a blank,
which is also why unlabelled boxes are left out of the crops.

## Keyboard

| Key | Does |
| --- | --- |
| <kbd>Enter</kbd> | Finish the box and return to the page |
| <kbd>Esc</kbd> | Deselect |
| <kbd>Delete</kbd> | Remove the selected box |
| <kbd>Ctrl</kbd>+<kbd>Z</kbd> | Take back the last box drawn |
| <kbd>Ctrl</kbd>+<kbd>V</kbd> | Paste a screenshot to annotate |

## Development

No build step and no dependencies — the perspective warp and the zip writer
are both in `assets/`.

```bash
node --test tests/*.mjs     # geometry, pixels, zip
```

Serve the directory over HTTP to run it locally; opening `index.html` from
the filesystem will not work, as ES modules need a real origin.

## Licence

MIT — see [LICENSE](LICENSE).
