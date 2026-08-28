"""The web app: upload a page, straighten it, annotate the text on it."""
import cv2
from flask import Flask, jsonify, request, send_from_directory

from . import config, ocr, storage
from .geometry import warp


def create_app():
    """Build the Flask app. Keeping this a function makes it testable."""
    config.make_dirs()
    app = Flask(__name__, static_folder="static", static_url_path="/static")

    @app.get("/")
    def home():
        return send_from_directory(app.static_folder, "index.html")

    @app.get("/uploads/<path:filename>")
    def uploaded(filename):
        return send_from_directory(config.UPLOAD_DIR, filename)

    @app.get("/images/<path:filename>")
    def straightened(filename):
        return send_from_directory(config.IMAGE_DIR, filename)

    @app.post("/api/upload")
    def upload():
        """Save a photo sent from the browser."""
        if "file" not in request.files:
            return jsonify(error="No file was sent."), 400

        sent = request.files["file"]
        if not sent.filename.lower().endswith(tuple(config.ALLOWED_SUFFIXES)):
            allowed = ", ".join(sorted(config.ALLOWED_SUFFIXES))
            return jsonify(error=f"Only {allowed} files."), 400

        path = storage.unique_upload_path(sent.filename)
        sent.save(path)

        image = cv2.imread(str(path))
        if image is None:
            path.unlink(missing_ok=True)
            return jsonify(error="That file could not be read as an image."), 400

        return jsonify(name=path.stem, url=f"/uploads/{path.name}",
                       width=image.shape[1], height=image.shape[0])

    @app.post("/api/straighten")
    def straighten():
        """Flatten the four clicked corners into an upright page."""
        data = request.get_json(silent=True) or {}
        corners = data.get("corners", [])
        if len(corners) != 4:
            return jsonify(error="Exactly 4 corners are needed."), 400

        name = storage.safe_name(data.get("name", ""))
        source = next((p for p in config.UPLOAD_DIR.glob(f"{name}.*")), None)
        if source is None:
            return jsonify(error="That upload is missing."), 404

        image = cv2.imread(str(source))
        if image is None:
            return jsonify(error="That upload could not be read."), 400

        flat = warp(image, corners)
        cv2.imwrite(str(config.IMAGE_DIR / f"{name}.png"), flat)

        return jsonify(name=name, url=f"/images/{name}.png",
                       width=flat.shape[1], height=flat.shape[0])

    @app.post("/api/read")
    def read():
        """Run OCR over a straightened page and return its draft."""
        data = request.get_json(silent=True) or {}
        name = storage.safe_name(data.get("name", ""))
        image_path = config.IMAGE_DIR / f"{name}.png"
        if not image_path.exists():
            return jsonify(error="Straighten the page before running OCR."), 400

        try:
            boxes = ocr.read(image_path)
        except Exception as error:              # noqa: BLE001
            # Usually a missing EasyOCR install. Say so plainly rather than
            # returning a 500 the browser cannot explain.
            return jsonify(error=f"OCR could not run: {error}"), 500

        return jsonify(boxes=boxes, count=len(boxes))

    @app.post("/api/save")
    def save():
        """Store the annotations for one page."""
        data = request.get_json(silent=True) or {}
        name = storage.safe_name(data.get("name", ""))
        if not (config.IMAGE_DIR / f"{name}.png").exists():
            return jsonify(error="Straighten the page before saving."), 400

        saved = storage.save(name, data.get("boxes", []),
                             int(data.get("width", 0)),
                             int(data.get("height", 0)))
        if not saved:
            return jsonify(error="No usable boxes to save."), 400

        return jsonify(saved=saved, labels=f"labels/{name}.json",
                       export=f"export/gt_{name}.txt")

    @app.get("/api/page/<name>")
    def page(name):
        """Load a page's saved annotations, so it can be edited again."""
        return jsonify(storage.load(name) or {"boxes": []})

    @app.get("/api/pages")
    def pages():
        """What has been annotated so far."""
        done = storage.summary()
        return jsonify(pages=done, total_boxes=sum(p["boxes"] for p in done))

    return app
