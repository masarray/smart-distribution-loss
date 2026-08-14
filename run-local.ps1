$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
Write-Host "Smart Distribution Loss P0-A" -ForegroundColor Cyan
Write-Host "Open http://localhost:8000 after the server starts." -ForegroundColor Green
python -m http.server 8000 --directory web
