@echo off
chcp 65001 >nul
set "ROOT=%~dp0"
cd /d "%ROOT%docs"
start "" http://127.0.0.1:4173
python -m http.server 4173 --bind 127.0.0.1
