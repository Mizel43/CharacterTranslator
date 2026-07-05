import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMessages, cleanModelOutput } from '../gateway/prompt.js';
import { normalizeRequest } from '../gateway/request.js';

test('ru-en prompt keeps character and style engine sections', () => {
  const input = normalizeRequest({
    text: 'Ты реально так думаешь?',
    profile: { name: 'Ashley', age: 22, examples: ['you really think so?'] },
    controls: { flirt: 2, slang: 1 },
    presetId: 'casual_dm',
  }, 4000);

  const [system, user] = buildMessages(input);

  assert.match(system.content, /American English dialogue adapter/);
  assert.match(user.content, /CHARACTER/);
  assert.match(user.content, /STYLE ENGINE V2/);
  assert.match(user.content, /Ashley/);
});

test('en-ru prompt excludes character voice settings', () => {
  const input = normalizeRequest({
    direction: 'en-ru',
    text: 'You really know how to get under my skin.',
    model: 'qwen3.7-max',
    profile: { name: 'Ashley', age: 14 },
  }, 4000);

  const [system, user] = buildMessages(input);

  assert.match(system.content, /natural contemporary Russian/i);
  assert.doesNotMatch(user.content, /CHARACTER/);
  assert.doesNotMatch(user.content, /STYLE ENGINE/i);
  assert.doesNotMatch(user.content, /VOICE EXAMPLES/i);
  assert.doesNotMatch(user.content, /Ashley/);
  assert.doesNotMatch(system.content, /literal translation|translate literally/i);
});

test('en-ru prompt demands preserving slang profanity flirtation and ambiguity', () => {
  const input = normalizeRequest({
    direction: 'en-ru',
    text: 'You really know how to get under my skin.',
  }, 4000);

  const [system] = buildMessages(input);

  assert.match(system.content, /communicative intent/i);
  assert.match(system.content, /not word-for-word/i);
  assert.match(system.content, /slang/i);
  assert.match(system.content, /profanity/i);
  assert.match(system.content, /flirtation/i);
  assert.match(system.content, /ambiguity/i);
  assert.match(system.content, /ToneShift/i);
  assert.match(system.content, /no prefix|no .*explanation/i);
});

test('cleanModelOutput removes English and Russian wrappers and code fences', () => {
  assert.equal(cleanModelOutput('Translation: "you really think so?"'), 'you really think so?');
  assert.equal(cleanModelOutput('```text\nthat is fine\n```'), 'that is fine');
  assert.equal(cleanModelOutput('Перевод: привет'), 'привет');
});
