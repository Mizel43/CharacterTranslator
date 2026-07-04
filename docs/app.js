const STORAGE = {
  settings: 'qct.settings.v1',
  profiles: 'qct.profiles.v1',
  selectedProfile: 'qct.selectedProfile.v1',
  ui: 'qct.ui.v1',
};

const defaultProfiles = [
  {
    id: crypto.randomUUID(),
    name: 'Ashley',
    age: 22,
    genderVoice: 'young woman, casual and feminine',
    region: 'Los Angeles, California',
    personality: 'confident, playful, warm, slightly teasing',
    lore: 'Lifestyle creator who writes short, natural messages and dislikes forced slang.',
    examples: [
      'okay but this is actually so cute',
      'not gonna lie, I kinda love it',
      'you really think so?',
    ],
    preferredPhrases: [],
    bannedPhrases: ["m'lady", 'yass queen'],
    lowercase: true,
    emojiLevel: 1,
    messageLength: 'short',
  },
];

const $ = (selector) => document.querySelector(selector);
const elements = {
  profileSelect: $('#profileSelect'),
  profileSummary: $('#profileSummary'),
  sourceText: $('#sourceText'),
  charCount: $('#charCount'),
  context: $('#contextSelect'),
  tone: $('#toneSelect'),
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

let settings = loadJson(STORAGE.settings, { gatewayUrl: '', accessToken: '' });
let profiles = loadJson(STORAGE.profiles, defaultProfiles);
let selectedProfileId = localStorage.getItem(STORAGE.selectedProfile) || profiles[0]?.id;
let lastRequest = null;

function loadJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : structuredClone(fallback);
  } catch {
    return structuredClone(fallback);
  }
}

function saveState() {
  localStorage.setItem(STORAGE.settings, JSON.stringify(settings));
  localStorage.setItem(STORAGE.profiles, JSON.stringify(profiles));
  localStorage.setItem(STORAGE.selectedProfile, selectedProfileId || '');
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
    showMessage('Подключение сохранено. Проверяю Qwen…');
  }
}

function currentProfile() {
  return profiles.find((profile) => profile.id === selectedProfileId) || profiles[0];
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

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = String(value ?? '');
  return div.innerHTML;
}

function showMessage(text, type = 'info') {
  elements.messageBox.textContent = text;
  elements.messageBox.classList.remove('hidden', 'error');
  if (type === 'error') elements.messageBox.classList.add('error');
}

function hideMessage() {
  elements.messageBox.classList.add('hidden');
}

function setBusy(busy, label = 'Перевожу…') {
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
  setConnection('', 'Проверяю…');
  try {
    const health = await api('/api/health');
    if (!health.qwen) throw new Error(health.upstreamError || 'Qwen API не отвечает');
    setConnection('ok', 'Qwen подключён');
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

function collectRequest(action = 'translate') {
  const text = elements.sourceText.value.trim();
  if (!text) throw new Error('Введите фразу по-русски.');
  return {
    text,
    action,
    model: elements.model.value,
    context: elements.context.value,
    tone: elements.tone.value,
    controls: {
      slang: Number($('#slang').value),
      flirt: Number($('#flirt').value),
      vulgarity: Number($('#vulgarity').value),
      sexualTension: Number($('#sexualTension').value),
      directness: Number($('#directness').value),
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
  lastRequest = request;
  setBusy(true, action === 'regenerate' ? 'Ищу другой вариант…' : 'Перевожу…');
  try {
    const result = await api('/api/translate', { method: 'POST', body: JSON.stringify(request) });
    elements.resultText.textContent = result.text;
    elements.resultModel.textContent = result.model;
    elements.resultCard.classList.remove('hidden');
    setConnection('ok', 'Qwen подключён');
  } catch (error) {
    showMessage(error.message, 'error');
    setConnection('error', 'Ошибка');
  } finally {
    setBusy(false);
  }
}

function updateSliderOutputs() {
  for (const id of ['slang', 'flirt', 'vulgarity', 'sexualTension', 'directness']) {
    $(`#${id}Value`).value = $(`#${id}`).value;
  }
}

function splitLines(value) {
  return String(value || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function openProfileDialog(profile = null, duplicate = false) {
  const source = profile ? structuredClone(profile) : {
    id: crypto.randomUUID(), name: '', age: 22, genderVoice: '', region: '', personality: '', lore: '', examples: [],
    preferredPhrases: [], bannedPhrases: [], lowercase: false, emojiLevel: 1, messageLength: 'short',
  };
  if (duplicate) {
    source.id = crypto.randomUUID();
    source.name = `${source.name} — копия`;
  }
  $('#profileDialogTitle').textContent = profile && !duplicate ? 'Редактировать профиль' : 'Новый профиль';
  $('#profileId').value = source.id;
  $('#profileName').value = source.name;
  $('#profileAge').value = source.age;
  $('#profileGenderVoice').value = source.genderVoice || '';
  $('#profileRegion').value = source.region || '';
  $('#profilePersonality').value = source.personality || '';
  $('#profileLore').value = source.lore || '';
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
  const blob = new Blob([JSON.stringify({ version: 1, profiles }, null, 2)], { type: 'application/json' });
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
    profiles = imported;
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

  elements.sourceText.addEventListener('input', () => { elements.charCount.textContent = elements.sourceText.value.length; });
  elements.sourceText.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.key === 'Enter') translate('translate');
  });
  elements.translate.addEventListener('click', () => translate('translate'));
  $('#regenerateResult').addEventListener('click', () => translate('regenerate'));
  $('#softerResult').addEventListener('click', () => translate('softer'));
  $('#bolderResult').addEventListener('click', () => translate('bolder'));
  $('#copyResult').addEventListener('click', async () => {
    await navigator.clipboard.writeText(elements.resultText.textContent);
    showMessage('Скопировано.');
  });

  for (const id of ['slang', 'flirt', 'vulgarity', 'sexualTension', 'directness']) {
    $(`#${id}`).addEventListener('input', updateSliderOutputs);
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
  readBootstrapHash();
  renderProfiles();
  updateSliderOutputs();
  bindEvents();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  await checkConnection(false);
}

init();
