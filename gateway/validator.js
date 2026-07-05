import { CONTROL_IDS } from './style-engine.js';

const BANNED_OUTPUT_PATTERNS = [/^translation\s*:/i, /^english\s*:/i, /^result\s*:/i, /```/];
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;

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
