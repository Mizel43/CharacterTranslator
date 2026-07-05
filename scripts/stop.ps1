$ErrorActionPreference = 'Continue'
$Root = Split-Path -Parent $PSScriptRoot
$PidPath = Join-Path $Root 'data\processes.json'
if (-not (Test-Path $PidPath)) {
    Write-Host 'No saved processes were found.'
    exit 0
}

$Processes = Get-Content $PidPath -Raw | ConvertFrom-Json
foreach ($Name in @('cloudflared', 'gateway', 'qwen')) {
    $PidValue = $Processes.$Name
    if ($PidValue) {
        Write-Host "Stopping $Name (PID $PidValue)..."
        & taskkill.exe /PID $PidValue /T /F 2>$null | Out-Null
    }
}

Remove-Item $PidPath -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $Root 'data\current-tunnel.json') -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $Root 'data\connect-phone.html') -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $Root 'data\connect-qr.png') -Force -ErrorAction SilentlyContinue
Write-Host 'Translator stopped.' -ForegroundColor Green
