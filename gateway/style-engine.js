import { loadStyleConfig } from './style-config.js';

export const CONTROL_IDS = ['slang', 'flirt', 'vulgarity', 'sexualTension', 'directness'];

function ruleMatches(rule, controls) {
  const when = rule.when || {};
  return Object.entries(when).every(([key, expected]) => {
    const match = key.match(/^(.*?)(Min|Max)?$/);
    const id = match?.[1];
    const op = match?.[2] || 'Eq';
    const value = controls[id];
    if (typeof value !== 'number') return false;
    if (op === 'Min') return value >= expected;
    if (op === 'Max') return value <= expected;
    return value === expected;
  });
}

export function getPreset(presetId, config = loadStyleConfig()) {
  return config.presets[presetId] ? { id: presetId, ...config.presets[presetId] } : { id: 'natural', ...config.presets.natural };
}

export function mergePresetControls(presetId, controls = {}, config = loadStyleConfig()) {
  const preset = getPreset(presetId, config);
  return Object.fromEntries(CONTROL_IDS.map((id) => [id, controls[id] ?? preset.controls[id] ?? 0]));
}

export function buildStylePlan(input, config = loadStyleConfig()) {
  const preset = getPreset(input.presetId, config);
  const controls = mergePresetControls(preset.id, input.controls, config);
  const levelInstructions = CONTROL_IDS.map((id) => {
    const control = config.controls[id];
    const level = control.levels.find((item) => item.value === controls[id]) || control.levels[0];
    return `${control.label}: ${level.name} (${controls[id]}/4). ${level.instruction}`;
  });
  const interactions = (config.interactionRules || [])
    .filter((rule) => ruleMatches(rule, controls))
    .map((rule) => rule.instruction);
  const priorityInstruction = input.priority === 'voice'
    ? 'If character voice and message settings conflict, preserve the character voice first while still reflecting the settings.'
    : 'If character voice and message settings conflict, prioritize the current message settings.';

  return {
    preset,
    controls,
    styleDescription: [
      `Preset: ${preset.label}. Context: ${preset.context}. Goal: ${preset.goal}. Base tone: ${preset.tone}.`,
      `Priority: ${input.priority}. ${priorityInstruction}`,
      'Control instructions:',
      ...levelInstructions,
      interactions.length ? 'Interaction rules:' : '',
      ...interactions,
    ].filter(Boolean).join('\n'),
    interactions,
  };
}

export function describeControlDelta(previousControls = {}, controls = {}) {
  return CONTROL_IDS
    .filter((id) => typeof previousControls[id] === 'number' && previousControls[id] !== controls[id])
    .map((id) => `${id} ${previousControls[id]} -> ${controls[id]}`);
}
