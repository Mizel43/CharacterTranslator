# Deploying GitHub Pages

GitHub Pages now deploys only the safe public page from `docs/`.

It does not host the working translator UI and it must not contain a Gateway API client, runtime tunnel URL, access token, or pairing secret.

## What gets deployed

Only the `docs/` artifact:

- public project description;
- local setup and launch instructions;
- links to repository docs;
- cache cleanup for the old Pages client.

## What does not get deployed

- `gateway/ui/`
- `translator.config.json`
- runtime tunnel URLs
- pairing links
- Qwen session data
- logs
- `data/`, `tools/`, `vendor/FreeQwenApi/`

## GitHub setup

1. Push the repository to GitHub.
2. Open **Settings -> Pages**.
3. In **Build and deployment -> Source**, choose **GitHub Actions**.
4. Wait for the `Deploy GitHub Pages` workflow to finish successfully.

Repository:

`https://github.com/Mizel43/CharacterTranslator`

Expected Pages URL:

`https://mizel43.github.io/CharacterTranslator/`

## Workflow behavior

Before deploy, GitHub Actions now:

- installs Gateway dependencies with `npm ci`;
- runs `npm test`;
- runs syntax checks with `npm run check`;
- verifies `docs/index.html` and `docs/.nojekyll`;
- rejects forbidden Pages artifact content such as secret-bearing client code.

## After deploy

After Pages publish succeeds:

1. Open the public Pages URL and confirm it shows only the information page.
2. Start the local translator with `start_translator.bat`.
3. Use the QR or copied `/connect#code=...` link from the local machine.
4. Verify the real app opens through the tunnel-hosted `/app/`.

## Pre-push sanity list

Check that these are not staged:

```text
translator.config.json
data/
logs/
tools/
vendor/FreeQwenApi/
```

Also verify that `docs/` does not contain:

```text
accessToken
Authorization: Bearer
/api/translate client logic
style-config.json
```
