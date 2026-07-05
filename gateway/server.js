import http from 'node:http';
import { URL } from 'node:url';
import { loadConfig } from './config.js';
import { buildMessages, cleanModelOutput, normalizeRequest } from './prompt.js';
import { getTemperature, loadStyleConfig } from './style-config.js';
import { buildCorrectionMessages, validateCandidate } from './validator.js';

const config = loadConfig();
const styleConfig = loadStyleConfig();
const rateBuckets = new Map();

function json(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  });
  res.end(body);
}

function getOrigin(req) {
  return String(req.headers.origin || '').trim();
}

function isOriginAllowed(origin) {
  if (!origin) return true;
  if (config.allowedOrigins.includes('*')) return true;
  return config.allowedOrigins.includes(origin);
}

function corsHeaders(req) {
  const origin = getOrigin(req);
  if (!origin || !isOriginAllowed(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

function authorized(req) {
  const header = String(req.headers.authorization || '');
  if (!header.startsWith('Bearer ')) return false;
  return header.slice(7).trim() === config.accessToken;
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

function checkRateLimit(req) {
  const key = clientIp(req);
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.startedAt >= config.rateLimitWindowMs) {
    rateBuckets.set(key, { startedAt: now, count: 1 });
    return { allowed: true, remaining: config.rateLimitMax - 1 };
  }
  bucket.count += 1;
  const allowed = bucket.count <= config.rateLimitMax;
  return { allowed, remaining: Math.max(0, config.rateLimitMax - bucket.count) };
}

async function readBody(req, limitBytes = 100_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limitBytes) throw new Error('Запрос слишком большой.');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('Некорректный JSON.');
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = config.requestTimeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function qwenHealth() {
  try {
    const response = await fetchWithTimeout(`${config.qwenBaseUrl}/health`, {}, 5000);
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok && data.ok !== false, status: response.status, data };
  } catch (error) {
    return { ok: false, error: error.name === 'AbortError' ? 'timeout' : error.message };
  }
}

async function listModels() {
  const response = await fetchWithTimeout(`${config.qwenBaseUrl}/models`, {}, 15000);
  if (!response.ok) throw new Error(`Qwen models endpoint: HTTP ${response.status}`);
  const payload = await response.json();
  const rawModels = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
  const ids = rawModels
    .map((item) => (typeof item === 'string' ? item : item?.id))
    .filter((id) => typeof id === 'string' && /^qwen/i.test(id));
  return [...new Set(ids)];
}

async function callQwen(payload) {
  const response = await fetchWithTimeout(`${config.qwenBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dummy-key' },
    body: JSON.stringify(payload),
  });

  const rawText = await response.text();
  let data;
  try {
    data = JSON.parse(rawText);
  } catch {
    data = { raw: rawText };
  }

  if (!response.ok) {
    const upstreamMessage = data?.error?.message || data?.message || `HTTP ${response.status}`;
    throw new Error(`Qwen недоступен: ${upstreamMessage}`);
  }

  return {
    text: cleanModelOutput(data?.choices?.[0]?.message?.content),
    usage: data?.usage || null,
  };
}

async function translate(body) {
  const input = normalizeRequest(body, config.maxInputChars);
  const model = input.model || config.defaultModel;
  const messages = buildMessages(input);
  const payload = {
    model,
    messages,
    stream: false,
    temperature: getTemperature(input.action),
    max_tokens: 360,
  };

  const first = await callQwen(payload);
  const validation = validateCandidate(first.text, input, styleConfig);
  if (validation.ok) {
    return { text: first.text, model, usage: first.usage, meta: { corrected: false, action: input.action } };
  }

  console.warn(`[gateway] correction action=${input.action} reasons=${validation.reasons.join('; ')}`);
  const second = await callQwen({
    ...payload,
    temperature: getTemperature(input.action, true),
    messages: buildCorrectionMessages(input, first.text, validation.reasons, messages),
  });

  return { text: second.text, model, usage: second.usage, meta: { corrected: true, action: input.action } };
}

const server = http.createServer(async (req, res) => {
  const headers = corsHeaders(req);
  const origin = getOrigin(req);

  if (origin && !isOriginAllowed(origin)) {
    return json(res, 403, { ok: false, error: 'Этот сайт не разрешен в настройках gateway.' });
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, headers);
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/public/ping' && req.method === 'GET') {
    return json(res, 200, { ok: true, service: 'character-translator-gateway' }, headers);
  }

  if (!authorized(req)) {
    return json(res, 401, { ok: false, error: 'Неверный ключ доступа.' }, headers);
  }

  const rate = checkRateLimit(req);
  if (!rate.allowed) {
    return json(
      res,
      429,
      { ok: false, error: 'Слишком много запросов. Попробуйте немного позже.' },
      { ...headers, 'Retry-After': String(Math.ceil(config.rateLimitWindowMs / 1000)) },
    );
  }

  try {
    if (url.pathname === '/api/health' && req.method === 'GET') {
      const upstream = await qwenHealth();
      return json(
        res,
        upstream.ok ? 200 : 503,
        {
          ok: upstream.ok,
          gateway: true,
          qwen: upstream.ok,
          defaultModel: config.defaultModel,
          styleSchemaVersion: styleConfig.schemaVersion,
          upstreamError: upstream.ok ? null : upstream.error || upstream.data?.error || 'Qwen API не отвечает',
        },
        headers,
      );
    }

    if (url.pathname === '/api/models' && req.method === 'GET') {
      let models;
      try {
        models = await listModels();
      } catch {
        models = [config.defaultModel, 'qwen3.7-plus'];
      }
      return json(res, 200, { ok: true, models, defaultModel: config.defaultModel }, headers);
    }

    if (url.pathname === '/api/translate' && req.method === 'POST') {
      const body = await readBody(req);
      const result = await translate(body);
      return json(res, 200, { ok: true, ...result }, headers);
    }

    return json(res, 404, { ok: false, error: 'Маршрут не найден.' }, headers);
  } catch (error) {
    const isAbort = error?.name === 'AbortError';
    console.error(`[gateway] ${new Date().toISOString()} ${error?.stack || error}`);
    return json(
      res,
      isAbort ? 504 : 502,
      {
        ok: false,
        error: isAbort ? 'Qwen не ответил вовремя.' : String(error.message || 'Неизвестная ошибка.'),
      },
      headers,
    );
  }
});

server.listen(config.port, config.host, () => {
  console.log(`[gateway] http://${config.host}:${config.port}`);
  console.log(`[gateway] Qwen: ${config.qwenBaseUrl}`);
  console.log(`[gateway] Allowed origins: ${config.allowedOrigins.join(', ') || '(requests without Origin only)'}`);
});

function shutdown(signal) {
  console.log(`[gateway] ${signal}: stopping...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
