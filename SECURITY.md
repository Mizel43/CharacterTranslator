# Security

## Trust boundary

The public GitHub Pages site is untrusted.

The trusted application client is the self-hosted UI served by the local Gateway:

- `GET /connect`
- `GET /app/`
- `POST /api/session/claim`
- authenticated same-origin `/api/*`

## Rules

- Do not trust GitHub Pages with Gateway credentials.
- Do not store a long-lived Gateway token in `localStorage`, query strings, or public JavaScript.
- Do not commit `translator.config.json`, runtime tunnel URLs, Qwen session files, cookies, or logs.
- Do not log Russian source text, prompts, character profile content, or generated English output by default.
- Do not allow GitHub Pages origin to call privileged Gateway endpoints.

## Auth model

- `start_translator.bat` creates a short-lived pairing link at `/connect#code=...`.
- `POST /api/session/claim` validates that code for a small limited number of claims.
- each successful claim creates a separate browser session.
- Successful claim creates:
  - `HttpOnly` session cookie
  - readable CSRF cookie for same-origin JavaScript
- State-changing requests require:
  - valid session cookie
  - `X-CSRF-Token`
  - allowed origin

## If a pairing link leaks

1. Run `stop_translator.bat`.
2. Start the translator again with `start_translator.bat`.
3. Use the new QR or new `/connect#code=...` link.
4. If needed, clear cookies for the tunnel origin in the browser.

Because pairing codes are short-lived and claim-limited, a restart is enough to rotate the active trust path.

## Local secrets and runtime files

Keep these local-only:

- `translator.config.json`
- `data/current-tunnel.json`
- `data/connect-phone.html`
- `data/connect-qr.png`
- `vendor/FreeQwenApi/session/`
- `vendor/FreeQwenApi/.env`
- `logs/`

## Public Pages checks

The published `docs/` artifact must contain:

- no API bearer token
- no connect URL with code
- no direct client for `/api/translate`
- no runtime tunnel URL

## Server-side enforcement

Gateway protection includes:

- short-lived claim-limited pairing code
- in-memory session store
- origin allowlist plus same-origin checks
- explicit deny for `*.github.io`
- CSRF validation on POST routes
- rate limiting
- static file serving from `gateway/ui`
- security headers and no path traversal
