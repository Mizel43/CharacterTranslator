import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '..');

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new Error(`Cannot read configuration file ${filePath}: ${error.message}`);
  }
}

export function loadConfig(configPathOverride) {
  const configPath = configPathOverride
    ? path.resolve(configPathOverride)
    : process.env.TRANSLATOR_CONFIG
      ? path.resolve(process.env.TRANSLATOR_CONFIG)
      : path.join(ROOT_DIR, 'translator.config.json');

  if (!fs.existsSync(configPath)) {
    throw new Error(`Configuration file is missing at ${configPath}. Run setup.bat to create translator.config.json from the example file.`);
  }

  const raw = readJson(configPath);
  const allowedOrigins = Array.isArray(raw.allowedOrigins)
    ? raw.allowedOrigins.map((value) => String(value).trim()).filter(Boolean)
    : [];

  return {
    configPath,
    frontendUrl: String(raw.frontendUrl || '').trim(),
    host: String(raw.gatewayHost || '127.0.0.1'),
    port: Number(raw.gatewayPort || 8787),
    qwenBaseUrl: String(raw.qwenBaseUrl || 'http://127.0.0.1:3264/api').replace(/\/$/, ''),
    defaultModel: String(raw.defaultModel || 'qwen3.7-max'),
    maxInputChars: Number(raw.maxInputChars || 4000),
    requestTimeoutMs: Number(raw.requestTimeoutMs || 120000),
    allowedOrigins,
    rateLimitWindowMs: Number(raw.rateLimit?.windowMs || 600000),
    rateLimitMax: Number(raw.rateLimit?.max || 30),
    pairingCodeTtlMs: Number(raw.auth?.pairingCodeTtlMs || raw.pairingCodeTtlMs || 300000),
    sessionTtlMs: Number(raw.auth?.sessionTtlMs || raw.sessionTtlMs || 28800000),
    authRateLimitWindowMs: Number(raw.auth?.rateLimit?.windowMs || raw.authRateLimitWindowMs || 600000),
    authRateLimitMax: Number(raw.auth?.rateLimit?.max || raw.authRateLimitMax || 12),
  };
}
