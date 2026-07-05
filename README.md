# Qwen Character Translator

Self-hosted translator from Russian to natural American English with character profiles, style controls, and a local Gateway in front of FreeQwenApi.

## Security model

GitHub Pages is no longer the translator app.

- `docs/` now publishes only a safe public information page.
- The real browser UI is served by the local Gateway at `/app/` through the current Cloudflare Quick Tunnel URL.
- Browser access is created by a short-lived pairing link at `/connect#code=...`.
- The browser no longer stores a Gateway bearer token in `localStorage`.
- Auth now uses short-lived pairing, `HttpOnly` session cookies, a readable CSRF cookie, and same-origin API calls.

## Current architecture

```text
Phone / browser
        |
        | HTTPS
        v
Cloudflare Quick Tunnel
        |
        v
Translator Gateway on your PC
  |- /connect
  |- /app/
  |- /api/*
        |
        v
FreeQwenApi
        |
        v
Qwen Chat
```

GitHub Pages stays public, but it only hosts project info and setup instructions.

## What changed in the launch flow

Old flow:

- open GitHub Pages;
- GitHub Pages stored Gateway URL and access token in browser state;
- public Pages JavaScript was part of the trusted path.

New flow:

1. Run `start_translator.bat`.
2. The local script starts FreeQwenApi, Gateway, and Cloudflare Quick Tunnel.
3. The script creates a short-lived pairing URL like `https://<quick-tunnel>/connect#code=...`.
4. A local HTML page with QR opens on the PC and the same link is copied to clipboard.
5. The same link can be used on a small number of devices during its TTL, for example on your PC and phone.
6. Each browser claims the code at `/api/session/claim`, receives its own cookies, then opens `/app/`.

This means GitHub Pages is no longer able to act as a privileged API client.

## Requirements

- Windows with PowerShell
- Node.js 20+
- Git
- Browser access for Qwen login

## Quick start

### 1. Run initial setup

```text
setup.bat
```

Setup does the following:

- installs Gateway dependencies;
- downloads FreeQwenApi if missing;
- installs FreeQwenApi dependencies;
- downloads `cloudflared.exe` if missing;
- creates local `translator.config.json` from `translator.config.example.json` when needed.

### 2. Authorize Qwen

```text
authorize_qwen.bat
```

If your Qwen session is already valid, you can skip this step.

### 3. Start the translator

```text
start_translator.bat
```

The script opens a local QR page and copies a short-lived pairing link to clipboard. You can open that link on your PC and phone during its short TTL. Each successful claim creates a separate browser session and then opens `/app/`.

### 4. Stop everything

```text
stop_translator.bat
```

## Local configuration

- `translator.config.example.json` is the tracked template.
- `translator.config.json` is local-only and ignored by Git.

Default example:

```json
{
  "frontendUrl": "",
  "allowedOrigins": [
    "http://localhost:4173",
    "http://127.0.0.1:4173"
  ],
  "gatewayHost": "127.0.0.1",
  "gatewayPort": 8787,
  "qwenBaseUrl": "http://127.0.0.1:3264/api",
  "defaultModel": "qwen3.7-max",
  "maxInputChars": 4000,
  "requestTimeoutMs": 120000,
  "rateLimit": {
    "windowMs": 600000,
    "max": 30
  },
  "auth": {
    "pairingCodeTtlMs": 300000,
    "pairingMaxClaims": 4,
    "sessionTtlMs": 28800000
  }
}
```

`frontendUrl` is kept for compatibility only. The running translator no longer depends on GitHub Pages.

## Local files that must never be committed

- `translator.config.json`
- `data/`
- `logs/`
- `tools/`
- `vendor/FreeQwenApi/`
- Qwen sessions, cookies, tunnel runtime files, pairing links

## Public page preview

```text
preview_site.bat
```

This previews the safe public `docs/` page only. It does not start the translator app.

## Validation

Automated checks:

```text
cd gateway
npm test
npm run check
```

Manual validation steps are listed in [VALIDATION.md](VALIDATION.md).

## Documentation

- [DEPLOY_GITHUB.md](DEPLOY_GITHUB.md)
- [SECURITY.md](SECURITY.md)
- [TECHNICAL_PLAN.md](TECHNICAL_PLAN.md)
- [VALIDATION.md](VALIDATION.md)
