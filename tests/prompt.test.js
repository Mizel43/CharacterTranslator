import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMessages, cleanModelOutput } from '../gateway/prompt.js';
import { normalizeRequest } from '../gateway/request.js';

test('normalizes a valid adult character request', () => {
  const input = normalizeRequest({
    text: 'Ты реально так думаешь?',
    profile: { name: 'Ashley', age: 22, examples: ['you really think so?'] },
    controls: { flirt: 2, slang: 1 },
    presetId: 'casual_dm',
  }, 4000);
  assert.equal(input.profile.age, 22);
  assert.equal(input.controls.flirt, 2);
  assert.match(buildMessages(input)[1].content, /Ashley/);
  assert.match(buildMessages(input)[1].content, /STYLE ENGINE V2/);
});

test('rejects an empty source', () => {
  assert.throws(() => normalizeRequest({ text: '   ', profile: { age: 22 } }, 4000));
});

test('rejects a profile younger than 18', () => {
  assert.throws(() => normalizeRequest({ text: 'Привет', profile: { age: 14 } }, 4000), /18\+/);
});

test('cleans common model wrappers', () => {
  assert.equal(cleanModelOutput('Translation: “you really think so?”'), 'you really think so?');
  assert.equal(cleanModelOutput('```text\nthat’s kinda hot\n```'), 'that’s kinda hot');
});

test('normalizes v2 action, previous outputs, and preset fallback', () => {
  const input = normalizeRequest({
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
  assert.equal(input.action, 'alternative');
  assert.equal(input.presetId, 'natural');
  assert.equal(input.previous.outputs.length, 5);
  assert.equal(input.controls.flirt, 4);
});

test('uses apply_settings when translate follows changed controls', () => {
  const input = normalizeRequest({
    text: 'Привет',
    action: 'translate',
    presetId: 'casual_dm',
    controls: { flirt: 4 },
    previous: { output: 'hey', controls: { slang: 2, flirt: 1, vulgarity: 0, sexualTension: 0, directness: 2 } },
    profile: { age: 22 },
  }, 4000);
  assert.equal(input.action, 'apply_settings');
});
