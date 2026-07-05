import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createGatewayServer } from '../gateway/server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function makeConfig(overrides = {}) {
  return {
    configPath: 'test-config',
    frontendUrl: '',
    host: '127.0.0.1',
    port: 0,
    qwenBaseUrl: 'http://127.0.0.1:3264/api',
    defaultModel: 'qwen3.7-max',
    maxInputChars: 4000,
    requestTimeoutMs: 1000,
    allowedOrigins: ['http://localhost:4173'],
    rateLimitWindowMs: 600000,
    rateLimitMax: 30,
    pairingCodeTtlMs: 300000,
    pairingMaxClaims: 4,
    sessionTtlMs: 600000,
    authRateLimitWindowMs: 600000,
    authRateLimitMax: 12,
    ...overrides,
  };
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

test('app static page is served with CSP headers and tab UI', async () => {
  const { server } = createGatewayServer({
    config: makeConfig(),
    pairingCode: 'pairing-code-for-tests-123456',
    qwenClient: {
      qwenHealth: async () => ({ ok: true, status: 200, data: { ok: true } }),
      listModels: async () => ['qwen3.7-max'],
      callChatCompletion: async () => ({ text: 'unused', usage: null }),
    },
    translateService: {
      translate: async () => ({ text: 'translated', model: 'qwen3.7-max', usage: null, meta: { corrected: false, action: 'translate' } }),
    },
  });
  const port = await listen(server);

  const response = await fetch(`http://127.0.0.1:${port}/app/`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-security-policy') || '', /default-src 'self'/);
  assert.match(html, /Self-hosted/i);
  assert.match(html, /role="tablist"/);
  assert.match(html, /role="tab"/);
  assert.match(html, /role="tabpanel"/);
  assert.match(html, /data-direction="ru-en"/);
  assert.match(html, /data-direction="en-ru"/);
  assert.doesNotMatch(html, /букваль|дослов|слово в слово/i);

  await close(server);
});

test('public docs page contains no gateway client secrets', () => {
  const docsApp = fs.readFileSync(path.join(ROOT, 'docs', 'app.js'), 'utf8');
  const docsHtml = fs.readFileSync(path.join(ROOT, 'docs', 'index.html'), 'utf8');

  assert.doesNotMatch(docsApp, /accessToken/i);
  assert.doesNotMatch(docsApp, /Authorization/i);
  assert.doesNotMatch(docsApp, /fetch\(['"`]\/api\//i);
  assert.doesNotMatch(docsHtml, /accessToken/i);
});

test('ui local storage code does not store access token', () => {
  const uiState = fs.readFileSync(path.join(ROOT, 'gateway', 'ui', 'state.js'), 'utf8');
  const uiApp = fs.readFileSync(path.join(ROOT, 'gateway', 'ui', 'app.js'), 'utf8');
  const uiApi = fs.readFileSync(path.join(ROOT, 'gateway', 'ui', 'api.js'), 'utf8');

  assert.doesNotMatch(uiState, /localStorage\.setItem\([^)]*accessToken/i);
  assert.doesNotMatch(uiApp, /localStorage\.setItem\([^)]*accessToken/i);
  assert.doesNotMatch(uiApi, /Authorization/i);
});

test('workspace state is isolated in sessionStorage with the new key', () => {
  const uiState = fs.readFileSync(path.join(ROOT, 'gateway', 'ui', 'state.js'), 'utf8');
  const uiApp = fs.readFileSync(path.join(ROOT, 'gateway', 'ui', 'app.js'), 'utf8');

  assert.match(uiState, /qct\.workspace\.v1/);
  assert.match(uiState, /sessionStorage\.setItem/);
  assert.match(uiState, /sessionStorage, SESSION_STORAGE\.workspace/);
  assert.doesNotMatch(uiApp, /localStorage\.setItem\([^)]*sourceText/i);
  assert.doesNotMatch(uiApp, /localStorage\.setItem\([^)]*resultText/i);
});
