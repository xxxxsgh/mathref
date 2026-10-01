@echo off
rem Optional: serve VECTRA ARENA over http://localhost:8000 (normally you can just open index.html).
cd /d "%~dp0"
python -m http.server 8000
