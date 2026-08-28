"""Command line entry point:  python -m annotator"""
import argparse
import socket

from . import config
from .app import create_app


def local_address():
    """This machine's address on the local network, for the --host banner."""
    try:
        probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        probe.connect(("192.0.2.1", 1))     # nothing is sent; this picks a route
        address = probe.getsockname()[0]
        probe.close()
        return address
    except OSError:
        return "your-ip"


def main():
    parser = argparse.ArgumentParser(prog="annotator", description=__doc__)
    parser.add_argument("--port", type=int, default=5000)
    parser.add_argument("--lang", nargs="+", metavar="CODE",
                        help="EasyOCR language codes (default: en)")
    parser.add_argument("--network", action="store_true",
                        help="serve to other devices on your network, so you "
                             "can annotate from a phone or tablet")
    args = parser.parse_args()

    if args.lang:
        config.LANGUAGES = args.lang

    app = create_app()

    if args.network:
        print(f"\n  Annotator")
        print(f"    this machine  http://127.0.0.1:{args.port}")
        print(f"    other devices http://{local_address()}:{args.port}")
        print("\n  Anyone on the network can read and change your annotations.\n")
        # The debugger executes whatever is typed into its browser console, so
        # it must stay off whenever the app is reachable from the network.
        app.run(host="0.0.0.0", port=args.port, debug=False)
    else:
        print(f"\n  Annotator running at http://127.0.0.1:{args.port}\n")
        app.run(port=args.port, debug=True)


if __name__ == "__main__":
    main()
