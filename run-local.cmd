@echo off
setlocal
cd /d "%~dp0"
echo Smart Distribution Loss P0-A
echo.
echo Open http://localhost:8000 after the server starts.
echo Press Ctrl+C to stop.
echo.
py -m http.server 8000 --directory web 2>nul || python -m http.server 8000 --directory web
