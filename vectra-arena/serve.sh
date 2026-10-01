#!/bin/sh
# Optional: serve VECTRA ARENA over http://localhost:8000 (normally you can just open index.html).
cd "$(dirname "$0")" && python3 -m http.server 8000
