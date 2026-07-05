import { CONTROL_IDS } from './style-engine.js';

const BANNED_OUTPUT_PATTERNS = [
  /^translation\s*:/i,
  /^english\s*:/i,
  /^russian\s*:/i,
  /^result\s*:/i,
  /^answer\s*:/i,
  /^перевод\s*:/i,
  /^результат\s*:/i,
  /^ответ\s*:/i,
  /```/,
];
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;
const CYRILLIC_RE = /[А-Яа-яЁё]/;
const LATIN_WORD_RE = /[A-Za-z]+(?:'[A-Za-z]+)?/g;
const URL_RE = /https?:\/\/\S+/gi;
const HANDLE_RE = /[@#][\p{L}\p{N}_-]+/gu;
const LITERAL_EXPLANATION_PATTERNS = [
  /^here(?:'s| is)\b/i,
  /^the (?:corrected )?(?:russian )?translation\b/i,
  /^this (?:means|translates to)\b/i,
  /^in russian[,:\s]/i,
  /^note\b/i,
  /^explanation\b/i,
];
const EN_RU_REFUSAL_PATTERNS = [
  /^i(?:'m| am)?\s+sorry\b/i,
  /^sorry\b/i,
  /^as an ai\b/i,
  /^i can(?:not|'t)\b/i,
  /^не могу\b/i,
  /^извин(?:и|ите|ите,|яюсь)\b/i,
  /^как ии\b/i,
];
const COMMON_TRANSLATABLE_ENGLISH = new Set([
  'hey',
  'hi',
  'hello',
  'sure',
  'okay',
  'ok',
  'thanks',
  'sorry',
  'later',
  'wild',
  'down',
  'wish',
  'come',
  'wait',
  'good',
  'bad',
  'miss',
  'cap',
  'lowkey',
]);
const EN_RU_CALQUE_PATTERNS = [
  /^привет\s*,\s*(?:ты|вы)(?:[!?.\s]|$)/i,
];

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function diceSimilarity(a, b) {
  const left = normalizeText(a);
  const right = normalizeText(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const leftTokens = new Set(left.split(' '));
  const rightTokens = new Set(right.split(' '));
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return (2 * overlap) / (leftTokens.size + rightTokens.size);
}

function hasMarker(text, markers = []) {
  const normalized = normalizeText(text);
  return markers.some((marker) => normalized.includes(normalizeText(marker)));
}

function englishWords(text) {
  return String(text || '').match(LATIN_WORD_RE) || [];
}

function countBulletLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^(?:[-*•]|\d+[.)])\s+/.test(line)).length;
}

function sourceNeedsRussianScript(sourceText) {
  const sanitized = String(sourceText || '')
    .replace(URL_RE, ' ')
    .replace(HANDLE_RE, ' ')
    .trim();
  const words = englishWords(sanitized);
  if (!words.length) return false;
  if (words.length >= 2) return true;
  return COMMON_TRANSLATABLE_ENGLISH.has(words[0].toLowerCase());
}

function containsAlternativeList(text, sourceText) {
  if (/(?:^|\n)(?:вариант|варианты|option|options)\b/i.test(text)) return true;
  return countBulletLines(text) >= 2 && countBulletLines(sourceText) < 2;
}

function looksUntranslatedEnglish(text, sourceText) {
  if (!sourceText || CYRILLIC_RE.test(text) || !/[A-Za-z]/.test(text)) return false;
  const similarity = diceSimilarity(text, sourceText);
  if (similarity >= 0.72) return true;

  const sourceWords = englishWords(sourceText).length;
  const candidateWords = englishWords(text).length;
  return sourceWords >= 2 && candidateWords >= 2;
}

export function validateCandidate(candidate, input, styleConfig) {
  const reasons = [];
  const text = String(candidate || '').trim();
  if (!text) reasons.push('empty output');
  if (BANNED_OUTPUT_PATTERNS.some((pattern) => pattern.test(text))) reasons.push('wrapper text or markdown fence');

  const emojiCount = [...text.matchAll(EMOJI_RE)].length;
  const emojiLimit = Number(input.profile?.emojiLevel ?? 1) + 1;
  if (emojiCount > emojiLimit) reasons.push('too many emojis');

  const previous = input.previous?.outputs || [];
  const threshold = input.action === 'alternative' ? 0.82 : input.action === 'apply_settings' ? 0.86 : 0.98;
  for (const item of previous) {
    const similarity = diceSimilarity(text, item);
    if (similarity >= threshold) reasons.push(`too similar to previous output (${similarity.toFixed(2)})`);
  }

  if (input.action === 'shorter' && input.previous?.output) {
    if (text.length > input.previous.output.length + 8) reasons.push('shorter result is longer than previous output');
  }

  const vulgarityMarkers = styleConfig.controls?.vulgarity?.markers || [];
  if (input.action === 'more_vulgar' && input.controls?.vulgarity >= 2 && !hasMarker(text, vulgarityMarkers)) {
    reasons.push('more_vulgar output lacks a crude or profanity marker');
  }

  const slangMarkers = styleConfig.controls?.slang?.markers || [];
  if (input.controls?.slang >= 3 && !hasMarker(text, slangMarkers)) {
    reasons.push('high slang output lacks a natural colloquial marker');
  }

  if (input.previous?.controls) {
    const changed = CONTROL_IDS.some((id) => Math.abs((input.previous.controls[id] ?? input.controls[id]) - input.controls[id]) >= 2);
    if (input.action === 'apply_settings' && changed && input.previous.output && diceSimilarity(text, input.previous.output) >= 0.86) {
      reasons.push('settings changed but output barely changed');
    }
  }

  return { ok: reasons.length === 0, reasons, similarity: previous[0] ? diceSimilarity(text, previous[0]) : 0 };
}

export function buildCorrectionMessages(input, candidate, reasons, originalMessages) {
  return [
    ...originalMessages,
    {
      role: 'assistant',
      content: candidate,
    },
    {
      role: 'user',
      content: [
        'Revise the draft once. Return only the final English text.',
        `Correction reasons: ${reasons.join('; ')}.`,
        'Keep the Russian source meaning, obey the style settings, and avoid repeating previous outputs.',
      ].join(' '),
    },
  ];
}

export function validateEnRuTranslation(candidate, sourceText = '') {
  const reasons = [];
  const text = String(candidate || '').trim();

  if (!text) reasons.push('empty output');
  if (BANNED_OUTPUT_PATTERNS.some((pattern) => pattern.test(text))) reasons.push('wrapper text or markdown fence');

  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  if (LITERAL_EXPLANATION_PATTERNS.some((pattern) => pattern.test(firstLine))) {
    reasons.push('explanation instead of direct translation');
  }
  if (containsAlternativeList(text, sourceText)) reasons.push('multiple alternatives or list formatting');
  if (EN_RU_REFUSAL_PATTERNS.some((pattern) => pattern.test(firstLine))) reasons.push('model refusal or meta response');
  if (sourceNeedsRussianScript(sourceText) && !CYRILLIC_RE.test(text)) reasons.push('missing Cyrillic in Russian translation');
  if (looksUntranslatedEnglish(text, sourceText)) reasons.push('english source was returned without translation');
  if (EN_RU_CALQUE_PATTERNS.some((pattern) => pattern.test(text))) reasons.push('obvious English calque');

  return { ok: reasons.length === 0, reasons };
}

export function buildEnRuCorrectionMessages(originalMessages, candidate) {
  return [
    ...originalMessages,
    {
      role: 'assistant',
      content: candidate,
    },
    {
      role: 'user',
      content: [
        'Rewrite the result as one natural Russian translation by meaning.',
        'Keep the exact intent, tone, slang, and subtext.',
        'Remove literal English calques and all explanations.',
        'Return only the final Russian translation.',
      ].join(' '),
    },
  ];
}
