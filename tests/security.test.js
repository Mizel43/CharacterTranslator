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

function parseSessionCookies(response) {
  const setCookie = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie')].filter(Boolean);
  const cookieHeader = setCookie.map((item) => item.split(';')[0]).join('; ');
  const csrfCookie = setCookie.find((item) => item.startsWith('qct_csrf=')) || '';
  const csrfToken = decodeURIComponent((csrfCookie.split(';')[0] || '').split('=').slice(1).join('='));
  return { cookieHeader, csrfToken };
}

async function claimSession(port) {
  const response = await fetch(`http://127.0.0.1:${port}/api/session/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'pairing-code-for-tests-123456' }),
  });
  assert.equal(response.status, 200);
  return parseSessionCookies(response);
}

test('POST with cookie but no CSRF gets 403', async () => {
  const { server } = createTestServer();
  const port = await listen(server);
  const { cookieHeader } = await claimSession(port);

  const response = await fetch(`http://127.0.0.1:${port}/api/translate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieHeader,
    },
    body: JSON.stringify({ text: 'Привет', profile: { age: 22 } }),
  });

  assert.equal(response.status, 403);

  await close(server);
});

test('unknown origin gets 403', async () => {
  const { server } = createTestServer();
  const port = await listen(server);
  const { cookieHeader, csrfToken } = await claimSession(port);

  const response = await fetch(`http://127.0.0.1:${port}/api/translate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieHeader,
      Origin: 'https://evil.example',
      'X-CSRF-Token': csrfToken,
    },
    body: JSON.stringify({ text: 'Привет', profile: { age: 22 } }),
  });

  assert.equal(response.status, 403);

  await close(server);
});

test('github pages origin is denied even if configured elsewhere', async () => {
  const { server } = createTestServer({ allowedOrigins: ['https://mizel43.github.io'] });
  const port = await listen(server);
  const { cookieHeader, csrfToken } = await claimSession(port);

  const response = await fetch(`http://127.0.0.1:${port}/api/translate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieHeader,
      Origin: 'https://mizel43.github.io',
      'X-CSRF-Token': csrfToken,
    },
    body: JSON.stringify({ text: 'Привет', profile: { age: 22 } }),
  });

  assert.equal(response.status, 403);

  await close(server);
});
