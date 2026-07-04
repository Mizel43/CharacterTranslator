import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '..');

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new Error(`Не удалось прочитать ${filePath}: ${error.message}`);
  }
}

export function loadConfig() {
  const configPath = process.env.TRANSLATOR_CONFIG
    ? path.resolve(process.env.TRANSLATOR_CONFIG)
    : path.join(ROOT_DIR, 'translator.config.json');

  const raw = readJson(configPath);
  const tokenPath = process.env.ACCESS_TOKEN_FILE
    ? path.resolve(process.env.ACCESS_TOKEN_FILE)
    : path.join(ROOT_DIR, 'data', 'access-token.txt');

  let accessToken = process.env.TRANSLATOR_ACCESS_TOKEN?.trim();
  if (!accessToken && fs.existsSync(tokenPath)) {
    accessToken = fs.readFileSync(tokenPath, 'utf8').trim();
  }

  if (!accessToken || accessToken.length < 24) {
    throw new Error('Не найден безопасный access token. Сначала запустите setup.bat.');
  }

  const allowedOrigins = Array.isArray(raw.allowedOrigins)
    ? raw.allowedOrigins.map((value) => String(value).trim()).filter(Boolean)
    : [];

  return {
    configPath,
    accessToken,
    host: String(raw.gatewayHost || '127.0.0.1'),
    port: Number(raw.gatewayPort || 8787),
    qwenBaseUrl: String(raw.qwenBaseUrl || 'http://127.0.0.1:3264/api').replace(/\/$/, ''),
    defaultModel: String(raw.defaultModel || 'qwen3.7-max'),
    allowedOrigins,
    maxInputChars: Number(raw.maxInputChars || 4000),
    requestTimeoutMs: Number(raw.requestTimeoutMs || 120000),
    rateLimitWindowMs: Number(raw.rateLimit?.windowMs || 600000),
    rateLimitMax: Number(raw.rateLimit?.max || 30),
    frontendUrl: String(raw.frontendUrl || '').trim(),
  };
}
