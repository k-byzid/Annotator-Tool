# Annotator

Mark up the text in receipts, forms and documents.

### **[Open the app →](https://k-byzid.github.io/Annotator-Tool/)**

Nothing to install. Choose a photo, click the four corners to flatten the
page, then drag a box round every piece of text and type what it says.
Nothing is guessed for you: every box and every label is your own.

Your images never leave your device.

![Boxing and labelling the text on a page](docs/images/step-boxes.png)

## What you get

Two files per page, downloaded to your computer:

- **`<name>.json`** — every box, its text, and whether you confirmed it.
- **`gt_<name>.txt`** — [ICDAR-2015](https://rrc.cvc.uab.es/?ch=4&com=tasks),
  which text-detector trainers read. A box you left unlabelled is written as
  `###`, the standard don't-care marker: the detector still learns the box,
  while no recogniser is trained on a blank.

## Development

```bash
node --test tests/warp.test.mjs tests/pixels.test.mjs
```

Open `index.html` through any static server to run it locally.

## Licence

MIT — see [LICENSE](LICENSE).
