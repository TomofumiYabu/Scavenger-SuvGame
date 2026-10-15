"""Serve a fresh production build at a subpath, without SPA rewrite fallbacks."""

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from shutil import copytree
from tempfile import TemporaryDirectory


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


Path('.cache').mkdir(exist_ok=True)
with TemporaryDirectory(prefix='static-test-', dir='.cache') as directory:
    copytree('dist', Path(directory) / 'Scavenger-SuvGame')
    handler = partial(QuietHandler, directory=directory)
    with ThreadingHTTPServer(('127.0.0.1', 4174), handler) as server:
        server.serve_forever()
