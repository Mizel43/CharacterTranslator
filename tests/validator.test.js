import test from 'node:test';
import assert from 'node:assert/strict';
import { loadStyleConfig } from '../gateway/style-config.js';
import { validateCandidate } from '../gateway/validator.js';

const baseInput = {
  action: 'alternative',
  controls: { slang: 1, flirt: 1, vulgarity: 0, sexualTension: 0, directness: 2 },
  profile: { emojiLevel: 1, messageLength: 'short' },
  previous: { output: 'you really think so?', outputs: ['you really think so?'] },
};

test('detects duplicate and wrapper output', () => {
  const result = validateCandidate('Translation: you really think so?', baseInput, loadStyleConfig());
  assert.equal(result.ok, false);
  assert.ok(result.reasons.some((reason) => reason.includes('wrapper')));
  assert.ok(result.reasons.some((reason) => reason.includes('similar')));
});

test('allows genuinely different alternative', () => {
  const result = validateCandidate('wait, you actually believe that?', baseInput, loadStyleConfig());
  assert.equal(result.ok, true);
});

test('flags more_vulgar without marker', () => {
  const result = validateCandidate('you really want that', {
    ...baseInput,
    action: 'more_vulgar',
    controls: { ...baseInput.controls, vulgarity: 4 },
    previous: { outputs: [] },
  }, loadStyleConfig());
  assert.equal(result.ok, false);
  assert.ok(result.reasons.some((reason) => reason.includes('vulgar')));
});
