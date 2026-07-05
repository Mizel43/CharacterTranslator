import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStylePlan, describeControlDelta, getPreset } from '../gateway/style-engine.js';
import { loadStyleConfig } from '../gateway/style-config.js';

test('every control level has a concrete instruction', () => {
  const config = loadStyleConfig();
  for (const control of Object.values(config.controls)) {
    assert.equal(control.levels.length, 5);
    for (const level of control.levels) {
      assert.equal(typeof level.instruction, 'string');
      assert.ok(level.instruction.length > 20);
      assert.equal(typeof level.tooltip, 'string');
    }
  }
});

test('preset returns expected controls and unknown preset falls back', () => {
  const config = loadStyleConfig();
  assert.equal(getPreset('bold_flirt', config).controls.flirt, 4);
  assert.equal(getPreset('missing', config).id, 'natural');
});

test('style plan includes interactions and priority differences', () => {
  const settings = buildStylePlan({
    presetId: 'vulgar_flirt',
    priority: 'settings',
    controls: { slang: 3, flirt: 3, vulgarity: 4, sexualTension: 3, directness: 3 },
  });
  const voice = buildStylePlan({
    presetId: 'vulgar_flirt',
    priority: 'voice',
    controls: { slang: 3, flirt: 3, vulgarity: 4, sexualTension: 3, directness: 3 },
  });
  assert.ok(settings.interactions.length >= 3);
  assert.notEqual(settings.styleDescription, voice.styleDescription);
});

test('control diff includes changed fields only', () => {
  assert.deepEqual(
    describeControlDelta({ flirt: 1, slang: 2 }, { flirt: 4, slang: 2 }),
    ['flirt 1 -> 4'],
  );
});
