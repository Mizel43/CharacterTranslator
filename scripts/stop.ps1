$ErrorActionPreference = 'Continue'
$Root = Split-Path -Parent $PSScriptRoot
$PidPath = Join-Path $Root 'data\processes.json'
if (-not (Test-Path $PidPath)) {
    Write-Host 'Сохранённых процессов нет.'
    exit 0
}
$Processes = Get-Content $PidPath -Raw | ConvertFrom-Json
foreach ($Name in @('cloudflared', 'gateway', 'qwen')) {
    $PidValue = $Processes.$Name
    if ($PidValue) {
        Write-Host "Останавливаю $Name (PID $PidValue)..."
        & taskkill.exe /PID $PidValue /T /F 2>$null | Out-Null
    }
}
Remove-Item $PidPath -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $Root 'data\current-tunnel.json') -Force -ErrorAction SilentlyContinue
Write-Host 'Переводчик остановлен.' -ForegroundColor Green
