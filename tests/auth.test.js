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
    sessionTtlMs: 600000,
    authRateLimitWindowMs: 600000,
    authRateLimitMax: 12,
    ...overrides,
  };
}

function createTestServer(configOverrides = {}) {
  return createGatewayServer({
    config: makeConfig(configOverrides),
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
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

test('request without session cookie gets 401', async () => {
  const { server } = createTestServer();
  const port = await listen(server);

  const response = await fetch(`http://127.0.0.1:${port}/api/health`);
  const payload = await response.json();

  assert.equal(response.status, 401);
  assert.equal(payload.ok, false);

  await close(server);
});

test('pairing code can be used only once', async () => {
  const { server } = createTestServer();
  const port = await listen(server);

  const first = await fetch(`http://127.0.0.1:${port}/api/session/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'pairing-code-for-tests-123456' }),
  });
  const second = await fetch(`http://127.0.0.1:${port}/api/session/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'pairing-code-for-tests-123456' }),
  });

  assert.equal(first.status, 200);
  assert.equal(second.status, 401);

  await close(server);
});

test('expired pairing code fails', async () => {
  const { server } = createTestServer({ pairingCodeTtlMs: 1 });
  const port = await listen(server);
  await new Promise((resolve) => setTimeout(resolve, 15));

  const response = await fetch(`http://127.0.0.1:${port}/api/session/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'pairing-code-for-tests-123456' }),
  });
  const payload = await response.json();

  assert.equal(response.status, 401);
  assert.match(payload.error, /expired/i);

  await close(server);
});
