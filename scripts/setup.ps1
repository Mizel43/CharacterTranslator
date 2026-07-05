$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$VendorDir = Join-Path $Root 'vendor'
$QwenDir = Join-Path $VendorDir 'FreeQwenApi'
$ToolsDir = Join-Path $Root 'tools'
$DataDir = Join-Path $Root 'data'
$LogsDir = Join-Path $Root 'logs'
$GatewayDir = Join-Path $Root 'gateway'
$ConfigPath = Join-Path $Root 'translator.config.json'
$ConfigExamplePath = Join-Path $Root 'translator.config.example.json'

function Write-Step([string]$Text) {
    Write-Host "`n==> $Text" -ForegroundColor Cyan
}

function Require-Command([string]$Name, [string]$HelpUrl) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        Write-Host "Missing command: $Name" -ForegroundColor Red
        Write-Host "Install it and rerun setup.bat: $HelpUrl"
        Start-Process $HelpUrl
        exit 1
    }
}

Write-Host 'Qwen Character Translator - initial setup' -ForegroundColor Green
Require-Command 'node' 'https://nodejs.org/en/download'
Require-Command 'npm' 'https://nodejs.org/en/download'

$NodeVersion = (& node -p "process.versions.node").Trim()
$NodeMajor = [int]($NodeVersion.Split('.')[0])
if ($NodeMajor -lt 20) {
    Write-Host "Node.js 20 or newer is required. Current: $NodeVersion" -ForegroundColor Red
    Start-Process 'https://nodejs.org/en/download'
    exit 1
}
Write-Host "Node.js: $NodeVersion"

New-Item -ItemType Directory -Force -Path $VendorDir, $ToolsDir, $DataDir, $LogsDir | Out-Null

if (-not (Test-Path $ConfigPath)) {
    if (-not (Test-Path $ConfigExamplePath)) {
        throw 'translator.config.example.json is missing.'
    }
    Write-Step 'Creating local translator.config.json from example'
    Copy-Item $ConfigExamplePath $ConfigPath -Force
}

Write-Step 'Installing local Gateway dependencies'
Push-Location $GatewayDir
try { & npm install --no-audit --no-fund } finally { Pop-Location }

if (-not (Test-Path (Join-Path $QwenDir 'package.json'))) {
    Write-Step 'Downloading FreeQwenApi'
    $ZipPath = Join-Path $env:TEMP 'FreeQwenApi-main.zip'
    $ExtractDir = Join-Path $env:TEMP ('FreeQwenApi-' + [guid]::NewGuid().ToString('N'))
    Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/ForgetMeAI/FreeQwenApi/archive/refs/heads/main.zip' -OutFile $ZipPath
    Expand-Archive -Path $ZipPath -DestinationPath $ExtractDir -Force
    $Extracted = Get-ChildItem $ExtractDir -Directory | Select-Object -First 1
    if (-not $Extracted) { throw 'Failed to extract FreeQwenApi.' }
    if (Test-Path $QwenDir) { Remove-Item $QwenDir -Recurse -Force }
    Move-Item $Extracted.FullName $QwenDir
    Remove-Item $ExtractDir -Recurse -Force
    Remove-Item $ZipPath -Force
} else {
    Write-Host 'FreeQwenApi is already present - skipping.'
}

Write-Step 'Installing FreeQwenApi dependencies'
Push-Location $QwenDir
try { & npm install --no-audit --no-fund } finally { Pop-Location }

$QwenEnv = Join-Path $QwenDir '.env'
if (-not (Test-Path $QwenEnv)) {
@'
HOST=127.0.0.1
PORT=3264
NON_INTERACTIVE=1
SKIP_ACCOUNT_MENU=1
DEFAULT_MODEL=qwen3.7-max
LOG_LEVEL=info
QWEN_TOOL_PROMPT_MODE=minimal
QWEN_MAX_SYSTEM_CHARS=12000
QWEN_USE_NODE_FETCH=0
ALLOW_UNSCOPED_SESSION_CHAT_RESTORE=0
'@ | Set-Content -Path $QwenEnv -Encoding ASCII
}

$Cloudflared = Join-Path $ToolsDir 'cloudflared.exe'
if (-not (Test-Path $Cloudflared)) {
    Write-Step 'Downloading cloudflared.exe'
    Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile $Cloudflared
} else {
    Write-Host 'cloudflared.exe is already present - skipping.'
}

Write-Step 'Done'
Write-Host '1. translator.config.json is now local-only and ignored by Git.' -ForegroundColor Yellow
Write-Host '2. Run authorize_qwen.bat if your Qwen session is not ready.' -ForegroundColor Yellow
Write-Host '3. Run start_translator.bat. It opens a local QR page with a one-time /connect pairing link.' -ForegroundColor Yellow

$RunAuth = Read-Host 'Run Qwen authorization now? [Y/n]'
if ([string]::IsNullOrWhiteSpace($RunAuth) -or $RunAuth -match '^[Yy]') {
    Push-Location $QwenDir
    try { & npm run auth } finally { Pop-Location }
}
