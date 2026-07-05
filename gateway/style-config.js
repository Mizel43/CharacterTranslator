import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STYLE_CONFIG_PATH = path.resolve(__dirname, 'ui', 'style-config.json');

let cachedConfig = null;

export function loadStyleConfig() {
  if (cachedConfig) return cachedConfig;

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(STYLE_CONFIG_PATH, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new Error(`Cannot load style config at ${STYLE_CONFIG_PATH}: ${error.message}`);
  }

  if (parsed?.schemaVersion !== 2 || !parsed.controls || !parsed.presets) {
    throw new Error('Style config schemaVersion 2 with controls and presets is required.');
  }

  cachedConfig = parsed;
  return cachedConfig;
}

export function getTemperature(action, correction = false) {
  const config = loadStyleConfig();
  if (correction) return Number(config.temperatures?.correction ?? 0.35);
  return Number(config.temperatures?.[action] ?? config.temperatures?.translate ?? 0.55);
}
