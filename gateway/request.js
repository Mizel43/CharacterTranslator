import { loadStyleConfig } from './style-config.js';
import { CONTROL_IDS, describeControlDelta, getPreset, mergePresetControls } from './style-engine.js';

export const TRANSLATION_DIRECTIONS = ['ru-en', 'en-ru'];

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function cleanArray(values, maxItems = 12, maxLength = 240) {
  if (!Array.isArray(values)) return [];
  return values
    .map((item) => String(item).trim().slice(0, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function cleanString(value, maxLength = 500) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function createBadRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function normalizeDirection(direction) {
  const normalized = cleanString(direction, 16).toLowerCase();
  if (!normalized) return 'ru-en';
  if (TRANSLATION_DIRECTIONS.includes(normalized)) return normalized;
  throw createBadRequest('Unsupported translation direction. Use "ru-en" or "en-ru".');
}

function normalizeRuEnAction(action) {
  const aliases = { regenerate: 'alternative' };
  const normalized = aliases[action] || action;
  return ['translate', 'alternative', 'shorter', 'softer', 'bolder', 'more_vulgar', 'apply_settings'].includes(normalized)
    ? normalized
    : 'translate';
}

function normalizeEnRuAction(action) {
  const normalized = cleanString(action, 40);
  if (!normalized || normalized === 'translate') return 'translate';
  throw createBadRequest('Only the "translate" action is supported for English-to-Russian mode.');
}

function normalizePrevious(previous) {
  if (!previous || typeof previous !== 'object') return { output: '', outputs: [], controls: null };

  const output = cleanString(previous.output, 1000);
  const outputs = cleanArray(previous.outputs, 5, 1000);
  if (output && !outputs.includes(output)) outputs.unshift(output);

  const controls = previous.controls && typeof previous.controls === 'object'
    ? Object.fromEntries(CONTROL_IDS.map((id) => [id, clamp(previous.controls[id], 0, 4)]))
    : null;

  return { output, outputs: outputs.slice(0, 5), controls };
}

function normalizeProfile(profile = {}) {
  const rawAge = Number(profile.age ?? 18);
  if (!Number.isFinite(rawAge) || rawAge < 18) {
    throw createBadRequest('Only adult characters aged 18+ are supported.');
  }

  return {
    name: cleanString(profile.name || 'Character', 80),
    age: clamp(rawAge, 18, 99),
    genderVoice: cleanString(profile.genderVoice || 'natural adult voice', 120),
    region: cleanString(profile.region || 'United States', 120),
    personality: cleanString(profile.personality, 500),
    lore: cleanString(profile.lore, 1500),
    background: cleanString(profile.background, 1000),
    relationshipToReader: cleanString(profile.relationshipToReader, 300),
    communicationStyle: cleanString(profile.communicationStyle, 500),
    preferredPhrases: cleanArray(profile.preferredPhrases),
    bannedPhrases: cleanArray(profile.bannedPhrases),
    examples: cleanArray(profile.examples, 16, 400),
    lowercase: Boolean(profile.lowercase),
    emojiLevel: clamp(profile.emojiLevel, 0, 3),
    messageLength: ['short', 'medium', 'long'].includes(profile.messageLength) ? profile.messageLength : 'short',
  };
}

function normalizeText(value, maxInputChars, emptyMessage) {
  const text = cleanString(value, maxInputChars);
  if (!text) throw createBadRequest(emptyMessage);
  return text;
}

export function normalizeRuEnRequest(body, maxInputChars, direction = 'ru-en') {
  const config = loadStyleConfig();
  const text = normalizeText(body?.text, maxInputChars, 'Enter Russian source text first.');

  const profile = normalizeProfile(body?.profile && typeof body.profile === 'object' ? body.profile : {});
  const requestedPreset = cleanString(body?.presetId || body?.preset, 80);
  const preset = getPreset(requestedPreset, config);
  const rawControls = body?.controls && typeof body.controls === 'object' ? body.controls : {};
  const providedControls = Object.fromEntries(
    CONTROL_IDS
      .filter((id) => Object.hasOwn(rawControls, id))
      .map((id) => [id, clamp(rawControls[id], 0, 4)]),
  );
  const controls = mergePresetControls(preset.id, providedControls, config);
  const previous = normalizePrevious(body?.previous);
  const action = normalizeRuEnAction(body?.action);
  const priority = body?.priority === 'voice' ? 'voice' : 'settings';

  return {
    direction,
    text,
    model: cleanString(body?.model, 100),
    action: action === 'translate' && previous.output && previous.controls && describeControlDelta(previous.controls, controls).length
      ? 'apply_settings'
      : action,
    presetId: preset.id,
    priority,
    controls,
    previous,
    profile,
  };
}

export function normalizeEnRuRequest(body, maxInputChars, direction = 'en-ru') {
  return {
    direction,
    text: normalizeText(body?.text, maxInputChars, 'Enter English source text first.'),
    model: cleanString(body?.model, 100),
    action: normalizeEnRuAction(body?.action),
  };
}

export function normalizeRequest(body, maxInputChars) {
  const direction = normalizeDirection(body?.direction);
  return direction === 'en-ru'
    ? normalizeEnRuRequest(body, maxInputChars, direction)
    : normalizeRuEnRequest(body, maxInputChars, direction);
}
