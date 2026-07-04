$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$VendorDir = Join-Path $Root 'vendor'
$QwenDir = Join-Path $VendorDir 'FreeQwenApi'
$ToolsDir = Join-Path $Root 'tools'
$DataDir = Join-Path $Root 'data'
$LogsDir = Join-Path $Root 'logs'
$GatewayDir = Join-Path $Root 'gateway'
$ConfigPath = Join-Path $Root 'translator.config.json'

function Write-Step([string]$Text) {
    Write-Host "`n==> $Text" -ForegroundColor Cyan
}

function Require-Command([string]$Name, [string]$HelpUrl) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        Write-Host "Не найдена команда: $Name" -ForegroundColor Red
        Write-Host "Установите её и повторите setup.bat: $HelpUrl"
        Start-Process $HelpUrl
        exit 1
    }
}

Write-Host 'Qwen Character Translator — первичная настройка' -ForegroundColor Green
Require-Command 'node' 'https://nodejs.org/en/download'
Require-Command 'npm' 'https://nodejs.org/en/download'

$NodeVersion = (& node -p "process.versions.node").Trim()
$NodeMajor = [int]($NodeVersion.Split('.')[0])
if ($NodeMajor -lt 20) {
    Write-Host "Нужен Node.js 20 или новее. Сейчас: $NodeVersion" -ForegroundColor Red
    Start-Process 'https://nodejs.org/en/download'
    exit 1
}
Write-Host "Node.js: $NodeVersion"

New-Item -ItemType Directory -Force -Path $VendorDir, $ToolsDir, $DataDir, $LogsDir | Out-Null

Write-Step 'Установка зависимостей локального Gateway'
Push-Location $GatewayDir
try { & npm install --no-audit --no-fund } finally { Pop-Location }

if (-not (Test-Path (Join-Path $QwenDir 'package.json'))) {
    Write-Step 'Скачивание FreeQwenApi'
    $ZipPath = Join-Path $env:TEMP 'FreeQwenApi-main.zip'
    $ExtractDir = Join-Path $env:TEMP ('FreeQwenApi-' + [guid]::NewGuid().ToString('N'))
    Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/ForgetMeAI/FreeQwenApi/archive/refs/heads/main.zip' -OutFile $ZipPath
    Expand-Archive -Path $ZipPath -DestinationPath $ExtractDir -Force
    $Extracted = Get-ChildItem $ExtractDir -Directory | Select-Object -First 1
    if (-not $Extracted) { throw 'Не удалось распаковать FreeQwenApi.' }
    if (Test-Path $QwenDir) { Remove-Item $QwenDir -Recurse -Force }
    Move-Item $Extracted.FullName $QwenDir
    Remove-Item $ExtractDir -Recurse -Force
    Remove-Item $ZipPath -Force
} else {
    Write-Host 'FreeQwenApi уже скачан — пропускаю.'
}

Write-Step 'Установка зависимостей FreeQwenApi'
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
    Write-Step 'Скачивание cloudflared.exe'
    Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile $Cloudflared
} else {
    Write-Host 'cloudflared.exe уже скачан — пропускаю.'
}

$TokenPath = Join-Path $DataDir 'access-token.txt'
if (-not (Test-Path $TokenPath)) {
    Write-Step 'Создание секретного ключа доступа'
    $Bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($Bytes)
    $Token = [Convert]::ToBase64String($Bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
    Set-Content -Path $TokenPath -Value $Token -Encoding ASCII -NoNewline
}

Write-Step 'Настройка адреса GitHub Pages'
$Config = Get-Content $ConfigPath -Raw | ConvertFrom-Json
Write-Host "Сейчас: $($Config.frontendUrl)"
$FrontendUrl = Read-Host 'Введите адрес будущего GitHub Pages или нажмите Enter, чтобы настроить позже'
if ($FrontendUrl) {
    $FrontendUrl = $FrontendUrl.Trim()
    if (-not $FrontendUrl.EndsWith('/')) { $FrontendUrl += '/' }
    $Uri = [Uri]$FrontendUrl
    $Config.frontendUrl = $FrontendUrl
    $Config.allowedOrigins = @($Uri.GetLeftPart([System.UriPartial]::Authority), 'http://localhost:4173', 'http://127.0.0.1:4173')
    $Config | ConvertTo-Json -Depth 10 | Set-Content -Path $ConfigPath -Encoding UTF8
}

Write-Step 'Готово'
Write-Host '1. Запустите authorize_qwen.bat и войдите в Qwen Chat.' -ForegroundColor Yellow
Write-Host '2. Загрузите папку проекта в GitHub и включите Pages через GitHub Actions.' -ForegroundColor Yellow
Write-Host '3. Запускайте start_translator.bat.' -ForegroundColor Yellow

$RunAuth = Read-Host 'Запустить авторизацию Qwen сейчас? [Y/n]'
if ([string]::IsNullOrWhiteSpace($RunAuth) -or $RunAuth -match '^[YyДд]') {
    Push-Location $QwenDir
    try { & npm run auth } finally { Pop-Location }
}
