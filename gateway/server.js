import crypto from 'node:crypto';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

import { createAuth } from './auth.js';
import { loadConfig } from './config.js';
import { createQwenClient } from './qwen-client.js';
import { createSessionStore } from './session-store.js';
import { createStaticHandler } from './static.js';
import { createTranslateService } from './translate-service.js';

function createRateLimiter(windowMs, max) {
  const buckets = new Map();

  return {
    check(key) {
      const now = Date.now();
      const bucket = buckets.get(key);
      if (!bucket || now - bucket.startedAt >= windowMs) {
        buckets.set(key, { startedAt: now, count: 1 });
        return { allowed: true, remaining: max - 1, retryAfterMs: windowMs };
      }

      bucket.count += 1;
      return {
        allowed: bucket.count <= max,
        remaining: Math.max(0, max - bucket.count),
        retryAfterMs: Math.max(0, windowMs - (now - bucket.startedAt)),
      };
    },
  };
}

function clientIp(req) {
  return String(
    req.headers['cf-connecting-ip'] ||
      req.headers['x-forwarded-for'] ||
      req.socket.remoteAddress ||
      'unknown',
  )
    .split(',')[0]
    .trim();
}

function readJsonBody(req, limitBytes = 100_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(Object.assign(new Error('Request body is too large.'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error('Invalid JSON payload.'), { statusCode: 400 }));
      }
    });

    req.on('error', reject);
  });
}

function getOrigin(req) {
  return String(req.headers.origin || '').trim();
}

function getProtocol(req) {
  const forwarded = String(req.headers['x-forwarded-proto'] || '').trim();
  if (forwarded) return forwarded.split(',')[0].trim();

  const cfVisitor = String(req.headers['cf-visitor'] || '').trim();
  if (cfVisitor.includes('"https"')) return 'https';

  return req.socket.encrypted ? 'https' : 'http';
}

function getRequestOrigin(req) {
  const host = String(req.headers.host || '').trim();
  if (!host) return '';
  return `${getProtocol(req)}://${host}`;
}

function isGithubPagesOrigin(origin) {
  if (!origin) return false;
  try {
    return new URL(origin).hostname.endsWith('.github.io');
  } catch {
    return false;
  }
}

function isOriginAllowed(req, config, origin) {
  if (!origin) return true;
  if (isGithubPagesOrigin(origin)) return false;
  if (origin === getRequestOrigin(req)) return true;
  return config.allowedOrigins.includes(origin);
}

function corsHeaders(req, config) {
  const origin = getOrigin(req);
  if (!origin || !isOriginAllowed(req, config, origin)) return {};

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

function withCookies(headers, cookies = []) {
  if (!cookies.length) return headers;
  return { ...headers, 'Set-Cookie': cookies };
}

function sendJson(res, status, payload, extraHeaders = {}, cookies = []) {
  const body = JSON.stringify(payload);
  res.writeHead(status, withCookies({
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...extraHeaders,
  }, cookies));
  res.end(body);
}

function sendNoContent(res, status, extraHeaders = {}, cookies = []) {
  res.writeHead(status, withCookies({ 'Cache-Control': 'no-store', ...extraHeaders }, cookies));
  res.end();
}

function logRequest(requestId, method, path, status, message) {
  const suffix = message ? ` ${message}` : '';
  console.log(`[gateway] ${new Date().toISOString()} request=${requestId} ${method} ${path} status=${status}${suffix}`);
}

export function createGatewayServer(options = {}) {
  const config = options.config || loadConfig(options.configPath);
  const sessionStore = options.sessionStore || createSessionStore({ sessionTtlMs: config.sessionTtlMs });
  const auth = options.auth || createAuth({
    config,
    sessionStore,
    pairingCode: options.pairingCode || process.env.TRANSLATOR_PAIRING_CODE,
  });

  const qwenClient = options.qwenClient || createQwenClient(config);
  const translateService = options.translateService || createTranslateService({
    config,
    qwenClient,
    logger: (message) => console.warn(`[gateway] ${message}`),
  });

  const staticHandler = options.staticHandler || createStaticHandler();
  const requestLimiter = createRateLimiter(config.rateLimitWindowMs, config.rateLimitMax);
  const authLimiter = createRateLimiter(config.authRateLimitWindowMs, config.authRateLimitMax);

  const server = http.createServer(async (req, res) => {
    const requestId = crypto.randomUUID().slice(0, 8);
    const headers = corsHeaders(req, config);
    const origin = getOrigin(req);
    const path = req.url || '/';

    if (origin && !isOriginAllowed(req, config, origin)) {
      logRequest(requestId, req.method || 'GET', path, 403, 'origin_rejected');
      sendJson(res, 403, { ok: false, error: 'Origin is not allowed.' }, headers);
      return;
    }

    if (req.method === 'OPTIONS') {
      sendNoContent(res, 204, headers);
      return;
    }

    if (await staticHandler(req, res)) {
      return;
    }

    const url = new URL(req.url, `${getRequestOrigin(req) || 'http://localhost'}`);

    try {
      if (url.pathname === '/public/ping' && req.method === 'GET') {
        logRequest(requestId, req.method, url.pathname, 200);
        sendJson(res, 200, { ok: true, service: 'qwen-character-translator-gateway' }, headers);
        return;
      }

      if (url.pathname === '/api/session/claim' && req.method === 'POST') {
        const authRate = authLimiter.check(clientIp(req));
        if (!authRate.allowed) {
          logRequest(requestId, req.method, url.pathname, 429, 'auth_rate_limited');
          sendJson(
            res,
            429,
            { ok: false, error: 'Too many authentication attempts. Try again later.' },
            { ...headers, 'Retry-After': String(Math.ceil(authRate.retryAfterMs / 1000)) },
          );
          return;
        }

        const body = await readJsonBody(req);
        const session = auth.claimPairingCode(String(body.code || '').trim(), {
          ip: clientIp(req),
          userAgent: String(req.headers['user-agent'] || ''),
        });

        logRequest(requestId, req.method, url.pathname, 200);
        sendJson(
          res,
          200,
          {
            ok: true,
            csrfToken: session.csrfToken,
            sessionExpiresAt: session.expiresAt,
          },
          headers,
          auth.issueSessionCookies(req, session),
        );
        return;
      }

      const session = auth.getSession(req);
      if (!session) {
        logRequest(requestId, req.method || 'GET', url.pathname, 401, 'no_session');
        sendJson(res, 401, { ok: false, error: 'Authentication required.' }, headers);
        return;
      }

      const rate = requestLimiter.check(clientIp(req));
      if (!rate.allowed) {
        logRequest(requestId, req.method, url.pathname, 429, 'rate_limited');
        sendJson(
          res,
          429,
          { ok: false, error: 'Too many requests. Try again later.' },
          { ...headers, 'Retry-After': String(Math.ceil(rate.retryAfterMs / 1000)) },
        );
        return;
      }

      if (req.method === 'POST' && !auth.validateCsrf(req, session)) {
        logRequest(requestId, req.method, url.pathname, 403, 'csrf_rejected');
        sendJson(res, 403, { ok: false, error: 'Missing or invalid CSRF token.' }, headers);
        return;
      }

      if (url.pathname === '/api/health' && req.method === 'GET') {
        const upstream = await qwenClient.qwenHealth();
        const status = upstream.ok ? 200 : 503;
        logRequest(requestId, req.method, url.pathname, status);
        sendJson(res, status, {
          ok: upstream.ok,
          gateway: true,
          qwen: upstream.ok,
          defaultModel: config.defaultModel,
          upstreamError: upstream.ok ? null : upstream.error || upstream.data?.error || 'Qwen API is unavailable.',
        }, headers);
        return;
      }

      if (url.pathname === '/api/models' && req.method === 'GET') {
        let models;
        try {
          models = await qwenClient.listModels();
        } catch {
          models = [config.defaultModel, 'qwen3.7-plus'];
        }

        logRequest(requestId, req.method, url.pathname, 200);
        sendJson(res, 200, { ok: true, models, defaultModel: config.defaultModel }, headers);
        return;
      }

      if (url.pathname === '/api/translate' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const result = await translateService.translate(body);
        logRequest(requestId, req.method, url.pathname, 200);
        sendJson(res, 200, { ok: true, ...result }, headers);
        return;
      }

      if (url.pathname === '/api/session/logout' && req.method === 'POST') {
        auth.destroySession(req);
        logRequest(requestId, req.method, url.pathname, 204);
        sendNoContent(res, 204, headers, auth.clearSessionCookies(req));
        return;
      }

      logRequest(requestId, req.method || 'GET', url.pathname, 404);
      sendJson(res, 404, { ok: false, error: 'Route not found.' }, headers);
    } catch (error) {
      const status = Number(error?.statusCode || error?.status || 502);
      const safeMessage = String(error?.message || 'Unexpected gateway error.');
      logRequest(requestId, req.method || 'GET', url.pathname, status, `${error?.code || 'error'} ${safeMessage}`);
      sendJson(res, status, { ok: false, error: safeMessage }, headers);
    }
  });

  function shutdown(signal) {
    console.log(`[gateway] ${signal}: stopping...`);
    auth.revokeAllSessions();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  }

  return { server, config, auth, shutdown };
}

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMainModule) {
  const { server, config, shutdown } = createGatewayServer();
  server.listen(config.port, config.host, () => {
    console.log(`[gateway] http://${config.host}:${config.port}`);
    console.log(`[gateway] qwen=${config.qwenBaseUrl}`);
    console.log(`[gateway] allowedOrigins=${config.allowedOrigins.join(', ') || '(same-origin only)'}`);
  });

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
