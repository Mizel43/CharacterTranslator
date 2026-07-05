import { apiFetch, clearSessionArtifacts, hydrateCsrfToken } from './api.js';
import { createBlankProfile, prepareImportedProfiles, splitLines } from './profiles.js';
import { loadProfiles, loadSelectedProfileId, loadUiState, purgeLegacySecrets, saveProfiles, saveSelectedProfileId, saveUiState } from './state.js';
import { CONTROL_IDS, applyPresetToInputs, readControls, syncControlLabels, updateControlOutputs } from './style-controls.js';

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
  profileDialog: $('#profileDialog'),
  logoutButton: $('#logoutButton'),
};

let styleConfig = fallbackStyleConfig;
let profiles = loadProfiles();
let selectedProfileId = loadSelectedProfileId(profiles[0]?.id);
let uiState = loadUiState();
let lastRequest = null;
let previousOutputs = [];
let controlsDirty = false;

function persistState() {
  saveProfiles(profiles);
  saveSelectedProfileId(selectedProfileId);
  saveUiState(uiState);
}

function currentProfile() {
  return profiles.find((profile) => profile.id === selectedProfileId) || profiles[0];
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

async function loadStyleConfig() {
  try {
    const response = await fetch('/app/style-config.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    styleConfig = await response.json();
  } catch {
    styleConfig = fallbackStyleConfig;
  }
}

function renderProfiles() {
  if (!profiles.length) profiles = loadProfiles();
  if (!profiles.some((profile) => profile.id === selectedProfileId)) selectedProfileId = profiles[0]?.id;

  elements.profileSelect.innerHTML = '';
  for (const profile of profiles) {
    const option = document.createElement('option');
    option.value = profile.id;
    option.textContent = profile.name;
    option.selected = profile.id === selectedProfileId;
    elements.profileSelect.append(option);
  }

  renderProfileSummary();
  persistState();
}

function renderProfileSummary() {
  const profile = currentProfile();
  if (!profile) return;

  elements.profileSummary.innerHTML = `
    <strong>${escapeHtml(profile.name)}, ${profile.age}</strong><br>
    ${escapeHtml(profile.region || 'США')} • ${escapeHtml(profile.genderVoice || 'естественный голос')}<br>
    ${escapeHtml(profile.personality || 'Характер не указан')}<br>
    <small>${profile.examples?.length || 0} примеров речи</small>`;
}

function applyPreset(presetId, resetDirty = true) {
  const preset = styleConfig.presets[presetId] || Object.values(styleConfig.presets)[0];
  if (!preset) return;

  applyPresetToInputs(styleConfig, presetId);
  uiState.presetId = presetId;
  controlsDirty = false;
  if (resetDirty) previousOutputs = [];
  updateControlOutputs(styleConfig);
  persistState();
  elements.preset.value = uiState.presetId;
}

function renderPresets() {
  elements.preset.innerHTML = '';
  for (const [id, preset] of Object.entries(styleConfig.presets)) {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = preset.label;
    elements.preset.append(option);
  }

  if (!styleConfig.presets[uiState.presetId]) {
    uiState.presetId = Object.keys(styleConfig.presets)[0] || 'casual_dm';
  }

  elements.priority.value = uiState.priority || 'settings';
  applyPreset(uiState.presetId, false);
}

function currentControls() {
  return readControls();
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

async function loadModels() {
  try {
    const data = await apiFetch('/api/models');
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
    // Keep fallback models.
  }
}

async function checkConnection(showSuccess = false) {
  setConnection('', 'Проверяю...');

  try {
    const health = await apiFetch('/api/health');
    if (!health.qwen) throw new Error(health.upstreamError || 'Qwen API не отвечает.');

    setConnection('ok', 'Сессия активна');
    if (showSuccess) showMessage('Gateway и Qwen доступны.');
    await loadModels();
    return true;
  } catch (error) {
    if (error.status === 401) {
      setConnection('error', 'Нужна привязка');
      showMessage('Сессия отсутствует или истекла. Откройте свежую ссылку /connect с компьютера, где запущен переводчик.', 'error');
    } else {
      setConnection('error', 'Ошибка');
      if (showSuccess) showMessage(error.message, 'error');
    }
    return false;
  }
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
    const result = await apiFetch('/api/translate', {
      method: 'POST',
      body: JSON.stringify(request),
    });

    elements.resultText.textContent = result.text;
    elements.resultModel.textContent = result.model;
    elements.resultCard.classList.remove('hidden');
    previousOutputs = [result.text, ...previousOutputs.filter((item) => item !== result.text)].slice(0, 5);
    lastRequest = { ...request, controls: request.controls };
    controlsDirty = false;
    updateControlOutputs(styleConfig);
    setConnection('ok', 'Сессия активна');
  } catch (error) {
    showMessage(error.message, 'error');
    setConnection('error', error.status === 401 ? 'Нужна привязка' : 'Ошибка');
  } finally {
    setBusy(false);
  }
}

function updatePresetDirtyMarker() {
  elements.presetDirty?.classList.toggle('hidden', !controlsDirty);
}

function openProfileDialog(profile = null, duplicate = false) {
  const source = profile ? structuredClone(profile) : createBlankProfile();
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
    const payload = JSON.parse(await file.text());
    profiles = prepareImportedProfiles(payload);
    selectedProfileId = profiles[0].id;
    renderProfiles();
    showMessage(`Импортировано профилей: ${profiles.length}.`);
  } catch (error) {
    showMessage(`Ошибка импорта: ${error.message}`, 'error');
  }
}

async function logout() {
  try {
    await apiFetch('/api/session/logout', { method: 'POST' });
  } catch {
    // Ignore logout failures and clear local session artifacts anyway.
  }

  clearSessionArtifacts();
  location.assign('/connect');
}

function bindEvents() {
  elements.profileSelect.addEventListener('change', () => {
    selectedProfileId = elements.profileSelect.value;
    renderProfileSummary();
    persistState();
  });

  elements.preset.addEventListener('change', () => applyPreset(elements.preset.value));
  elements.priority.addEventListener('change', () => {
    uiState.priority = elements.priority.value;
    persistState();
  });
  elements.sourceText.addEventListener('input', () => {
    elements.charCount.textContent = elements.sourceText.value.length;
  });
  elements.sourceText.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.key === 'Enter') translate('translate');
  });
  elements.translate.addEventListener('click', () => translate('translate'));
  elements.logoutButton.addEventListener('click', logout);
  document.getElementById('connectionButton').addEventListener('click', () => checkConnection(true));
  document.getElementById('newProfile').addEventListener('click', () => openProfileDialog());
  document.getElementById('editProfile').addEventListener('click', () => openProfileDialog(currentProfile()));
  document.getElementById('duplicateProfile').addEventListener('click', () => openProfileDialog(currentProfile(), true));
  document.getElementById('profileForm').addEventListener('submit', saveProfileFromForm);
  document.getElementById('deleteProfile').addEventListener('click', deleteCurrentProfile);
  document.getElementById('exportProfiles').addEventListener('click', exportProfiles);
  document.getElementById('importProfiles').addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (file) importProfiles(file);
    event.target.value = '';
  });

  document.getElementById('regenerateResult').addEventListener('click', () => translate('alternative'));
  document.getElementById('shorterResult').addEventListener('click', () => translate('shorter'));
  document.getElementById('softerResult').addEventListener('click', () => translate('softer'));
  document.getElementById('bolderResult').addEventListener('click', () => translate('bolder'));
  document.getElementById('moreVulgarResult').addEventListener('click', () => translate('more_vulgar'));
  document.getElementById('copyResult').addEventListener('click', async () => {
    await navigator.clipboard.writeText(elements.resultText.textContent);
    showMessage('Скопировано.');
  });

  for (const id of CONTROL_IDS) {
    document.getElementById(id)?.addEventListener('input', () => {
      controlsDirty = true;
      updateControlOutputs(styleConfig);
      updatePresetDirtyMarker();
    });
    document.querySelector(`[data-control-help="${id}"]`)?.addEventListener('click', (event) => {
      event.currentTarget.classList.toggle('active');
    });
  }

  document.querySelectorAll('.dialog-close').forEach((button) => {
    button.addEventListener('click', () => button.closest('dialog').close());
  });
}

async function init() {
  purgeLegacySecrets();
  hydrateCsrfToken();
  await loadStyleConfig();
  renderProfiles();
  renderPresets();
  syncControlLabels(styleConfig);
  updateControlOutputs(styleConfig);
  updatePresetDirtyMarker();
  bindEvents();
  elements.charCount.textContent = elements.sourceText.value.length;
  await checkConnection(false);
}

init();
