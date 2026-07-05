# Technical Plan

## Version 0.3.0

This version replaces the old GitHub Pages client model with a self-hosted Gateway-served UI.

## Components

### 1. Public Pages site

Location: `docs/`

Purpose:

- publish a safe project page;
- explain setup and launch;
- clear old cached Pages client state.

It must not call privileged Gateway API routes.

### 2. Gateway UI

Location: `gateway/ui/`

Served by the local Gateway at:

```text
GET /app/
GET /app/app.js
GET /app/styles.css
GET /app/style-config.json
GET /connect
```

The UI uses same-origin fetches with cookies and CSRF.

### 3. Translator Gateway

Location: `gateway/`

Main modules:

- `server.js` - HTTP entrypoint and route separation
- `auth.js` - pairing claim, session lookup, CSRF validation, cookies
- `session-store.js` - in-memory sessions
- `static.js` - `/app/*` and `/connect` static serving
- `security-headers.js` - CSP and related headers
- `request.js` - request normalization and profile sanitization
- `qwen-client.js` - upstream Qwen HTTP client
- `translate-service.js` - normalize -> prompt -> validate -> retry flow
- `prompt.js` - prompt assembly only
- `validator.js` - output validation only

### 4. FreeQwenApi

Runs on localhost only:

```text
http://127.0.0.1:3264/api
```

Used endpoints:

```text
GET  /health
GET  /models
POST /chat/completions
```

### 5. Cloudflare Quick Tunnel

Publishes only the Gateway port, not FreeQwenApi directly.

## Route model

Public:

```text
GET  /public/ping
GET  /connect
POST /api/session/claim
GET  /app/*
```

Protected:

```text
GET  /api/health
GET  /api/models
POST /api/translate
POST /api/session/logout
```

## Pairing flow

1. `start_translator.bat` creates a high-entropy one-time pairing code.
2. The script starts Gateway with `TRANSLATOR_PAIRING_CODE`.
3. The script obtains the current tunnel URL.
4. The local helper page shows a link:

```text
https://<quick-tunnel>/connect#code=<one-time-code>
```

5. `/connect` claims the code with `POST /api/session/claim`.
6. Gateway sets cookies and redirects the browser to `/app/`.

## Cookie model

- session cookie: `HttpOnly`, `SameSite=Lax`, `Secure` when the request is HTTPS
- CSRF cookie: readable by JavaScript, same lifetime as the session

The browser no longer stores a Gateway access token.

## Request handling

`/api/translate` pipeline:

1. verify session
2. verify origin
3. verify CSRF
4. apply rate limit
5. normalize request
6. build messages
7. call Qwen
8. validate output
9. optionally do one correction retry

## Config

Tracked template:

- `translator.config.example.json`

Local file:

- `translator.config.json`

Relevant keys:

- `gatewayHost`
- `gatewayPort`
- `qwenBaseUrl`
- `defaultModel`
- `allowedOrigins`
- `rateLimit`
- `auth.pairingCodeTtlMs`
- `auth.sessionTtlMs`

## Tests

Security-sensitive coverage is in:

- `tests/auth.test.js`
- `tests/security.test.js`
- `tests/static.test.js`
- existing prompt/style/validator tests
