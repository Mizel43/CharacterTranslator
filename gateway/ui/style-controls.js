export const CONTROL_IDS = ['slang', 'flirt', 'vulgarity', 'sexualTension', 'directness'];

export function levelFor(styleConfig, id, value) {
  const control = styleConfig.controls[id];
  return control?.levels?.find((level) => level.value === Number(value)) || control?.levels?.[0] || {};
}

export function applyPresetToInputs(styleConfig, presetId) {
  const preset = styleConfig.presets[presetId] || Object.values(styleConfig.presets)[0];
  if (!preset) return;

  for (const id of CONTROL_IDS) {
    const input = document.getElementById(id);
    if (input) input.value = preset.controls?.[id] ?? 0;
  }
}

export function readControls() {
  return Object.fromEntries(CONTROL_IDS.map((id) => [id, Number(document.getElementById(id)?.value || 0)]));
}

export function syncControlLabels(styleConfig) {
  for (const id of CONTROL_IDS) {
    const control = styleConfig.controls[id];
    const label = document.querySelector(`[data-control-label="${id}"]`);
    const help = document.querySelector(`[data-control-help="${id}"]`);

    if (label && control) label.textContent = control.label;
    if (help) help.title = levelFor(styleConfig, id, document.getElementById(id)?.value).tooltip || '';
  }
}

export function updateControlOutputs(styleConfig) {
  for (const id of CONTROL_IDS) {
    const input = document.getElementById(id);
    const output = document.getElementById(`${id}Value`);
    const help = document.querySelector(`[data-control-help="${id}"]`);
    if (!input || !output) continue;

    const level = levelFor(styleConfig, id, input.value);
    output.value = `${input.value} • ${level.name || ''}`.trim();
    if (help) help.title = level.tooltip || '';
  }
}
