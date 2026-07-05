import test from 'node:test';
import assert from 'node:assert/strict';

import { createGatewayServer } from '../gateway/server.js';

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

async function claimSession(port) {
  const response = await fetch(`http://127.0.0.1:${port}/api/session/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'pairing-code-for-tests-123456' }),
  });
  const payload = await response.json();
  const cookies = response.headers.getSetCookie().map((cookie) => cookie.split(';', 1)[0]).join('; ');
  return { csrfToken: payload.csrfToken, cookies };
}

function createServer() {
  return createGatewayServer({
    config: makeConfig(),
    pairingCode: 'pairing-code-for-tests-123456',
    qwenClient: {
      qwenHealth: async () => ({ ok: true, status: 200, data: { ok: true } }),
      listModels: async () => ['qwen3.7-max'],
      callChatCompletion: async (payload) => ({
        text: payload.messages[0]?.content?.includes('English-to-Russian')
          ? 'Ты умеешь действовать мне на нервы.'
          : 'you really know how to get under my skin.',
        usage: null,
      }),
    },
  });
}

test('translate route returns meta.direction for en-ru without requiring profile', async () => {
  const { server } = createServer();
  const port = await listen(server);
  const session = await claimSession(port);

  const response = await fetch(`http://127.0.0.1:${port}/api/translate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': session.csrfToken,
      Cookie: session.cookies,
    },
    body: JSON.stringify({
      direction: 'en-ru',
      text: 'You really know how to get under my skin.',
      model: 'qwen3.7-max',
    }),
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.meta.direction, 'en-ru');
  assert.equal(payload.meta.action, 'translate');

  await close(server);
});

test('translate route rejects invalid direction with 400', async () => {
  const { server } = createServer();
  const port = await listen(server);
  const session = await claimSession(port);

  const response = await fetch(`http://127.0.0.1:${port}/api/translate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': session.csrfToken,
      Cookie: session.cookies,
    },
    body: JSON.stringify({
      direction: 'fr-en',
      text: 'Bonjour',
      model: 'qwen3.7-max',
    }),
  });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.ok, false);
  assert.match(payload.error, /Unsupported translation direction/);

  await close(server);
});
