export function buildTranslateRequest({
  direction,
  text,
  model,
  action = 'translate',
  presetId,
  priority,
  controls,
  previous,
  profile,
}) {
  const payload = {
    direction,
    text: String(text ?? '').trim(),
    model,
    action: action || 'translate',
  };

  if (direction === 'en-ru') {
    if (payload.action !== 'translate') {
      throw new Error('Only translate action is available in English-to-Russian mode.');
    }

    return payload;
  }

  return {
    ...payload,
    presetId,
    priority,
    controls,
    previous,
    profile,
  };
}
