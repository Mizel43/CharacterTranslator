import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMessages, cleanModelOutput, normalizeRequest } from '../gateway/prompt.js';

test('normalizes a valid adult character request', () => {
  const input = normalizeRequest({
    text: 'Ты реально так думаешь?',
    profile: { name: 'Ashley', age: 22, examples: ['you really think so?'] },
    controls: { flirt: 2, slang: 1 },
  }, 4000);
  assert.equal(input.profile.age, 22);
  assert.equal(input.controls.flirt, 2);
  assert.match(buildMessages(input)[1].content, /Ashley/);
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
