# Annotator

Mark up the text in receipts, forms and documents.

### **[Open the app →](https://k-byzid.github.io/Annotator-Tool/)**

Nothing to install. Choose a photo, click the four corners to flatten the
page, and OCR fills in a first draft of every piece of text it finds. Correct
what it got wrong, add what it missed, then download the labels.

Your images never leave your device — the OCR runs inside your browser.

![Correcting the boxes OCR found](docs/images/step-boxes.png)

## What you get

Two files per page, downloaded to your computer:

- **`<name>.json`** — every box, its text, and whether you confirmed it.
- **`gt_<name>.txt`** — [ICDAR-2015](https://rrc.cvc.uab.es/?ch=4&com=tasks),
  which text-detector trainers read. Text you have not confirmed is written as
  `###`, the standard don't-care marker, so a model is never trained on an
  unchecked guess.

## Development

```bash
node --test tests/warp.test.mjs tests/pixels.test.mjs
```

Open `index.html` through any static server to run it locally.

## Licence

MIT — see [LICENSE](LICENSE).
