$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$QwenDir = Join-Path $Root 'vendor\FreeQwenApi'
if (-not (Test-Path (Join-Path $QwenDir 'package.json'))) {
    Write-Host 'Run setup.bat first.' -ForegroundColor Red
    exit 1
}
Push-Location $QwenDir
try { & npm run auth } finally { Pop-Location }
