import test from 'node:test';
import assert from 'node:assert/strict';

import { createTranslateService } from '../gateway/translate-service.js';

function createService(responses) {
  const calls = [];
  const queue = [...responses];
  const service = createTranslateService({
    config: {
      defaultModel: 'qwen3.7-max',
      maxInputChars: 4000,
    },
    qwenClient: {
      async callChatCompletion(payload) {
        calls.push(payload);
        const next = queue.shift();
        if (!next) throw new Error('No mocked Qwen response left.');
        return typeof next === 'function' ? next(payload) : next;
      },
    },
    logger: () => {},
  });

  return { service, calls };
}

test('ru-en still uses the old validation and correction branch', async () => {
  const { service, calls } = createService([
    { text: 'Translation: you really think so?', usage: null },
    { text: 'you really think so?', usage: null },
  ]);

  const result = await service.translate({
    text: 'Ты реально так думаешь?',
    profile: { age: 22 },
    presetId: 'casual_dm',
  });

  assert.equal(calls.length, 2);
  assert.match(calls[1].messages.at(-1).content, /Revise the draft once/);
  assert.equal(result.meta.direction, 'ru-en');
  assert.equal(result.meta.corrected, true);
});

test('en-ru uses low-but-nonzero temperature and larger max_tokens', async () => {
  const { service, calls } = createService([
    { text: 'Ты умеешь действовать мне на нервы.', usage: null },
  ]);

  const result = await service.translate({
    direction: 'en-ru',
    text: 'You really know how to get under my skin.',
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].temperature, 0.22);
  assert.equal(calls[0].max_tokens, 1400);
  assert.equal(result.meta.direction, 'en-ru');
  assert.equal(result.meta.corrected, false);
});

test('en-ru explanation response triggers at most one correction', async () => {
  const { service, calls } = createService([
    { text: 'Here is the Russian translation: Ты умеешь действовать мне на нервы.', usage: null },
    { text: 'Ты умеешь действовать мне на нервы.', usage: null },
  ]);

  const result = await service.translate({
    direction: 'en-ru',
    text: 'You really know how to get under my skin.',
  });

  assert.equal(calls.length, 2);
  assert.match(calls[1].messages.at(-1).content, /natural Russian translation by meaning/i);
  assert.equal(result.meta.direction, 'en-ru');
  assert.equal(result.meta.corrected, true);
});

test('en-ru obvious calque triggers one correction pass', async () => {
  const { service, calls } = createService([
    { text: 'привет, ты', usage: null },
    { text: 'Привет', usage: null },
  ]);

  const result = await service.translate({
    direction: 'en-ru',
    text: 'hey you',
  });

  assert.equal(calls.length, 2);
  assert.match(calls[1].messages.at(-1).content, /Remove literal English calques/i);
  assert.equal(result.text, 'Привет');
  assert.equal(result.meta.corrected, true);
});
