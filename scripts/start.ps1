$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$QwenDir = Join-Path $Root 'vendor\FreeQwenApi'
$GatewayDir = Join-Path $Root 'gateway'
$Cloudflared = Join-Path $Root 'tools\cloudflared.exe'
$DataDir = Join-Path $Root 'data'
$LogsDir = Join-Path $Root 'logs'
$ConfigPath = Join-Path $Root 'translator.config.json'
$ConfigExamplePath = Join-Path $Root 'translator.config.example.json'
$PidPath = Join-Path $DataDir 'processes.json'
$TunnelStatePath = Join-Path $DataDir 'current-tunnel.json'

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

function New-PairingCode {
    $Bytes = New-Object byte[] 24
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($Bytes)
    return [Convert]::ToBase64String($Bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
}

if (-not (Test-Path (Join-Path $QwenDir 'package.json')) -or -not (Test-Path $Cloudflared)) {
    Write-Host 'Setup is incomplete. Run setup.bat first.' -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $ConfigPath)) {
    if (-not (Test-Path $ConfigExamplePath)) {
        Write-Host 'translator.config.example.json is missing. Check the repository.' -ForegroundColor Red
        exit 1
    }
    Copy-Item $ConfigExamplePath $ConfigPath -Force
}

New-Item -ItemType Directory -Force -Path $DataDir, $LogsDir | Out-Null
if (Test-Path $PidPath) {
    Write-Host 'Found a previous run - stopping it first.' -ForegroundColor Yellow
    & (Join-Path $PSScriptRoot 'stop.ps1')
}

$Config = Get-Content $ConfigPath -Raw | ConvertFrom-Json
$GatewayPort = [int]$Config.gatewayPort
$QwenLog = Join-Path $LogsDir 'qwen.log'
$GatewayLog = Join-Path $LogsDir 'gateway.log'
$TunnelLog = Join-Path $LogsDir 'cloudflared.log'
Remove-Item $QwenLog, $GatewayLog, $TunnelLog -Force -ErrorAction SilentlyContinue

Write-Host 'Starting FreeQwenApi...' -ForegroundColor Cyan
$QwenCommand = "`$env:NON_INTERACTIVE='1'; `$env:SKIP_ACCOUNT_MENU='1'; `$env:HOST='127.0.0.1'; `$env:PORT='3264'; npm start"
$Qwen = Start-LoggedProcess 'FreeQwenApi' $QwenDir $QwenCommand $QwenLog
if (-not (Wait-Http 'http://127.0.0.1:3264/api/health' 75)) {
    Write-Host 'FreeQwenApi did not start. Check logs\qwen.log and Qwen authorization.' -ForegroundColor Red
    & taskkill.exe /PID $Qwen.Id /T /F 2>$null | Out-Null
    exit 1
}

$PairingCode = New-PairingCode

Write-Host 'Starting Translator Gateway...' -ForegroundColor Cyan
$GatewayCommand = "`$env:TRANSLATOR_PAIRING_CODE='$PairingCode'; node server.js"
$Gateway = Start-LoggedProcess 'Gateway' $GatewayDir $GatewayCommand $GatewayLog
if (-not (Wait-Http "http://127.0.0.1:$GatewayPort/public/ping" 20)) {
    Write-Host 'Gateway did not start. Check logs\gateway.log.' -ForegroundColor Red
    & taskkill.exe /PID $Gateway.Id /T /F 2>$null | Out-Null
    & taskkill.exe /PID $Qwen.Id /T /F 2>$null | Out-Null
    exit 1
}

Write-Host 'Creating a temporary Cloudflare Quick Tunnel...' -ForegroundColor Cyan
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
    Write-Host 'Failed to obtain the Quick Tunnel URL. Check logs\cloudflared.log.' -ForegroundColor Red
    & taskkill.exe /PID $Gateway.Id /T /F 2>$null | Out-Null
    & taskkill.exe /PID $Qwen.Id /T /F 2>$null | Out-Null
    if (-not $Tunnel.HasExited) { & taskkill.exe /PID $Tunnel.Id /T /F 2>$null | Out-Null }
    exit 1
}

@{ qwen = $Qwen.Id; gateway = $Gateway.Id; cloudflared = $Tunnel.Id } | ConvertTo-Json | Set-Content $PidPath -Encoding UTF8
@{ url = $TunnelUrl; startedAt = (Get-Date).ToString('o') } | ConvertTo-Json | Set-Content $TunnelStatePath -Encoding UTF8

$EncodedCode = [Uri]::EscapeDataString($PairingCode)
$ConnectUrl = "$TunnelUrl/connect#code=$EncodedCode"
Set-Clipboard -Value $ConnectUrl
& node (Join-Path $GatewayDir 'generate-connect.mjs') $ConnectUrl | Out-Null
$ConnectPage = Join-Path $DataDir 'connect-phone.html'
Start-Process $ConnectPage

Write-Host "`nThe local QR page is open and the pairing link has been copied to the clipboard." -ForegroundColor Green
Write-Host 'GitHub Pages is no longer part of the live translator launch flow.' -ForegroundColor Green
Write-Host 'After a restart, use a fresh QR code or a fresh /connect#code=... link.' -ForegroundColor Yellow
Write-Host "`nYou can close this window. The processes keep running until stop_translator.bat is used."
