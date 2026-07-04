$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$QwenDir = Join-Path $Root 'vendor\FreeQwenApi'
$GatewayDir = Join-Path $Root 'gateway'
$Cloudflared = Join-Path $Root 'tools\cloudflared.exe'
$DataDir = Join-Path $Root 'data'
$LogsDir = Join-Path $Root 'logs'
$ConfigPath = Join-Path $Root 'translator.config.json'
$TokenPath = Join-Path $DataDir 'access-token.txt'
$PidPath = Join-Path $DataDir 'processes.json'

function Wait-Http([string]$Url, [int]$Seconds) {
    $Deadline = (Get-Date).AddSeconds($Seconds)
    do {
        try {
            $Response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 4
            if ($Response.StatusCode -ge 200 -and $Response.StatusCode -lt 500) { return $true }
        } catch {}
        Start-Sleep -Seconds 1
    } while ((Get-Date) -lt $Deadline)
    return $false
}

function Start-LoggedProcess([string]$Name, [string]$WorkingDir, [string]$Command, [string]$LogFile) {
    $EscapedDir = $WorkingDir.Replace("'", "''")
    $EscapedLog = $LogFile.Replace("'", "''")
    $Script = "Set-Location '$EscapedDir'; $Command *>> '$EscapedLog'"
    $Process = Start-Process powershell.exe -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-Command',$Script) -WindowStyle Hidden -PassThru
    Write-Host "$Name запущен (PID $($Process.Id))."
    return $Process
}

if (-not (Test-Path (Join-Path $QwenDir 'package.json')) -or -not (Test-Path $Cloudflared) -or -not (Test-Path $TokenPath)) {
    Write-Host 'Не завершена установка. Сначала запустите setup.bat.' -ForegroundColor Red
    exit 1
}

New-Item -ItemType Directory -Force -Path $DataDir, $LogsDir | Out-Null
if (Test-Path $PidPath) {
    Write-Host 'Найден прошлый запуск — сначала останавливаю его.' -ForegroundColor Yellow
    & (Join-Path $PSScriptRoot 'stop.ps1')
}

$Config = Get-Content $ConfigPath -Raw | ConvertFrom-Json
$GatewayPort = [int]$Config.gatewayPort
$QwenLog = Join-Path $LogsDir 'qwen.log'
$GatewayLog = Join-Path $LogsDir 'gateway.log'
$TunnelLog = Join-Path $LogsDir 'cloudflared.log'
Remove-Item $QwenLog, $GatewayLog, $TunnelLog -Force -ErrorAction SilentlyContinue

Write-Host 'Запускаю FreeQwenApi...' -ForegroundColor Cyan
$QwenCommand = "`$env:NON_INTERACTIVE='1'; `$env:SKIP_ACCOUNT_MENU='1'; `$env:HOST='127.0.0.1'; `$env:PORT='3264'; npm start"
$Qwen = Start-LoggedProcess 'FreeQwenApi' $QwenDir $QwenCommand $QwenLog
if (-not (Wait-Http 'http://127.0.0.1:3264/api/health' 75)) {
    Write-Host 'FreeQwenApi не запустился. Проверьте logs\qwen.log и авторизацию.' -ForegroundColor Red
    & taskkill.exe /PID $Qwen.Id /T /F 2>$null | Out-Null
    exit 1
}

Write-Host 'Запускаю Translator Gateway...' -ForegroundColor Cyan
$Gateway = Start-LoggedProcess 'Gateway' $GatewayDir 'node server.js' $GatewayLog
if (-not (Wait-Http "http://127.0.0.1:$GatewayPort/public/ping" 20)) {
    Write-Host 'Gateway не запустился. Проверьте logs\gateway.log.' -ForegroundColor Red
    & taskkill.exe /PID $Gateway.Id /T /F 2>$null | Out-Null
    & taskkill.exe /PID $Qwen.Id /T /F 2>$null | Out-Null
    exit 1
}

Write-Host 'Создаю временный Cloudflare Quick Tunnel...' -ForegroundColor Cyan
$Tunnel = Start-Process $Cloudflared -ArgumentList @('--no-autoupdate','--loglevel','info','--logfile',$TunnelLog,'tunnel','--url',"http://127.0.0.1:$GatewayPort") -WindowStyle Hidden -PassThru
$Deadline = (Get-Date).AddSeconds(45)
$TunnelUrl = $null
do {
    Start-Sleep -Milliseconds 700
    if (Test-Path $TunnelLog) {
        $Match = Select-String -Path $TunnelLog -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -AllMatches | Select-Object -Last 1
        if ($Match) { $TunnelUrl = $Match.Matches[0].Value }
    }
} while (-not $TunnelUrl -and (Get-Date) -lt $Deadline -and -not $Tunnel.HasExited)

if (-not $TunnelUrl) {
    Write-Host 'Не удалось получить адрес Quick Tunnel. Проверьте logs\cloudflared.log.' -ForegroundColor Red
    & taskkill.exe /PID $Gateway.Id /T /F 2>$null | Out-Null
    & taskkill.exe /PID $Qwen.Id /T /F 2>$null | Out-Null
    if (-not $Tunnel.HasExited) { & taskkill.exe /PID $Tunnel.Id /T /F 2>$null | Out-Null }
    exit 1
}

@{ qwen = $Qwen.Id; gateway = $Gateway.Id; cloudflared = $Tunnel.Id } | ConvertTo-Json | Set-Content $PidPath -Encoding UTF8
$Token = (Get-Content $TokenPath -Raw).Trim()
$FrontendUrl = [string]$Config.frontendUrl
$HasFrontend = $FrontendUrl -and $FrontendUrl -notmatch 'YOUR_GITHUB_NAME'

@{ url = $TunnelUrl; startedAt = (Get-Date).ToString('o') } | ConvertTo-Json | Set-Content (Join-Path $DataDir 'current-tunnel.json') -Encoding UTF8

Write-Host "`nGateway доступен: $TunnelUrl" -ForegroundColor Green
if ($HasFrontend) {
    $EncodedGateway = [Uri]::EscapeDataString($TunnelUrl)
    $EncodedToken = [Uri]::EscapeDataString($Token)
    $ConnectUrl = "$FrontendUrl#gateway=$EncodedGateway&token=$EncodedToken"
    Set-Clipboard -Value $ConnectUrl
    & node (Join-Path $GatewayDir 'generate-connect.mjs') $ConnectUrl | Out-Null
    $ConnectPage = Join-Path $DataDir 'connect-phone.html'
    Start-Process $ConnectPage
    Write-Host 'Открыта страница с QR-кодом. Ссылка также скопирована в буфер обмена.' -ForegroundColor Green
} else {
    Write-Host 'В translator.config.json пока не указан настоящий frontendUrl.' -ForegroundColor Yellow
    Write-Host 'Откройте сайт, зайдите в настройки и вставьте:'
    Write-Host "Gateway URL: $TunnelUrl"
    Write-Host "Access token: $Token"
}
Write-Host "`nОкно можно закрыть — процессы продолжат работать. Для остановки используйте stop_translator.bat."
