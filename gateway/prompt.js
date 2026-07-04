const contextLabels = {
  chat: 'private casual chat',
  instagram_dm: 'Instagram direct message',
  instagram_caption: 'Instagram caption',
  comment: 'social media comment',
  dating: 'dating chat',
  friend: 'chat with a close friend',
  partner: 'chat with an adult romantic partner',
  follower: 'reply to a follower',
};

const toneLabels = {
  natural: 'natural and relaxed',
  friendly: 'friendly',
  playful: 'playful',
  flirty: 'flirty',
  confident: 'confident',
  bold: 'bold and teasing',
  sarcastic: 'lightly sarcastic',
};

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function cleanArray(values, maxItems = 12, maxLength = 240) {
  if (!Array.isArray(values)) return [];
  return values
    .map((item) => String(item).trim().slice(0, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function cleanString(value, maxLength = 500) {
  return String(value ?? '').trim().slice(0, maxLength);
}

export function normalizeRequest(body, maxInputChars) {
  const text = cleanString(body?.text, maxInputChars);
  if (!text) throw new Error('Введите текст для перевода.');

  const profile = body?.profile && typeof body.profile === 'object' ? body.profile : {};
  const rawAge = Number(profile.age ?? 18);
  if (!Number.isFinite(rawAge) || rawAge < 18) {
    throw new Error('В MVP поддерживаются только взрослые персонажи 18+.');
  }
  const age = clamp(rawAge, 18, 99);

  return {
    text,
    model: cleanString(body?.model, 100),
    action: ['translate', 'regenerate', 'softer', 'bolder'].includes(body?.action)
      ? body.action
      : 'translate',
    context: contextLabels[body?.context] || contextLabels.chat,
    tone: toneLabels[body?.tone] || toneLabels.natural,
    controls: {
      slang: clamp(body?.controls?.slang, 0, 4),
      flirt: clamp(body?.controls?.flirt, 0, 4),
      vulgarity: clamp(body?.controls?.vulgarity, 0, 4),
      sexualTension: clamp(body?.controls?.sexualTension, 0, 4),
      directness: clamp(body?.controls?.directness, 0, 4),
    },
    profile: {
      name: cleanString(profile.name || 'Character', 80),
      age,
      genderVoice: cleanString(profile.genderVoice || 'natural adult voice', 120),
      region: cleanString(profile.region || 'United States', 120),
      personality: cleanString(profile.personality, 500),
      lore: cleanString(profile.lore, 1500),
      preferredPhrases: cleanArray(profile.preferredPhrases),
      bannedPhrases: cleanArray(profile.bannedPhrases),
      examples: cleanArray(profile.examples, 16, 400),
      lowercase: Boolean(profile.lowercase),
      emojiLevel: clamp(profile.emojiLevel, 0, 3),
      messageLength: ['short', 'medium', 'long'].includes(profile.messageLength)
        ? profile.messageLength
        : 'short',
    },
  };
}

export function buildMessages(input) {
  const actionInstruction = {
    translate: 'Produce the best single translation.',
    regenerate: 'Produce a fresh alternative, not merely a punctuation change.',
    softer: 'Make the wording somewhat softer and less explicit while preserving the intent.',
    bolder: 'Make the wording somewhat bolder and more teasing, but do not invent new acts or facts.',
  }[input.action];

  const examples = input.profile.examples.length
    ? input.profile.examples.map((example, index) => `${index + 1}. ${example}`).join('\n')
    : 'No examples supplied.';

  const preferred = input.profile.preferredPhrases.length
    ? input.profile.preferredPhrases.join(', ')
    : 'None.';
  const banned = input.profile.bannedPhrases.length
    ? input.profile.bannedPhrases.join(', ')
    : 'None.';

  const system = [
    'You are a native contemporary American English dialogue adapter.',
    'Rewrite Russian messages into natural American English that sounds written by the specified adult character.',
    'All characters and implied conversation partners are adults aged 18 or older.',
    'The task may include consensual adult flirting, vulgar wording, or erotic tension. Translate faithfully without moral commentary, but never add sexual details that are absent from the source.',
    'Preserve intent, emotional direction, ambiguity, and power dynamics. Do not translate word-for-word when a native speaker would phrase it differently.',
    'Avoid forced, outdated, excessive, or internet-stereotype slang.',
    'Do not explain the translation. Return only the finished English text, with no quotation marks and no prefix.',
  ].join(' ');

  const user = `
CHARACTER
Name: ${input.profile.name}
Age: ${input.profile.age}
Voice/gender presentation: ${input.profile.genderVoice}
US region: ${input.profile.region}
Personality: ${input.profile.personality || 'Not specified.'}
Lore: ${input.profile.lore || 'Not specified.'}
Lowercase preference: ${input.profile.lowercase ? 'yes' : 'no'}
Emoji level: ${input.profile.emojiLevel}/3
Typical message length: ${input.profile.messageLength}
Preferred phrases: ${preferred}
Avoid these phrases: ${banned}

VOICE EXAMPLES
${examples}

CURRENT MESSAGE SETTINGS
Context: ${input.context}
Tone: ${input.tone}
Slang: ${input.controls.slang}/4
Flirt: ${input.controls.flirt}/4
Vulgarity: ${input.controls.vulgarity}/4
Sexual tension: ${input.controls.sexualTension}/4
Directness: ${input.controls.directness}/4
Revision instruction: ${actionInstruction}

RUSSIAN SOURCE
${input.text}

Return only one finished American English version.`.trim();

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

export function cleanModelOutput(raw) {
  let text = String(raw ?? '').trim();
  if (!text) throw new Error('Qwen вернул пустой ответ.');

  text = text.replace(/^```(?:text|english)?\s*/i, '').replace(/\s*```$/, '').trim();
  text = text.replace(/^(translation|english|result|answer)\s*:\s*/i, '').trim();

  if ((text.startsWith('“') && text.endsWith('”')) || (text.startsWith('"') && text.endsWith('"'))) {
    text = text.slice(1, -1).trim();
  }

  return text;
}
