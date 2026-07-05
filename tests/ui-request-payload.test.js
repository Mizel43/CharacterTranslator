import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTranslateRequest } from '../gateway/ui/request-payload.js';

test('frontend en-ru payload omits profile, preset, controls, and previous state', () => {
  const payload = buildTranslateRequest({
    direction: 'en-ru',
    text: '  hey you  ',
    model: 'qwen3.7-max',
    action: 'translate',
    presetId: 'casual_dm',
    priority: 'voice',
    controls: { flirt: 4 },
    previous: { output: 'unused' },
    profile: { name: 'Ashley', age: 22 },
  });

  assert.deepEqual(payload, {
    direction: 'en-ru',
    text: 'hey you',
    model: 'qwen3.7-max',
    action: 'translate',
  });
});

test('frontend en-ru payload rejects style actions', () => {
  assert.throws(
    () => buildTranslateRequest({ direction: 'en-ru', text: 'hey you', model: 'qwen3.7-max', action: 'bolder' }),
    /Only translate action is available/,
  );
});
