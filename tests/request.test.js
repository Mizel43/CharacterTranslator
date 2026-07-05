import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeRequest } from '../gateway/request.js';

test('ru-en stays backward compatible when direction is omitted', () => {
  const input = normalizeRequest({
    text: 'Привет',
    profile: { age: 22 },
    presetId: 'casual_dm',
  }, 4000);

  assert.equal(input.direction, 'ru-en');
  assert.equal(input.profile.age, 22);
  assert.equal(input.presetId, 'casual_dm');
});

test('ru-en keeps regenerate alias and apply_settings behavior', () => {
  const alternative = normalizeRequest({
    text: 'Привет',
    action: 'regenerate',
    presetId: 'missing',
    previous: {
      output: 'hey',
      outputs: ['hey', 'hi', 'hello', 'yo', 'sup', 'extra'],
      controls: { flirt: 1 },
    },
    controls: { flirt: 4 },
    profile: { age: 22 },
  }, 4000);
  assert.equal(alternative.action, 'alternative');
  assert.equal(alternative.presetId, 'natural');
  assert.equal(alternative.previous.outputs.length, 5);

  const applySettings = normalizeRequest({
    text: 'Привет',
    action: 'translate',
    presetId: 'casual_dm',
    controls: { flirt: 4 },
    previous: { output: 'hey', controls: { slang: 2, flirt: 1, vulgarity: 0, sexualTension: 0, directness: 2 } },
    profile: { age: 22 },
  }, 4000);
  assert.equal(applySettings.action, 'apply_settings');
});

test('en-ru accepts requests without profile and without age validation', () => {
  const input = normalizeRequest({
    direction: 'en-ru',
    text: 'You really know how to get under my skin.',
    profile: { age: 14 },
  }, 4000);

  assert.equal(input.direction, 'en-ru');
  assert.equal(input.action, 'translate');
  assert.equal(input.text, 'You really know how to get under my skin.');
  assert.equal(Object.hasOwn(input, 'profile'), false);
  assert.equal(Object.hasOwn(input, 'controls'), false);
  assert.equal(Object.hasOwn(input, 'presetId'), false);
  assert.equal(Object.hasOwn(input, 'previous'), false);
});

test('en-ru rejects non-translate actions with a 400', () => {
  assert.throws(
    () => normalizeRequest({ direction: 'en-ru', text: 'Hello there', action: 'bolder' }, 4000),
    (error) => error.statusCode === 400 && /Only the "translate" action/.test(error.message),
  );
});

test('en-ru rejects empty English text with a 400', () => {
  assert.throws(
    () => normalizeRequest({ direction: 'en-ru', text: '   ' }, 4000),
    (error) => error.statusCode === 400 && /English source text/.test(error.message),
  );
});
