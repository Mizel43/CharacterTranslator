import { buildStylePlan, describeControlDelta } from './style-engine.js';
import { loadStyleConfig } from './style-config.js';

export function buildMessages(input) {
  return input.direction === 'en-ru' ? buildEnRuMessages(input) : buildRuEnMessages(input);
}

export function buildRuEnMessages(input) {
  const config = loadStyleConfig();
  const stylePlan = buildStylePlan(input, config);
  const actionInstruction = config.actions?.[input.action] || config.actions.translate;
  const deltas = input.previous?.controls ? describeControlDelta(input.previous.controls, input.controls) : [];

  const examples = input.profile.examples.length
    ? input.profile.examples.map((example, index) => `${index + 1}. ${example}`).join('\n')
    : 'No examples supplied.';

  const preferred = input.profile.preferredPhrases.length ? input.profile.preferredPhrases.join(', ') : 'None.';
  const banned = input.profile.bannedPhrases.length ? input.profile.bannedPhrases.join(', ') : 'None.';
  const previousOutputs = input.previous.outputs.length
    ? input.previous.outputs.map((item, index) => `${index + 1}. ${item}`).join('\n')
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
Background: ${input.profile.background || 'Not specified.'}
Relationship to reader: ${input.profile.relationshipToReader || 'Not specified.'}
Communication style: ${input.profile.communicationStyle || 'Not specified.'}
Lowercase preference: ${input.profile.lowercase ? 'yes' : 'no'}
Emoji level: ${input.profile.emojiLevel}/3
Typical message length: ${input.profile.messageLength}
Preferred phrases: ${preferred}
Avoid these phrases: ${banned}

VOICE EXAMPLES
${examples}

STYLE ENGINE V2
${stylePlan.styleDescription}
Target length: ${stylePlan.preset.targetLength || input.profile.messageLength}
Revision instruction: ${actionInstruction}
Changed controls since previous result: ${deltas.length ? deltas.join(', ') : 'None.'}

PREVIOUS OUTPUTS TO AVOID
${previousOutputs}

RUSSIAN SOURCE
${input.text}

Return only one finished American English version.`.trim();

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

export function buildEnRuMessages(input) {
  const system = [
    'You are an expert translator of contemporary American English into natural contemporary Russian.',
    'Translate the complete message by meaning and communicative intent, not word-for-word.',
    'Correctly interpret casual American speech, contractions, idioms, phrasal verbs, texting language, internet slang, profanity, teasing, flirtation, sarcasm, irony, and sexual subtext.',
    'Write the Russian phrase that a native Russian speaker would naturally use to produce the same meaning, tone, relationship signal, and emotional effect.',
    'The message was written by another person. Never rewrite it in the voice of the user\'s character and never use character, preset, priority, or ToneShift settings.',
    'Preserve the source meaning. Do not soften, intensify, censor, embellish, explain, moralize, or add context.',
    'Preserve names, usernames, links, product names, emojis, line breaks, and intentional ambiguity where possible. Use the entire supplied message as context.',
    'Return exactly one finished Russian translation. Return no prefix, quotation marks, notes, alternatives, transliteration, or explanation.',
  ].join(' ');

  const user = [
    'English message:',
    '',
    input.text,
    '',
    'Return one natural Russian translation only.',
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

export function cleanModelOutput(raw) {
  let text = String(raw ?? '').trim();
  if (!text) throw new Error('Qwen returned an empty response.');

  text = text.replace(/^```[\w-]*\s*/i, '').replace(/\s*```$/, '').trim();

  const wrapperPrefixes = [
    /^(translation|english|russian|result|answer)\s*:\s*/i,
    /^(перевод|русский|результат|ответ)\s*:\s*/i,
  ];
  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of wrapperPrefixes) {
      if (pattern.test(text)) {
        text = text.replace(pattern, '').trim();
        changed = true;
      }
    }
  }

  const quotePairs = [
    ['вЂњ', 'вЂќ'],
    ['"', '"'],
    ['“', '”'],
    ['«', '»'],
  ];
  for (const [left, right] of quotePairs) {
    if (text.startsWith(left) && text.endsWith(right)) {
      text = text.slice(left.length, text.length - right.length).trim();
      break;
    }
  }

  return text;
}
