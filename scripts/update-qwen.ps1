$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$QwenDir = Join-Path $Root 'vendor\FreeQwenApi'
$BackupDir = Join-Path $Root ('vendor\FreeQwenApi-backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
if (-not (Test-Path (Join-Path $QwenDir 'package.json'))) {
    Write-Host 'FreeQwenApi не установлен. Запустите setup.bat.' -ForegroundColor Red
    exit 1
}
Write-Host 'Сохраняю session и .env, затем скачиваю свежую версию FreeQwenApi...' -ForegroundColor Cyan
$SessionTemp = Join-Path $env:TEMP ('qwen-session-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $SessionTemp | Out-Null
if (Test-Path (Join-Path $QwenDir 'session')) { Copy-Item (Join-Path $QwenDir 'session') $SessionTemp -Recurse -Force }
if (Test-Path (Join-Path $QwenDir '.env')) { Copy-Item (Join-Path $QwenDir '.env') (Join-Path $SessionTemp '.env') -Force }
Move-Item $QwenDir $BackupDir
try {
    $ZipPath = Join-Path $env:TEMP 'FreeQwenApi-main.zip'
    $ExtractDir = Join-Path $env:TEMP ('FreeQwenApi-' + [guid]::NewGuid().ToString('N'))
    Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/ForgetMeAI/FreeQwenApi/archive/refs/heads/main.zip' -OutFile $ZipPath
    Expand-Archive -Path $ZipPath -DestinationPath $ExtractDir -Force
    $Extracted = Get-ChildItem $ExtractDir -Directory | Select-Object -First 1
    Move-Item $Extracted.FullName $QwenDir
    if (Test-Path (Join-Path $SessionTemp 'session')) { Copy-Item (Join-Path $SessionTemp 'session') (Join-Path $QwenDir 'session') -Recurse -Force }
    if (Test-Path (Join-Path $SessionTemp '.env')) { Copy-Item (Join-Path $SessionTemp '.env') (Join-Path $QwenDir '.env') -Force }
    Push-Location $QwenDir
    try { & npm install --no-audit --no-fund } finally { Pop-Location }
    Remove-Item $ExtractDir -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item $ZipPath -Force -ErrorAction SilentlyContinue
    Write-Host "Обновлено. Резервная копия: $BackupDir" -ForegroundColor Green
} catch {
    Write-Host "Ошибка обновления: $($_.Exception.Message)" -ForegroundColor Red
    if (Test-Path $QwenDir) { Remove-Item $QwenDir -Recurse -Force }
    Move-Item $BackupDir $QwenDir
    Write-Host 'Старая версия восстановлена.' -ForegroundColor Yellow
    exit 1
} finally {
    Remove-Item $SessionTemp -Recurse -Force -ErrorAction SilentlyContinue
}
