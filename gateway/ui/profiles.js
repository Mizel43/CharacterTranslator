export function createDefaultProfiles() {
  return [
    {
      id: crypto.randomUUID(),
      templateId: 'la-creator-v1',
      name: 'Ashley',
      age: 22,
      genderVoice: 'young woman, casual and feminine',
      region: 'Los Angeles, California',
      personality: 'confident, playful, warm, slightly teasing',
      lore: 'Lifestyle creator who writes short, natural messages and dislikes forced slang.',
      background: 'LA-based creator who posts lifestyle, fashion, gym, and casual behind-the-scenes content.',
      relationshipToReader: 'adult follower or subscriber who likes playful private replies',
      communicationStyle: 'short, warm, direct, modern DM style; playful without sounding scripted',
      examples: [
        'okay but this is actually so cute',
        'not gonna lie, I kinda love it',
        'you really think so?',
        'you are trouble, huh?',
        'wait, that was smoother than I expected',
        'I might let you convince me',
        "don't get too confident now",
        'that made me smile a little',
        'you know exactly what you’re doing',
        'come on, say it like you mean it',
        "I'm listening",
        "that's bold of you",
      ],
      preferredPhrases: [],
      bannedPhrases: ["m'lady", 'yass queen'],
      lowercase: true,
      emojiLevel: 1,
      messageLength: 'short',
    },
  ];
}

export function migrateProfiles(value) {
  const defaults = createDefaultProfiles();
  const items = Array.isArray(value) && value.length ? value : defaults;
  const migrated = items.map((profile) => ({
    ...profile,
    id: profile.id || crypto.randomUUID(),
    templateId: profile.templateId || 'custom-v1',
    background: profile.background || '',
    relationshipToReader: profile.relationshipToReader || '',
    communicationStyle: profile.communicationStyle || '',
    preferredPhrases: Array.isArray(profile.preferredPhrases) ? profile.preferredPhrases : [],
    bannedPhrases: Array.isArray(profile.bannedPhrases) ? profile.bannedPhrases : [],
    examples: Array.isArray(profile.examples) ? profile.examples : [],
    lowercase: Boolean(profile.lowercase),
    emojiLevel: Number.isFinite(Number(profile.emojiLevel)) ? Number(profile.emojiLevel) : 1,
    messageLength: ['short', 'medium', 'long'].includes(profile.messageLength) ? profile.messageLength : 'short',
  }));

  if (!migrated.length) return defaults;
  if (!migrated.some((profile) => profile.templateId === 'la-creator-v1')) migrated.unshift(defaults[0]);
  return migrated;
}

export function createBlankProfile() {
  return {
    id: crypto.randomUUID(),
    name: '',
    age: 22,
    genderVoice: '',
    region: '',
    personality: '',
    lore: '',
    background: '',
    relationshipToReader: '',
    communicationStyle: '',
    examples: [],
    preferredPhrases: [],
    bannedPhrases: [],
    lowercase: false,
    emojiLevel: 1,
    messageLength: 'short',
  };
}

export function splitLines(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function prepareImportedProfiles(payload) {
  const rawProfiles = Array.isArray(payload) ? payload : payload?.profiles;
  if (!Array.isArray(rawProfiles) || !rawProfiles.length) {
    throw new Error('No profiles found in the imported file.');
  }

  const migrated = migrateProfiles(rawProfiles);
  for (const profile of migrated) {
    if (!profile.name || Number(profile.age) < 18) {
      throw new Error('Imported profiles must have a name and age 18+.');
    }
  }

  return migrated;
}
