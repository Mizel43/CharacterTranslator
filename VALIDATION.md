# Validation

## Automated checks

Run:

```text
cd gateway
npm test
npm run check
```

Current automated coverage includes:

- request normalization
- 18+ profile enforcement
- prompt and validator behavior
- one-time session claim
- expired pairing code rejection
- protected route 401 without session
- protected POST 403 without CSRF
- origin rejection, including GitHub Pages origin
- static `/app/` serving with CSP
- absence of legacy secret-bearing client code in `docs/`

## Manual acceptance checklist

### Public page

1. Open GitHub Pages.
2. Confirm it shows only the safe public information page.
3. Confirm it does not contain a translator UI, connect link, runtime tunnel URL, or API token.

### Local launch

1. Run `start_translator.bat`.
2. Confirm FreeQwenApi, Gateway, and cloudflared start successfully.
3. Confirm a local QR page opens.
4. Confirm the copied link points to:

```text
https://<quick-tunnel>/connect#code=...
```

### Pairing

1. Open the connect link.
2. Confirm `/connect` succeeds once and redirects to `/app/`.
3. Try the same link again.
4. Confirm reuse fails.

### Protected API

1. Confirm `/app/` loads after pairing.
2. Confirm translation works from `/app/`.
3. Confirm `POST /api/translate` fails without a session cookie.
4. Confirm `POST /api/translate` fails without `X-CSRF-Token`.
5. Confirm a request from another origin fails.

### Logging and local files

1. Inspect `logs/gateway.log`.
2. Confirm it does not contain full prompts, Russian source text, profile details, or generated English output.
3. Confirm `translator.config.json` is not staged in Git.
4. Confirm `data/` runtime files are not staged in Git.
