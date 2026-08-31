# Annotator

Mark up the text in receipts, forms and documents.

### **[Open the app →](https://k-byzid.github.io/Annotator-Tool/)**

Nothing to install. Choose a photo, click the four corners to flatten the
page, then drag a box round every piece of text and type what it says.
Nothing is guessed for you: every box and every label is your own.

Your images never leave your device.

![Boxing and labelling the text on a page](docs/images/step-boxes.png)

## What you get

Two exports, for the two halves of an OCR stack.

**Whole page, for a detector** — downloaded as a pair:

- **`<name>.json`** — every box, its text and its kind.
- **`gt_<name>.txt`** — [ICDAR-2015](https://rrc.cvc.uab.es/?ch=4&com=tasks),
  which text-detector trainers read. A box you left unlabelled is written as
  `###`, the standard don't-care marker: the detector still learns the box,
  while no recogniser is trained on a blank.

**Cropped lines, for a recogniser** — `<name>_crops.zip`, holding one PNG per
labelled box under `crops/` and a tab-separated `labels.txt` beside them, the
layout PaddleOCR, MMOCR and TrOCR read. Crops are cut from the straightened
page at full resolution. Unlabelled boxes are left out — a recogniser has
nothing to learn from a blank.

## Keyboard

| Key | Does |
| --- | --- |
| <kbd>Enter</kbd> | Finish the box and go back to the page |
| <kbd>Esc</kbd> | Deselect |
| <kbd>Delete</kbd> | Remove the selected box |
| <kbd>Ctrl</kbd>+<kbd>Z</kbd> | Take back the last box drawn |
| <kbd>Ctrl</kbd>+<kbd>V</kbd> | Paste a screenshot to annotate |

## Development

```bash
node --test tests/*.mjs
```

Open `index.html` through any static server to run it locally.

## Licence

MIT — see [LICENSE](LICENSE).
