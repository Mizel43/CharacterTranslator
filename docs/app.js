const STORAGE = {
  settings: 'qct.settings.v1',
  profiles: 'qct.profiles.v1',
  selectedProfile: 'qct.selectedProfile.v1',
  ui: 'qct.ui.v2',
};

const fallbackStyleConfig = {
  schemaVersion: 2,
  controls: {
    slang: { label: 'Сленг', levels: [{ value: 1, name: 'Легкий', tooltip: 'Легкий разговорный стиль.' }] },
    flirt: { label: 'Флирт', levels: [{ value: 0, name: 'Нет', tooltip: 'Без флирта.' }] },
    vulgarity: { label: 'Вульгарность', levels: [{ value: 0, name: 'Чисто', tooltip: 'Без грубости.' }] },
    sexualTension: { label: 'Сексуальный намек', levels: [{ value: 0, name: 'Нет', tooltip: 'Без сексуального подтекста.' }] },
    directness: { label: 'Прямота', levels: [{ value: 2, name: 'Нормально', tooltip: 'Естественная прямота.' }] },
  },
  presets: {
    casual_dm: { label: 'Casual DM', controls: { slang: 2, flirt: 1, vulgarity: 0, sexualTension: 0, directness: 2 } },
  },
};

const defaultProfiles = [
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
      'don’t get too confident now',
      'that made me smile a little',
      'you know exactly what you’re doing',
      'come on, say it like you mean it',
      'I’m listening',
      'that’s bold of you',
    ],
    preferredPhrases: [],
    bannedPhrases: ["m'lady", 'yass queen'],
    lowercase: true,
    emojiLevel: 1,
    messageLength: 'short',
  },
];

const CONTROL_IDS = ['slang', 'flirt', 'vulgarity', 'sexualTension', 'directness'];
const $ = (selector) => document.querySelector(selector);
const elements = {
  profileSelect: $('#profileSelect'),
  profileSummary: $('#profileSummary'),
  sourceText: $('#sourceText'),
  charCount: $('#charCount'),
  preset: $('#presetSelect'),
  presetDirty: $('#presetDirty'),
  priority: $('#prioritySelect'),
  model: $('#modelSelect'),
  translate: $('#translateButton'),
  resultCard: $('#resultCard'),
  resultText: $('#resultText'),
  resultModel: $('#resultModel'),
  messageBox: $('#messageBox'),
  connectionDot: $('#connectionDot'),
  connectionText: $('#connectionText'),
  settingsDialog: $('#settingsDialog'),
  profileDialog: $('#profileDialog'),
};

let styleConfig = fallbackStyleConfig;
let settings = loadJson(STORAGE.settings, { gatewayUrl: '', accessToken: '' });
let profiles = migrateProfiles(loadJson(STORAGE.profiles, defaultProfiles));
let selectedProfileId = localStorage.getItem(STORAGE.selectedProfile) || profiles[0]?.id;
let ui = loadJson(STORAGE.ui, { schemaVersion: 2, presetId: 'casual_dm', priority: 'settings' });
let lastRequest = null;
let previousOutputs = [];
let controlsDirty = false;

function loadJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : structuredClone(fallback);
  } catch {
    return structuredClone(fallback);
  }
}

function migrateProfiles(value) {
  const items = Array.isArray(value) && value.length ? value : structuredClone(defaultProfiles);
  const migrated = items.map((profile) => ({
    ...profile,
    background: profile.background || '',
    relationshipToReader: profile.relationshipToReader || '',
    communicationStyle: profile.communicationStyle || '',
  }));
  if (!migrated.some((profile) => profile.templateId === 'la-creator-v1')) migrated.unshift(structuredClone(defaultProfiles[0]));
  return migrated;
}

function saveState() {
  localStorage.setItem(STORAGE.settings, JSON.stringify(settings));
  localStorage.setItem(STORAGE.profiles, JSON.stringify(profiles));
  localStorage.setItem(STORAGE.selectedProfile, selectedProfileId || '');
  localStorage.setItem(STORAGE.ui, JSON.stringify(ui));
}

async function loadStyleConfig() {
  try {
    const response = await fetch('./style-config.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    styleConfig = await response.json();
  } catch {
    styleConfig = fallbackStyleConfig;
  }
}

function normalizeGatewayUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function readBootstrapHash() {
  const raw = location.hash.replace(/^#/, '');
  if (!raw) return;
  const params = new URLSearchParams(raw);
  const gateway = params.get('gateway');
  const token = params.get('token');
  if (gateway && token) {
    settings.gatewayUrl = normalizeGatewayUrl(gateway);
    settings.accessToken = token;
    saveState();
    history.replaceState(null, '', `${location.pathname}${location.search}`);
    showMessage('Подключение сохранено. Проверяю Qwen...');
  }
}

function currentProfile() {
  return profiles.find((profile) => profile.id === selectedProfileId) || profiles[0];
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = String(value ?? '');
  return div.innerHTML;
}

function renderProfiles() {
  if (!profiles.length) profiles = structuredClone(defaultProfiles);
  if (!profiles.some((profile) => profile.id === selectedProfileId)) selectedProfileId = profiles[0].id;
  elements.profileSelect.innerHTML = '';
  for (const profile of profiles) {
    const option = document.createElement('option');
    option.value = profile.id;
    option.textContent = profile.name;
    option.selected = profile.id === selectedProfileId;
    elements.profileSelect.append(option);
  }
  renderProfileSummary();
  saveState();
}

function renderProfileSummary() {
  const profile = currentProfile();
  if (!profile) return;
  elements.profileSummary.innerHTML = `
    <strong>${escapeHtml(profile.name)}, ${profile.age}</strong><br>
    ${escapeHtml(profile.region || 'США')} · ${escapeHtml(profile.genderVoice || 'естественный голос')}<br>
    ${escapeHtml(profile.personality || 'Характер не указан')}<br>
    <small>${profile.examples?.length || 0} примеров речи</small>`;
}

function renderPresets() {
  elements.preset.innerHTML = '';
  for (const [id, preset] of Object.entries(styleConfig.presets)) {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = preset.label;
    elements.preset.append(option);
  }
  if (!styleConfig.presets[ui.presetId]) ui.presetId = Object.keys(styleConfig.presets)[0] || 'casual_dm';
  elements.preset.value = ui.presetId;
  elements.priority.value = ui.priority || 'settings';
  applyPreset(ui.presetId, false);
}

function levelFor(id, value) {
  const control = styleConfig.controls[id];
  return control?.levels?.find((level) => level.value === Number(value)) || control?.levels?.[0] || {};
}

function renderSliderLabels() {
  for (const id of CONTROL_IDS) {
    const control = styleConfig.controls[id];
    const label = $(`[data-control-label="${id}"]`);
    const help = $(`[data-control-help="${id}"]`);
    if (label && control) label.textContent = control.label;
    if (help) help.title = levelFor(id, $(`#${id}`).value).tooltip || '';
  }
}

function applyPreset(presetId, resetDirty = true) {
  const preset = styleConfig.presets[presetId] || Object.values(styleConfig.presets)[0];
  if (!preset) return;
  for (const id of CONTROL_IDS) $(`#${id}`).value = preset.controls?.[id] ?? 0;
  ui.presetId = presetId;
  controlsDirty = false;
  if (resetDirty) previousOutputs = [];
  updateSliderOutputs();
  saveState();
}

function showMessage(text, type = 'info') {
  elements.messageBox.textContent = text;
  elements.messageBox.classList.remove('hidden', 'error');
  if (type === 'error') elements.messageBox.classList.add('error');
}

function hideMessage() {
  elements.messageBox.classList.add('hidden');
}

function setBusy(busy, label = 'Перевожу...') {
  elements.translate.disabled = busy;
  elements.translate.textContent = busy ? label : 'Перевести';
  for (const button of document.querySelectorAll('#resultCard button')) button.disabled = busy;
}

function setConnection(state, text) {
  elements.connectionDot.classList.remove('ok', 'error');
  if (state) elements.connectionDot.classList.add(state);
  elements.connectionText.textContent = text;
}

async function api(path, options = {}) {
  if (!settings.gatewayUrl || !settings.accessToken) {
    throw new Error('Сначала подключите Gateway через QR-код или настройки.');
  }
  const response = await fetch(`${normalizeGatewayUrl(settings.gatewayUrl)}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${settings.accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

async function checkConnection(showSuccess = false) {
  if (!settings.gatewayUrl || !settings.accessToken) {
    setConnection('', 'Не подключено');
    return false;
  }
  setConnection('', 'Проверяю...');
  try {
    const health = await api('/api/health');
    if (!health.qwen) throw new Error(health.upstreamError || 'Qwen API не отвечает');
    setConnection('ok', 'Qwen подключен');
    if (showSuccess) showMessage('Gateway и Qwen работают.');
    await loadModels();
    return true;
  } catch (error) {
    setConnection('error', 'Нет связи');
    if (showSuccess) showMessage(error.message, 'error');
    return false;
  }
}

async function loadModels() {
  try {
    const data = await api('/api/models');
    const selected = elements.model.value;
    const models = Array.isArray(data.models) && data.models.length ? data.models : [data.defaultModel];
    elements.model.innerHTML = '';
    for (const model of models) {
      const option = document.createElement('option');
      option.value = model;
      option.textContent = model;
      elements.model.append(option);
    }
    elements.model.value = models.includes(selected) ? selected : data.defaultModel || models[0];
  } catch {
    // Keep built-in fallback options.
  }
}

function currentControls() {
  return Object.fromEntries(CONTROL_IDS.map((id) => [id, Number($(`#${id}`).value)]));
}

function collectRequest(action = 'translate') {
  const text = elements.sourceText.value.trim();
  if (!text) throw new Error('Введите фразу по-русски.');
  return {
    text,
    action,
    model: elements.model.value,
    presetId: elements.preset.value,
    priority: elements.priority.value,
    controls: currentControls(),
    previous: {
      output: elements.resultText.textContent || '',
      outputs: previousOutputs,
      controls: lastRequest?.controls || null,
    },
    profile: currentProfile(),
  };
}

async function translate(action = 'translate') {
  hideMessage();
  let request;
  try {
    request = collectRequest(action);
  } catch (error) {
    showMessage(error.message, 'error');
    return;
  }
  setBusy(true, action === 'alternative' ? 'Ищу другой вариант...' : 'Перевожу...');
  try {
    const result = await api('/api/translate', { method: 'POST', body: JSON.stringify(request) });
    elements.resultText.textContent = result.text;
    elements.resultModel.textContent = result.model;
    elements.resultCard.classList.remove('hidden');
    previousOutputs = [result.text, ...previousOutputs.filter((item) => item !== result.text)].slice(0, 5);
    lastRequest = { ...request, controls: request.controls };
    controlsDirty = false;
    updateSliderOutputs();
    setConnection('ok', 'Qwen подключен');
  } catch (error) {
    showMessage(error.message, 'error');
    setConnection('error', 'Ошибка');
  } finally {
    setBusy(false);
  }
}

function updateSliderOutputs() {
  for (const id of CONTROL_IDS) {
    const value = $(`#${id}`).value;
    const level = levelFor(id, value);
    $(`#${id}Value`).value = `${value} · ${level.name || ''}`.trim();
    const help = $(`[data-control-help="${id}"]`);
    if (help) help.title = level.tooltip || '';
  }
  elements.presetDirty?.classList.toggle('hidden', !controlsDirty);
}

function splitLines(value) {
  return String(value || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function openProfileDialog(profile = null, duplicate = false) {
  const source = profile ? structuredClone(profile) : {
    id: crypto.randomUUID(), name: '', age: 22, genderVoice: '', region: '', personality: '', lore: '', background: '',
    relationshipToReader: '', communicationStyle: '', examples: [], preferredPhrases: [], bannedPhrases: [],
    lowercase: false, emojiLevel: 1, messageLength: 'short',
  };
  if (duplicate) {
    source.id = crypto.randomUUID();
    source.name = `${source.name} - копия`;
  }
  $('#profileDialogTitle').textContent = profile && !duplicate ? 'Редактировать профиль' : 'Новый профиль';
  $('#profileId').value = source.id;
  $('#profileName').value = source.name;
  $('#profileAge').value = source.age;
  $('#profileGenderVoice').value = source.genderVoice || '';
  $('#profileRegion').value = source.region || '';
  $('#profilePersonality').value = source.personality || '';
  $('#profileLore').value = source.lore || '';
  $('#profileBackground').value = source.background || '';
  $('#profileRelationship').value = source.relationshipToReader || '';
  $('#profileCommunicationStyle').value = source.communicationStyle || '';
  $('#profileExamples').value = (source.examples || []).join('\n');
  $('#profilePreferred').value = (source.preferredPhrases || []).join('\n');
  $('#profileBanned').value = (source.bannedPhrases || []).join('\n');
  $('#profileEmoji').value = String(source.emojiLevel ?? 1);
  $('#profileLength').value = source.messageLength || 'short';
  $('#profileLowercase').checked = Boolean(source.lowercase);
  $('#deleteProfile').classList.toggle('hidden', !profile || duplicate);
  elements.profileDialog.showModal();
}

function saveProfileFromForm(event) {
  event.preventDefault();
  const age = Number($('#profileAge').value);
  if (age < 18) {
    showMessage('Возраст персонажа должен быть 18 или больше.', 'error');
    return;
  }
  const profile = {
    id: $('#profileId').value || crypto.randomUUID(),
    name: $('#profileName').value.trim(),
    age,
    genderVoice: $('#profileGenderVoice').value.trim(),
    region: $('#profileRegion').value.trim(),
    personality: $('#profilePersonality').value.trim(),
    lore: $('#profileLore').value.trim(),
    background: $('#profileBackground').value.trim(),
    relationshipToReader: $('#profileRelationship').value.trim(),
    communicationStyle: $('#profileCommunicationStyle').value.trim(),
    examples: splitLines($('#profileExamples').value),
    preferredPhrases: splitLines($('#profilePreferred').value),
    bannedPhrases: splitLines($('#profileBanned').value),
    emojiLevel: Number($('#profileEmoji').value),
    messageLength: $('#profileLength').value,
    lowercase: $('#profileLowercase').checked,
  };
  if (!profile.name) return;
  const index = profiles.findIndex((item) => item.id === profile.id);
  if (index >= 0) profiles[index] = profile;
  else profiles.push(profile);
  selectedProfileId = profile.id;
  renderProfiles();
  elements.profileDialog.close();
}

function deleteCurrentProfile() {
  const id = $('#profileId').value;
  if (profiles.length <= 1) {
    showMessage('Должен остаться хотя бы один профиль.', 'error');
    return;
  }
  if (!confirm('Удалить этот профиль?')) return;
  profiles = profiles.filter((profile) => profile.id !== id);
  selectedProfileId = profiles[0].id;
  renderProfiles();
  elements.profileDialog.close();
}

function exportProfiles() {
  const blob = new Blob([JSON.stringify({ version: 2, profiles }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `character-profiles-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

async function importProfiles(file) {
  try {
    const data = JSON.parse(await file.text());
    const imported = Array.isArray(data) ? data : data.profiles;
    if (!Array.isArray(imported) || !imported.length) throw new Error('В файле нет профилей.');
    for (const profile of imported) {
      if (!profile.name || Number(profile.age) < 18) throw new Error('Есть некорректный или несовершеннолетний профиль.');
      profile.id ||= crypto.randomUUID();
    }
    profiles = migrateProfiles(imported);
    selectedProfileId = profiles[0].id;
    renderProfiles();
    showMessage(`Импортировано профилей: ${profiles.length}.`);
  } catch (error) {
    showMessage(`Ошибка импорта: ${error.message}`, 'error');
  }
}

function bindEvents() {
  elements.profileSelect.addEventListener('change', () => {
    selectedProfileId = elements.profileSelect.value;
    renderProfileSummary();
    saveState();
  });
  $('#newProfile').addEventListener('click', () => openProfileDialog());
  $('#editProfile').addEventListener('click', () => openProfileDialog(currentProfile()));
  $('#duplicateProfile').addEventListener('click', () => openProfileDialog(currentProfile(), true));
  $('#profileForm').addEventListener('submit', saveProfileFromForm);
  $('#deleteProfile').addEventListener('click', deleteCurrentProfile);
  $('#exportProfiles').addEventListener('click', exportProfiles);
  $('#importProfiles').addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (file) importProfiles(file);
    event.target.value = '';
  });

  elements.preset.addEventListener('change', () => applyPreset(elements.preset.value));
  elements.priority.addEventListener('change', () => {
    ui.priority = elements.priority.value;
    saveState();
  });
  elements.sourceText.addEventListener('input', () => { elements.charCount.textContent = elements.sourceText.value.length; });
  elements.sourceText.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.key === 'Enter') translate('translate');
  });
  elements.translate.addEventListener('click', () => translate('translate'));
  $('#regenerateResult').addEventListener('click', () => translate('alternative'));
  $('#shorterResult').addEventListener('click', () => translate('shorter'));
  $('#softerResult').addEventListener('click', () => translate('softer'));
  $('#bolderResult').addEventListener('click', () => translate('bolder'));
  $('#moreVulgarResult').addEventListener('click', () => translate('more_vulgar'));
  $('#copyResult').addEventListener('click', async () => {
    await navigator.clipboard.writeText(elements.resultText.textContent);
    showMessage('Скопировано.');
  });

  for (const id of CONTROL_IDS) {
    $(`#${id}`).addEventListener('input', () => {
      controlsDirty = true;
      updateSliderOutputs();
    });
    $(`[data-control-help="${id}"]`)?.addEventListener('click', (event) => {
      event.currentTarget.classList.toggle('active');
    });
  }

  $('#openSettings').addEventListener('click', () => {
    $('#gatewayUrl').value = settings.gatewayUrl;
    $('#accessToken').value = settings.accessToken;
    elements.settingsDialog.showModal();
  });
  $('#connectionButton').addEventListener('click', () => checkConnection(true));
  $('#testConnection').addEventListener('click', async () => {
    const previous = structuredClone(settings);
    settings.gatewayUrl = normalizeGatewayUrl($('#gatewayUrl').value);
    settings.accessToken = $('#accessToken').value.trim();
    const ok = await checkConnection(true);
    if (!ok) settings = previous;
  });
  document.querySelectorAll('.dialog-close').forEach((button) => button.addEventListener('click', () => button.closest('dialog').close()));
  $('#settingsForm').addEventListener('submit', (event) => {
    event.preventDefault();
    settings.gatewayUrl = normalizeGatewayUrl($('#gatewayUrl').value);
    settings.accessToken = $('#accessToken').value.trim();
    saveState();
    elements.settingsDialog.close();
    checkConnection(true);
  });
}

async function init() {
  await loadStyleConfig();
  readBootstrapHash();
  renderProfiles();
  renderPresets();
  renderSliderLabels();
  bindEvents();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  await checkConnection(false);
}

init();
